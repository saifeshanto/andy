import { queueEmail } from '../modules/notifications/index.js';
import { getSetting } from '../modules/settings/index.js';
import { DAY_MS } from '../modules/membership/dates.js';
import type { Job } from './types.js';

/**
 * Sends renewal reminders on the days set in `membership.reminderDays` (OPEN-03).
 * Each (membership, day) pair is sent at most once. Members who already renewed are skipped.
 * Reminders only go out within 2 days of their target, so changing the setting never sends a backlog.
 */
export const membershipRemindersJob: Job = {
  name: 'membership-reminders',
  staleAfterMinutes: 15,
  async run({ db, now }) {
    const days = await getSetting(db, 'membership.reminderDays');
    let processed = 0;
    for (const offset of days) {
      // Target: endAt - offset days == now (allow a 2-day window for missed runs).
      const from = new Date(now.getTime() + offset * DAY_MS - 2 * DAY_MS);
      const to = new Date(now.getTime() + offset * DAY_MS);
      const terms = await db.membership.findMany({
        where: {
          status: offset >= 0 ? 'ACTIVE' : { in: ['ACTIVE', 'EXPIRED'] },
          endAt: { gt: from, lte: to },
          reminders: { none: { offsetDays: offset } },
        },
        include: { plan: true },
        take: 100,
      });
      for (const t of terms) {
        // Skip if a later term already exists (they renewed).
        const later = await db.membership.count({ where: { userId: t.userId, status: 'ACTIVE', endAt: { gt: t.endAt } } });
        const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
        await db.$transaction(async (tx) => {
          await tx.membershipReminder.create({ data: { membershipId: t.id, offsetDays: offset } });
          if (!later && user.status !== 'SUSPENDED') {
            await queueEmail(user.email, 'membershipReminder', { name: user.fullName, endAt: t.endAt, expired: offset < 0 }, tx);
          }
        });
        processed++;
      }
    }
    return { processed };
  },
};
