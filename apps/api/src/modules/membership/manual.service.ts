import { formatRM } from '@andy/shared';
import { audit } from '../../core/audit.js';
import { publicId } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { queueEmail } from '../notifications/index.js';
import { MANUAL_PROVIDER } from '../payments/providers/index.js';
import { activateFromOrder, activePlan, assertCanPurchase } from './membership.service.js';

/**
 * Records a membership paid outside the website (cash, bank transfer) and activates it, while the
 * online gateway is switched off. Uses the same order, payment and activation path as an online payment,
 * so reports and history treat both alike. The amount is always the current plan price.
 * The reference (e.g. bank transfer ref) must be unique, which stops the same payment being recorded twice.
 */
export async function recordManualMembershipPayment(
  actor: { id: bigint; ip: string | null },
  userPublicId: string,
  input: { reference: string; note?: string },
): Promise<{ orderNo: string }> {
  const user = await db().user.findUnique({ where: { publicId: userPublicId } });
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');
  if (user.status === 'SUSPENDED') throw new AppError('USER_SUSPENDED', 409, 'This account is suspended');
  await assertCanPurchase(user.id);
  const plan = await activePlan();
  const reference = input.reference.trim();
  if (await db().payment.findUnique({ where: { provider_providerRef: { provider: MANUAL_PROVIDER, providerRef: reference } } })) {
    throw new AppError('DUPLICATE_REFERENCE', 409, 'A payment with this reference has already been recorded');
  }
  const paidAt = new Date();

  const order = await db().$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        publicNo: `AAC${publicId(9).toUpperCase()}`,
        userId: user.id,
        type: 'MEMBERSHIP',
        status: 'PAID',
        paidAt,
        subtotalSen: plan.priceSen,
        totalSen: plan.priceSen,
        items: {
          create: { itemType: 'MEMBERSHIP', refId: String(plan.id), titleSnapshot: plan.name, unitPriceSen: plan.priceSen, qty: 1, lineTotalSen: plan.priceSen },
        },
      },
    });
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: MANUAL_PROVIDER,
        providerRef: reference,
        amountSen: plan.priceSen,
        status: 'PAID',
        paidAt,
        raw: { recordedBy: actor.id.toString(), note: input.note ?? null },
      },
    });
    await activateFromOrder(tx, order, plan.id, paidAt);
    await audit(
      {
        actorId: actor.id,
        action: 'membership.manualPaymentRecorded',
        entityType: 'Order',
        entityId: order.id,
        after: { orderNo: order.publicNo, user: user.email, amount: formatRM(plan.priceSen), reference, note: input.note ?? null },
        ip: actor.ip,
      },
      tx,
    );
    await queueEmail(user.email, 'paymentReceipt', { name: user.fullName, orderNo: order.publicNo, description: plan.name, amount: formatRM(plan.priceSen), paidAt }, tx);
    return order;
  });
  return { orderNo: order.publicNo };
}
