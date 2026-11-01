import { merchantCan, type MerchantRoleKey } from '@andy/shared';
import type { Merchant, MerchantMember } from '../../generated/prisma/client.js';
import { audit } from '../../core/audit.js';
import { randomToken, sha256 } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { queueEmail } from '../notifications/index.js';

const INVITE_DAYS = 7;

export async function outletOf(merchantId: bigint, outletId: string | null | undefined): Promise<bigint | null | undefined> {
  if (outletId === undefined) return undefined;
  if (outletId === null) return null;
  const outlet = await db().merchantOutlet.findFirst({ where: { id: BigInt(outletId), merchantId } });
  if (!outlet) throw new AppError('OUTLET_NOT_FOUND', 404, 'Outlet not found');
  return outlet.id;
}

/** May `actor` change a seat with role `target`? Owners are never changed here, and nobody changes their own seat. */
function assertCanManageRole(actorRole: MerchantRoleKey, target: MerchantRoleKey) {
  if (target === 'OWNER') throw new AppError('FORBIDDEN', 403, 'The owner cannot be changed here');
  if (target === 'MANAGER' && !merchantCan(actorRole, 'staff.manageManagers')) throw new AppError('FORBIDDEN', 403, 'Only the owner can manage managers');
}

export async function inviteStaff(
  ctx: { merchant: Merchant; seat: MerchantMember; user: { id: bigint } },
  input: { email: string; role: 'MANAGER' | 'CASHIER'; outletId?: string | null },
  ip: string | null,
) {
  assertCanManageRole(ctx.seat.role, input.role);
  const outletId = await outletOf(ctx.merchant.id, input.outletId);
  const existingUser = await db().user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const seat = await db().merchantMember.findUnique({ where: { merchantId_userId: { merchantId: ctx.merchant.id, userId: existingUser.id } } });
    if (seat?.status === 'ACTIVE') throw new AppError('ALREADY_STAFF', 409, 'This person already works at this business');
  }
  const token = randomToken(32);
  const inviter = await db().user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  await db().$transaction(async (tx) => {
    // A new invite replaces any older pending one for the same email.
    await tx.merchantInvite.updateMany({ where: { merchantId: ctx.merchant.id, email: input.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const invite = await tx.merchantInvite.create({
      data: {
        merchantId: ctx.merchant.id,
        email: input.email,
        role: input.role,
        outletId: outletId ?? null,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
        invitedById: ctx.user.id,
      },
    });
    await audit({ actorId: ctx.user.id, action: 'merchant.staffInvited', entityType: 'Merchant', entityId: ctx.merchant.id, after: { email: input.email, role: input.role, inviteId: invite.id.toString() }, ip }, tx);
    await queueEmail(input.email, 'merchantStaffInvite', { merchant: ctx.merchant.name, inviter: inviter.fullName, role: input.role, token, days: INVITE_DAYS }, tx);
  });
}

async function findInvite(token: string) {
  const invite = await db().merchantInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { merchant: true } });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date() || invite.merchant.status !== 'APPROVED') {
    throw new AppError('INVITE_INVALID', 410, 'This invitation is no longer valid. Ask the business to send a new one.');
  }
  return invite;
}

export async function previewInvite(token: string) {
  const invite = await findInvite(token);
  return { merchant: invite.merchant.name, role: invite.role, email: invite.email, expiresAt: invite.expiresAt };
}

export async function acceptInvite(user: { id: bigint; email: string; status: string }, token: string) {
  const invite = await findInvite(token);
  if (invite.email !== user.email.toLowerCase()) {
    throw new AppError('INVITE_EMAIL_MISMATCH', 403, `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`);
  }
  if (user.status !== 'ACTIVE') throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please confirm your email address first');
  return db().$transaction(async (tx) => {
    const { count } = await tx.merchantInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
    if (!count) throw new AppError('INVITE_INVALID', 410, 'This invitation has already been used');
    const existing = await tx.merchantMember.findUnique({ where: { merchantId_userId: { merchantId: invite.merchantId, userId: user.id } } });
    if (existing?.status === 'ACTIVE') throw new AppError('ALREADY_STAFF', 409, 'You already work at this business');
    if (existing?.role === 'OWNER') throw new AppError('ALREADY_STAFF', 409, 'You own this business');
    const data = { role: invite.role, outletId: invite.outletId, status: 'ACTIVE' as const, invitedById: invite.invitedById };
    if (existing) await tx.merchantMember.update({ where: { id: existing.id }, data });
    else await tx.merchantMember.create({ data: { ...data, merchantId: invite.merchantId, userId: user.id } });
    await audit({ actorId: user.id, action: 'merchant.staffJoined', entityType: 'Merchant', entityId: invite.merchantId, after: { role: invite.role } }, tx);
    return { merchantId: invite.merchant.publicId, merchant: invite.merchant.name, role: invite.role };
  });
}

export async function updateStaff(
  ctx: { merchant: Merchant; seat: MerchantMember; user: { id: bigint } },
  memberId: bigint,
  patch: { role?: 'MANAGER' | 'CASHIER'; status?: 'ACTIVE' | 'DISABLED'; outletId?: string | null },
  ip: string | null,
) {
  const target = await db().merchantMember.findFirst({ where: { id: memberId, merchantId: ctx.merchant.id } });
  if (!target) throw new AppError('NOT_FOUND', 404, 'Staff member not found');
  if (target.userId === ctx.user.id) throw new AppError('FORBIDDEN', 403, 'You cannot change your own access');
  assertCanManageRole(ctx.seat.role, target.role);
  if (patch.role) assertCanManageRole(ctx.seat.role, patch.role);
  const outletId = await outletOf(ctx.merchant.id, patch.outletId);
  const updated = await db().merchantMember.update({
    where: { id: target.id },
    data: { ...(patch.role ? { role: patch.role } : {}), ...(patch.status ? { status: patch.status } : {}), ...(outletId !== undefined ? { outletId } : {}) },
  });
  await audit({
    actorId: ctx.user.id,
    action: 'merchant.staffUpdated',
    entityType: 'Merchant',
    entityId: ctx.merchant.id,
    before: { role: target.role, status: target.status, outletId: target.outletId?.toString() ?? null },
    after: { role: updated.role, status: updated.status, outletId: updated.outletId?.toString() ?? null, memberId: target.id.toString() },
    ip,
  });
  return updated;
}

