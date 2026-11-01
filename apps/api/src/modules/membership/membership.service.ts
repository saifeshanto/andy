import { formatRM } from '@andy/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { audit } from '../../core/audit.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { queueEmail } from '../notifications/index.js';
import { getSetting } from '../settings/index.js';
import { addMonths } from './dates.js';

type Tx = Prisma.TransactionClient;

export const DEFAULT_PLAN = { code: 'ANNUAL', name: 'Annual membership', priceSen: 39900, durationMonths: 12 } as const;

/** Creates the RM399 / 12-month plan if no plan exists yet. Runs at startup. */
export async function ensureDefaultPlan(client: PrismaClient): Promise<void> {
  if ((await client.membershipPlan.count()) === 0) await client.membershipPlan.create({ data: DEFAULT_PLAN });
}

export async function activePlan(client: PrismaClient | Tx = db()) {
  const plan = await client.membershipPlan.findFirst({ where: { isActive: true }, orderBy: { id: 'desc' } });
  if (!plan) throw new AppError('NO_MEMBERSHIP_PLAN', 503, 'Membership is not available right now');
  return plan;
}

/** The membership in force at `at` (ACTIVE and inside its dates), if any. */
export function currentMembership(userId: bigint, at = new Date(), client: PrismaClient | Tx = db()) {
  return client.membership.findFirst({
    where: { userId, status: 'ACTIVE', startAt: { lte: at }, endAt: { gt: at } },
    orderBy: { endAt: 'desc' },
    include: { plan: true },
  });
}

/** The latest ACTIVE term, including one that starts in the future after an early renewal. */
function latestActiveTerm(userId: bigint, at: Date, client: PrismaClient | Tx) {
  return client.membership.findFirst({ where: { userId, status: 'ACTIVE', endAt: { gt: at } }, orderBy: { endAt: 'desc' } });
}

/**
 * Whether the user may start a membership payment now. Early renewal needs the
 * `membership.renewalStartsFrom` setting (OPEN-02); until it is set, members with time left cannot renew.
 */
export async function assertCanPurchase(userId: bigint): Promise<{ renewal: boolean }> {
  const term = await latestActiveTerm(userId, new Date(), db());
  if (!term) return { renewal: false };
  const rule = await getSetting(db(), 'membership.renewalStartsFrom');
  if (!rule) throw new AppError('RENEWAL_NOT_AVAILABLE', 409, 'Your membership is active. Early renewal is not open yet.');
  return { renewal: true };
}

/**
 * Activates or extends a membership for a paid order. Idempotent: an order activates at most one
 * membership (unique sourceOrderId). Called inside the payment transaction.
 */
export async function activateFromOrder(
  tx: Tx,
  order: { id: bigint; userId: bigint; publicNo: string; totalSen: number },
  planId: number,
  paidAt: Date,
): Promise<void> {
  const already = await tx.membership.findUnique({ where: { sourceOrderId: order.id } });
  if (already) return;

  const plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
  const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
  const previous = await latestActiveTerm(order.userId, paidAt, tx);

  let startAt = paidAt;
  let note: string | undefined;
  if (previous) {
    const rule = await getSetting(tx, 'membership.renewalStartsFrom');
    if (rule === 'PAYMENT_DATE') {
      await tx.membership.update({ where: { id: previous.id }, data: { status: 'EXPIRED', endAt: paidAt } });
      await tx.membershipEvent.create({ data: { membershipId: previous.id, type: 'EXPIRED', note: `Replaced by renewal order ${order.publicNo}` } });
    } else {
      // CURRENT_END, or a payment that arrived while the rule was unset: never take away time already paid for.
      startAt = previous.endAt;
      if (!rule) note = 'Renewal rule not configured; new term starts at the end of the current one';
    }
  }
  const endAt = addMonths(startAt, plan.durationMonths);
  const renewed = !!previous;

  const membership = await tx.membership.create({
    data: { userId: order.userId, planId: plan.id, status: 'ACTIVE', startAt, endAt, sourceOrderId: order.id },
  });
  await tx.membershipEvent.create({
    data: {
      membershipId: membership.id,
      type: renewed ? 'RENEWED' : 'ACTIVATED',
      note,
      data: { orderNo: order.publicNo, amount: formatRM(order.totalSen) },
    },
  });
  await audit(
    { actorId: null, action: renewed ? 'membership.renewed' : 'membership.activated', entityType: 'Membership', entityId: membership.id, after: { startAt, endAt, orderNo: order.publicNo } },
    tx,
  );
  await queueEmail(user.email, 'membershipActivated', { name: user.fullName, startAt, endAt, renewed }, tx);
  if (note) logger.warn({ orderNo: order.publicNo }, note);
}

export async function getMembershipOverview(userId: bigint) {
  const now = new Date();
  const [current, terms, plan] = await Promise.all([
    currentMembership(userId, now),
    db().membership.findMany({ where: { userId }, orderBy: { startAt: 'desc' }, take: 20, include: { plan: true } }),
    db().membershipPlan.findFirst({ where: { isActive: true }, orderBy: { id: 'desc' } }),
  ]);
  const latest = await latestActiveTerm(userId, now, db());
  const renewalRule = await getSetting(db(), 'membership.renewalStartsFrom');
  return {
    current: current && { status: current.status, startAt: current.startAt, endAt: current.endAt, plan: current.plan.name },
    paidUntil: latest?.endAt ?? null,
    canPurchase: !latest || !!renewalRule,
    plan: plan && { name: plan.name, priceSen: plan.priceSen, durationMonths: plan.durationMonths },
    history: terms.map((t) => ({ status: t.status, startAt: t.startAt, endAt: t.endAt, plan: t.plan.name })),
  };
}
