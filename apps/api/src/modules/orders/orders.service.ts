import { formatRM } from '@andy/shared';
import { env } from '../../config/env.js';
import { audit } from '../../core/audit.js';
import { publicId } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { activePlan, assertCanPurchase } from '../membership/membership.service.js';
import { activeProviderName, getProvider } from '../payments/providers/index.js';

/** Unpaid checkouts younger than this are reused instead of creating a second bill. */
const REUSE_PENDING_MS = 30 * 60_000;

const orderNo = () => `AAC${publicId(9).toUpperCase()}`;

function publicApiBase(): string {
  return (env().PUBLIC_API_URL ?? env().APP_URL).replace(/\/$/, '');
}

/**
 * Creates a membership order and a gateway bill, and returns where to send the customer.
 * The membership is only activated later, by a verified gateway callback (never by the browser).
 */
export async function startMembershipCheckout(userId: bigint): Promise<{ orderNo: string; checkoutUrl: string }> {
  const providerName = activeProviderName();
  const provider = getProvider(providerName); // fails fast with PAYMENTS_NOT_CONFIGURED
  await assertCanPurchase(userId);
  const plan = await activePlan();
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });

  const recent = await db().payment.findFirst({
    where: {
      provider: providerName,
      status: 'PENDING',
      checkoutUrl: { not: null },
      createdAt: { gt: new Date(Date.now() - REUSE_PENDING_MS) },
      order: { userId, type: 'MEMBERSHIP', status: 'PENDING_PAYMENT', totalSen: plan.priceSen },
    },
    include: { order: true },
    orderBy: { id: 'desc' },
  });
  if (recent?.checkoutUrl) return { orderNo: recent.order.publicNo, checkoutUrl: recent.checkoutUrl };

  // SST / tax handling waits on OPEN-35; taxSen stays 0 until confirmed.
  const { order, payment } = await db().$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        publicNo: orderNo(),
        userId,
        type: 'MEMBERSHIP',
        subtotalSen: plan.priceSen,
        totalSen: plan.priceSen,
        items: {
          create: { itemType: 'MEMBERSHIP', refId: String(plan.id), titleSnapshot: plan.name, unitPriceSen: plan.priceSen, qty: 1, lineTotalSen: plan.priceSen },
        },
      },
    });
    const payment = await tx.payment.create({ data: { orderId: order.id, provider: providerName, amountSen: order.totalSen } });
    await audit({ actorId: userId, action: 'order.created', entityType: 'Order', entityId: order.id, after: { orderNo: order.publicNo, total: formatRM(order.totalSen) } }, tx);
    return { order, payment };
  });

  try {
    const base = publicApiBase();
    const created = await provider.createPayment({
      orderNo: order.publicNo,
      amountSen: order.totalSen,
      description: `${plan.name} (${order.publicNo})`,
      customer: { name: user.fullName, email: user.email },
      callbackUrl: `${base}/api/v1/payments/webhook/${providerName}`,
      redirectUrl: `${base}/api/v1/payments/return/${providerName}`,
    });
    await db().payment.update({
      where: { id: payment.id },
      data: { providerRef: created.providerRef, checkoutUrl: created.checkoutUrl, status: 'PENDING' },
    });
    return { orderNo: order.publicNo, checkoutUrl: created.checkoutUrl };
  } catch (err) {
    logger.error({ err, orderNo: order.publicNo }, 'Gateway refused to create a bill');
    await db().$transaction([
      db().payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureCode: 'CREATE_FAILED' } }),
      db().order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } }),
    ]);
    throw new AppError('PAYMENT_GATEWAY_ERROR', 502, 'We could not reach the payment gateway. Please try again in a few minutes.');
  }
}

export function presentOrder(o: {
  publicNo: string;
  type: string;
  status: string;
  totalSen: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
  items: { titleSnapshot: string; qty: number; unitPriceSen: number; lineTotalSen: number }[];
}) {
  return {
    orderNo: o.publicNo,
    type: o.type,
    status: o.status,
    totalSen: o.totalSen,
    currency: o.currency,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    items: o.items.map((i) => ({ title: i.titleSnapshot, qty: i.qty, unitPriceSen: i.unitPriceSen, lineTotalSen: i.lineTotalSen })),
  };
}
