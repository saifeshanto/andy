import { formatRM } from '@andy/shared';
import { audit } from '../../core/audit.js';
import { db } from '../../core/db.js';
import { logger } from '../../core/logger.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { activateFromOrder } from '../membership/membership.service.js';
import { queueEmail } from '../notifications/index.js';
import type { PaymentResult } from './providers/index.js';

export type ProcessOutcome = 'PAID' | 'ALREADY_PAID' | 'NOT_PAID' | 'UNKNOWN_PAYMENT' | 'AMOUNT_MISMATCH';

/**
 * Applies a verified gateway result. Safe to call any number of times for the same payment:
 * the payment row is locked, and a PAID payment is never processed again.
 * The caller must have verified the signature or fetched the result from the gateway itself.
 */
export async function applyPaymentResult(provider: string, result: PaymentResult, source: 'callback' | 'requery'): Promise<ProcessOutcome> {
  return db().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM Payment WHERE provider = ${provider} AND providerRef = ${result.providerRef} FOR UPDATE`;
    const id = rows[0]?.id;
    if (!id) {
      logger.warn({ provider, ref: result.providerRef }, 'Callback for an unknown payment');
      return 'UNKNOWN_PAYMENT';
    }
    const payment = await tx.payment.findUniqueOrThrow({ where: { id }, include: { order: { include: { items: true } } } });
    if (payment.status === 'PAID') return 'ALREADY_PAID';
    if (!result.paid) return 'NOT_PAID';

    if (result.amountSen !== payment.amountSen) {
      await tx.payment.update({ where: { id }, data: { failureCode: 'AMOUNT_MISMATCH', raw: result.raw as Prisma.InputJsonValue } });
      await audit({ actorId: null, action: 'payment.amount_mismatch', entityType: 'Payment', entityId: id, after: { expected: payment.amountSen, got: result.amountSen, source } }, tx);
      logger.error({ paymentId: id.toString(), expected: payment.amountSen, got: result.amountSen }, 'Payment amount mismatch; not activating');
      return 'AMOUNT_MISMATCH';
    }

    const paidAt = result.paidAt ?? new Date();
    await tx.payment.update({ where: { id }, data: { status: 'PAID', paidAt, raw: result.raw as Prisma.InputJsonValue, failureCode: null } });
    // A payment can arrive after the order expired: money was taken, so honour it.
    const order = await tx.order.update({ where: { id: payment.orderId }, data: { status: 'PAID', paidAt } });
    await audit({ actorId: null, action: 'payment.paid', entityType: 'Payment', entityId: id, after: { orderNo: order.publicNo, amount: formatRM(payment.amountSen), source } }, tx);

    if (order.type === 'MEMBERSHIP') {
      const item = payment.order.items.find((i) => i.itemType === 'MEMBERSHIP');
      if (!item) throw new Error(`Membership order ${order.publicNo} has no membership item`);
      await activateFromOrder(tx, order, Number(item.refId), paidAt);
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
    await queueEmail(
      user.email,
      'paymentReceipt',
      { name: user.fullName, orderNo: order.publicNo, description: payment.order.items.map((i) => i.titleSnapshot).join(', '), amount: formatRM(payment.amountSen), paidAt },
      tx,
    );
    return 'PAID';
  });
}
