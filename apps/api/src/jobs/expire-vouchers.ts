import type { Job } from './types.js';

/**
 * Marks claimed vouchers past their expiry as EXPIRED, and ends offers whose claim period is over.
 * Screens already treat an overdue voucher as expired, so this only tidies the stored status.
 */
export const expireVouchersJob: Job = {
  name: 'expire-vouchers',
  staleAfterMinutes: 10,
  async run({ db, now }) {
    const vouchers = await db.voucher.updateMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, data: { status: 'EXPIRED' } });
    const offers = await db.voucherCampaign.updateMany({ where: { status: { in: ['APPROVED', 'PAUSED'] }, claimEndAt: { lte: now } }, data: { status: 'ENDED' } });
    return { processed: vouchers.count + offers.count };
  },
};
