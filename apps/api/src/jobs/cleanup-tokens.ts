import type { Job } from './types.js';

/** Deletes expired refresh and verification tokens older than 7 days past expiry. */
export const cleanupTokensJob: Job = {
  name: 'cleanup-tokens',
  staleAfterMinutes: 10,
  async run({ db, now }) {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const a = await db.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    const b = await db.verificationToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    return { processed: a.count + b.count };
  },
};
