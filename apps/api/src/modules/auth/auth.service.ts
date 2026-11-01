import bcrypt from 'bcryptjs';
import type { AuthUser, RegisterInput } from '@andy/shared';
import { env } from '../../config/env.js';
import { audit } from '../../core/audit.js';
import { publicId, randomToken, sha256 } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { signAccessToken } from '../../core/tokens.js';
import { queueEmail } from '../notifications/index.js';

const BCRYPT_COST = 12;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60_000;
const PASSWORD_RESET_TTL_MS = 60 * 60_000;
/** Two tabs refreshing at once is normal; only treat reuse as theft after this grace window. */
const REFRESH_REUSE_GRACE_MS = 10_000;

// Compared against when the email is unknown, so login timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_COST);

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

export async function getAuthUser(userId: bigint): Promise<AuthUser> {
  const user = await db().user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user) throw new AppError('UNAUTHENTICATED', 401, 'Please sign in');
  const permissions = new Set<string>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  return {
    id: user.publicId,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    status: user.status,
    emailVerified: !!user.emailVerifiedAt,
    roles: user.roles.map((r) => r.role.key),
    permissions: [...permissions].sort(),
  };
}

async function createSession(userId: bigint, meta: ClientMeta, family = randomToken(15)): Promise<Session> {
  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000);
  await db().refreshToken.create({
    data: {
      userId,
      family,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });
  return { accessToken: await signAccessToken(userId), refreshToken, refreshExpiresAt, user: await getAuthUser(userId) };
}

async function createVerificationToken(
  userId: bigint,
  type: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
  ttlMs: number,
  tx: Parameters<Parameters<ReturnType<typeof db>['$transaction']>[0]>[0],
): Promise<string> {
  // Only the newest link of each type works.
  await tx.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken();
  await tx.verificationToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

export async function register(input: RegisterInput, meta: ClientMeta): Promise<Session> {
  const existing = await db().user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError('EMAIL_TAKEN', 409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await db().$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { publicId: publicId(), email: input.email, fullName: input.fullName, phone: input.phone ?? null, passwordHash },
    });
    const token = await createVerificationToken(created.id, 'EMAIL_VERIFY', EMAIL_VERIFY_TTL_MS, tx);
    await queueEmail(created.email, 'verifyEmail', { name: created.fullName, token }, tx);
    await audit({ actorId: created.id, action: 'user.registered', entityType: 'User', entityId: created.id, ip: meta.ip }, tx);
    return created;
  });
  return createSession(user.id, meta);
}

export async function login(email: string, password: string, meta: ClientMeta): Promise<Session> {
  const user = await db().user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect');
  if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED', 403, 'This account is suspended');
  await db().user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return createSession(user.id, meta);
}

