import { logger } from '../core/logger.js';
import { applyPaymentResult, getProvider } from '../modules/payments/index.js';
import type { Job } from './types.js';

/** Asks the gateway about payments still PENDING after 10 minutes (missed callbacks). Looks back 3 days. */
export const reconcilePaymentsJob: Job = {
  name: 'reconcile-payments',
  staleAfterMinutes: 10,
  async run({ db, now }) {
    const pending = await db.payment.findMany({
      where: {
        status: 'PENDING',
        providerRef: { not: null },
        createdAt: { lt: new Date(now.getTime() - 10 * 60_000), gt: new Date(now.getTime() - 3 * 24 * 60 * 60_000) },
      },
      orderBy: { id: 'asc' },
      take: 20,
    });
    let processed = 0;
    for (const p of pending) {
      try {
        const result = await getProvider(p.provider).queryStatus(p.providerRef!);
        await applyPaymentResult(p.provider, result, 'requery');
        processed++;
      } catch (err) {
        logger.warn({ err, paymentId: p.id.toString() }, 'Reconcile failed for payment');
      }
    }
    return { processed };
  },
};
