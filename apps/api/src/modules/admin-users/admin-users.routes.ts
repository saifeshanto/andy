import { Router } from 'express';
import { z } from 'zod';
import { audit, requestIp } from '../../core/audit.js';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const adminUsersRouter = Router();
adminUsersRouter.use('/admin/users', requireAuth, requirePermission('admin.access'));

const ListQuery = PaginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED']).optional(),
  role: z.string().max(60).optional(),
});

const PublicIdParam = z.object({ publicId: z.string().regex(/^[A-Za-z0-9]{8,24}$/) });

const userSelect = {
  id: true,
  publicId: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { key: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const present = (u: UserRow) => ({
  id: u.publicId,
  email: u.email,
  fullName: u.fullName,
  phone: u.phone,
  status: u.status,
  emailVerified: !!u.emailVerifiedAt,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  roles: u.roles.map((r) => r.role.key),
});

async function findUser(publicId: string) {
  const user = await db().user.findUnique({ where: { publicId }, select: userSelect });
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');
  return user;
}

adminUsersRouter.get('/admin/users', requirePermission('users.read'), async (req, res) => {
  const query = ListQuery.parse(req.query);
  const where: Prisma.UserWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { roles: { some: { role: { key: query.role } } } } : {}),
    ...(query.q
      ? { OR: [{ email: { contains: query.q } }, { fullName: { contains: query.q } }, { phone: { contains: query.q } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db().user.findMany({ where, select: userSelect, orderBy: { id: 'desc' }, ...pageArgs(query) }),
    db().user.count({ where }),
  ]);
  res.json({ data: rows.map(present), meta: pageMeta(query, total) });
});

adminUsersRouter.get('/admin/users/:publicId', requirePermission('users.read'), async (req, res) => {
  const user = await findUser(PublicIdParam.parse(req.params).publicId);
  res.json({ data: present(user) });
});

const StatusBody = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });

async function setStatus(req: Parameters<Parameters<typeof adminUsersRouter.post>[1]>[0], status: 'SUSPENDED' | 'ACTIVE') {
  const actor = currentUser(req);
  const { reason } = StatusBody.parse(req.body);
  const user = await findUser(PublicIdParam.parse(req.params).publicId);
  if (user.id === actor.id) throw new AppError('CANNOT_CHANGE_SELF', 400, 'You cannot change your own account status');
  if (status === 'ACTIVE' && user.status !== 'SUSPENDED') throw new AppError('NOT_SUSPENDED', 400, 'User is not suspended');
  if (status === 'SUSPENDED' && user.status === 'SUSPENDED') throw new AppError('ALREADY_SUSPENDED', 400, 'User is already suspended');
  const next = status === 'ACTIVE' ? (user.emailVerifiedAt ? 'ACTIVE' : 'PENDING_VERIFICATION') : 'SUSPENDED';
  return db().$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: user.id }, data: { status: next }, select: userSelect });
    if (status === 'SUSPENDED') {
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(
      {
        actorId: actor.id,
        action: status === 'SUSPENDED' ? 'user.suspended' : 'user.unsuspended',
        entityType: 'User',
        entityId: user.id,
        before: { status: user.status },
        after: { status: next, reason },
        ip: requestIp(req),
      },
      tx,
    );
    return present(updated);
  });
}

adminUsersRouter.post('/admin/users/:publicId/suspend', requirePermission('users.manage'), async (req, res) => {
  res.json({ data: await setStatus(req, 'SUSPENDED') });
});

adminUsersRouter.post('/admin/users/:publicId/unsuspend', requirePermission('users.manage'), async (req, res) => {
  res.json({ data: await setStatus(req, 'ACTIVE') });
});

const RolesBody = z.object({ roles: z.array(z.string().max(60)).max(20) });

/** Replaces a user's platform roles. Keeps at least one Super Admin in the system. */
adminUsersRouter.put('/admin/users/:publicId/roles', requirePermission('roles.assign'), async (req, res) => {
  const actor = currentUser(req);
  const { roles: keys } = RolesBody.parse(req.body);
  const user = await findUser(PublicIdParam.parse(req.params).publicId);
  const roles = await db().role.findMany({ where: { key: { in: keys }, scope: 'PLATFORM' } });
  if (roles.length !== new Set(keys).size) throw new AppError('UNKNOWN_ROLE', 400, 'One or more roles do not exist');

  const result = await db().$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: user.id } });
    if (roles.length) {
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: user.id, roleId: r.id, grantedById: actor.id })) });
    }
    const superAdmins = await tx.userRole.count({ where: { role: { key: 'SUPER_ADMIN' } } });
    if (superAdmins === 0) throw new AppError('LAST_SUPER_ADMIN', 400, 'At least one Super Admin must remain');
    await audit(
      {
        actorId: actor.id,
        action: 'user.roles_changed',
        entityType: 'User',
        entityId: user.id,
        before: { roles: user.roles.map((r) => r.role.key) },
        after: { roles: keys },
        ip: requestIp(req),
      },
      tx,
    );
    return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect });
  });
  res.json({ data: present(result) });
});
