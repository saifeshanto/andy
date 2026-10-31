import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { startMembershipCheckout } from '../orders/orders.service.js';
import { getMembershipOverview } from './membership.service.js';

export const membershipRouter = Router();

membershipRouter.get('/public/membership-plan', async (_req, res) => {
  const plan = await db().membershipPlan.findFirst({ where: { isActive: true }, orderBy: { id: 'desc' } });
  res.json({ data: plan && { name: plan.name, priceSen: plan.priceSen, durationMonths: plan.durationMonths } });
});

membershipRouter.get('/me/membership', requireAuth, async (req, res) => {
  res.json({ data: await getMembershipOverview(currentUser(req).id) });
});

membershipRouter.post('/me/membership/checkout', requireAuth, async (req, res) => {
  res.status(201).json({ data: await startMembershipCheckout(currentUser(req).id) });
});

const AdminQuery = PaginationSchema.extend({
  status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUNDED']).optional(),
  q: z.string().trim().max(100).optional(),
});

membershipRouter.get('/admin/memberships', requireAuth, requirePermission('admin.access', 'memberships.read'), async (req, res) => {
  const q = AdminQuery.parse(req.query);
  const where: Prisma.MembershipWhereInput = {
    ...(q.status ? { status: q.status } : {}),
  };
  if (q.q) {
    const users = await db().user.findMany({ where: { OR: [{ email: { contains: q.q } }, { fullName: { contains: q.q } }] }, select: { id: true }, take: 500 });
    where.userId = { in: users.map((u) => u.id) };
  }
  const [rows, total] = await Promise.all([
    db().membership.findMany({ where, orderBy: { id: 'desc' }, include: { plan: true }, ...pageArgs(q) }),
    db().membership.count({ where }),
  ]);
  const users = await db().user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, publicId: true, email: true, fullName: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({
    data: rows.map((m) => ({
      id: m.id.toString(),
      status: m.status,
      startAt: m.startAt,
      endAt: m.endAt,
      plan: m.plan.name,
      user: { id: byId.get(m.userId)?.publicId, email: byId.get(m.userId)?.email, fullName: byId.get(m.userId)?.fullName },
    })),
    meta: pageMeta(q, total),
  });
});