/** Rotates a refresh token. Reusing an already-rotated token revokes the whole session family. */
export async function refresh(rawToken: string | undefined, meta: ClientMeta): Promise<Session> {
  const invalid = () => new AppError('SESSION_EXPIRED', 401, 'Your session has ended. Please sign in again');
  if (!rawToken) throw invalid();
  const token = await db().refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { user: true } });
  if (!token || token.revokedAt || token.expiresAt <= new Date()) throw invalid();

  const claimed = await db().refreshToken.updateMany({
    where: { id: token.id, replacedAt: null, revokedAt: null },
    data: { replacedAt: new Date() },
  });
  if (claimed.count === 0) {
    const latest = await db().refreshToken.findUnique({ where: { id: token.id } });
    const withinGrace = latest?.replacedAt && Date.now() - latest.replacedAt.getTime() < REFRESH_REUSE_GRACE_MS;
    if (!withinGrace) {
      await db().refreshToken.updateMany({ where: { family: token.family, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit({ actorId: token.userId, action: 'auth.refresh_reuse_detected', entityType: 'User', entityId: token.userId, ip: meta.ip });
      logger.warn({ userId: token.userId.toString() }, 'Refresh token reuse detected; session family revoked');
    }
    throw invalid();
  }
  if (token.user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED', 403, 'This account is suspended');
  return createSession(token.userId, meta, token.family);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const token = await db().refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (token) await db().refreshToken.updateMany({ where: { family: token.family, revokedAt: null }, data: { revokedAt: new Date() } });
}

async function useToken(rawToken: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
  const token = await db().verificationToken.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { user: true } });
  if (!token || token.type !== type || token.usedAt || token.expiresAt <= new Date()) {
    throw new AppError('INVALID_TOKEN', 400, 'This link is invalid or has expired. Please request a new one');
  }
  return token;
}

/** Grants Super Admin to BOOTSTRAP_ADMIN_EMAIL on verification, only while no Super Admin exists. */
async function maybeBootstrapAdmin(userId: bigint, email: string, tx: Parameters<Parameters<ReturnType<typeof db>['$transaction']>[0]>[0]) {
  const bootstrap = env().BOOTSTRAP_ADMIN_EMAIL;
  if (!bootstrap || bootstrap !== email) return;
  const role = await tx.role.findUnique({ where: { key: 'SUPER_ADMIN' } });
  if (!role) return;
  const existing = await tx.userRole.count({ where: { roleId: role.id } });
  if (existing > 0) return;
  await tx.userRole.create({ data: { userId, roleId: role.id } });
  await audit({ actorId: null, action: 'role.bootstrap_super_admin', entityType: 'User', entityId: userId, after: { role: 'SUPER_ADMIN' } }, tx);
  logger.info({ userId: userId.toString() }, 'Bootstrap Super Admin granted');
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const token = await useToken(rawToken, 'EMAIL_VERIFY');
  await db().$transaction(async (tx) => {
    const used = await tx.verificationToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw new AppError('INVALID_TOKEN', 400, 'This link has already been used');
    await tx.user.update({
      where: { id: token.userId },
      data: {
        emailVerifiedAt: token.user.emailVerifiedAt ?? new Date(),
        ...(token.user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
      },
    });
    await maybeBootstrapAdmin(token.userId, token.user.email, tx);
  });
}

export async function resendVerification(userId: bigint): Promise<void> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) throw new AppError('ALREADY_VERIFIED', 400, 'Your email is already confirmed');
  await db().$transaction(async (tx) => {
    const token = await createVerificationToken(user.id, 'EMAIL_VERIFY', EMAIL_VERIFY_TTL_MS, tx);
    await queueEmail(user.email, 'verifyEmail', { name: user.fullName, token }, tx);
  });
}

/** Always succeeds from the caller's view, so it cannot be used to discover registered emails. */
export async function forgotPassword(email: string): Promise<void> {
  const user = await db().user.findUnique({ where: { email } });
  if (!user || user.status === 'SUSPENDED') return;
  await db().$transaction(async (tx) => {
    const token = await createVerificationToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS, tx);
    await queueEmail(user.email, 'passwordReset', { name: user.fullName, token }, tx);
  });
}

export async function resetPassword(rawToken: string, password: string, meta: ClientMeta): Promise<void> {
  const token = await useToken(rawToken, 'PASSWORD_RESET');
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await db().$transaction(async (tx) => {
    const used = await tx.verificationToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw new AppError('INVALID_TOKEN', 400, 'This link has already been used');
    await tx.user.update({
      where: { id: token.userId },
      // Following the emailed link proves the user owns the inbox.
      data: {
        passwordHash,
        emailVerifiedAt: token.user.emailVerifiedAt ?? new Date(),
        ...(token.user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
      },
    });
    await tx.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await queueEmail(token.user.email, 'passwordChanged', { name: token.user.fullName }, tx);
    await audit({ actorId: token.userId, action: 'auth.password_reset', entityType: 'User', entityId: token.userId, ip: meta.ip }, tx);
  });
}
