import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { presentOrder } from './orders.service.js';

export const ordersRouter = Router();
const OrderNoParam = z.object({ orderNo: z.string().regex(/^[A-Z0-9]{6,24}$/) });

ordersRouter.get('/me/orders', requireAuth, async (req, res) => {
  const q = PaginationSchema.parse(req.query);
  const where = { userId: currentUser(req).id };
  const [rows, total] = await Promise.all([
    db().order.findMany({ where, include: { items: true }, orderBy: { id: 'desc' }, ...pageArgs(q) }),
    db().order.count({ where }),
  ]);
  res.json({ data: rows.map(presentOrder), meta: pageMeta(q, total) });
});

ordersRouter.get('/me/orders/:orderNo', requireAuth, async (req, res) => {
  const { orderNo } = OrderNoParam.parse(req.params);
  const order = await db().order.findUnique({ where: { publicNo: orderNo }, include: { items: true } });
  if (!order || order.userId !== currentUser(req).id) throw new AppError('NOT_FOUND', 404, 'Order not found');
  res.json({ data: presentOrder(order) });
});

const AdminQuery = PaginationSchema.extend({
  status: z.enum(['PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED']).optional(),
  q: z.string().trim().max(100).optional(),
});

ordersRouter.get('/admin/orders', requireAuth, requirePermission('admin.access', 'orders.read'), async (req, res) => {
  const q = AdminQuery.parse(req.query);
  const where: Prisma.OrderWhereInput = { ...(q.status ? { status: q.status } : {}) };
  if (q.q) {
    const users = await db().user.findMany({ where: { OR: [{ email: { contains: q.q } }, { fullName: { contains: q.q } }] }, select: { id: true }, take: 500 });
    where.OR = [{ publicNo: { contains: q.q.toUpperCase() } }, { userId: { in: users.map((u) => u.id) } }];
  }
  const [rows, total] = await Promise.all([
    db().order.findMany({ where, include: { items: true, payments: { orderBy: { id: 'desc' } } }, orderBy: { id: 'desc' }, ...pageArgs(q) }),
    db().order.count({ where }),
  ]);
  const users = await db().user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, publicId: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({
    data: rows.map((o) => ({
      ...presentOrder(o),
      user: { id: byId.get(o.userId)?.publicId, email: byId.get(o.userId)?.email },
      payments: o.payments.map((p) => ({ id: p.id.toString(), provider: p.provider, providerRef: p.providerRef, status: p.status, amountSen: p.amountSen, paidAt: p.paidAt, failureCode: p.failureCode })),
    })),
    meta: pageMeta(q, total),
  });
});
