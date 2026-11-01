import type { Job } from './types.js';

/** Unpaid orders older than 48 hours are marked EXPIRED. A late payment still completes (see payments.service). */
export const expireOrdersJob: Job = {
  name: 'expire-orders',
  staleAfterMinutes: 10,
  async run({ db, now }) {
    const cutoff = new Date(now.getTime() - 48 * 60 * 60_000);
    const orders = await db.order.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } }, select: { id: true }, take: 200 });
    const ids = orders.map((o) => o.id);
    if (!ids.length) return { processed: 0 };
    await db.$transaction([
      db.order.updateMany({ where: { id: { in: ids }, status: 'PENDING_PAYMENT' }, data: { status: 'EXPIRED' } }),
      db.payment.updateMany({ where: { orderId: { in: ids }, status: { in: ['CREATED', 'PENDING'] } }, data: { status: 'EXPIRED' } }),
    ]);
    return { processed: ids.length };
  },
};
