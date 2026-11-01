import { audit } from '../core/audit.js';
import type { Job } from './types.js';

/** Marks memberships past their end date as EXPIRED. Grace periods wait on OPEN-03. */
export const expireMembershipsJob: Job = {
  name: 'expire-memberships',
  staleAfterMinutes: 10,
  async run({ db, now }) {
    const due = await db.membership.findMany({ where: { status: 'ACTIVE', endAt: { lte: now } }, select: { id: true }, take: 200 });
    for (const m of due) {
      await db.$transaction(async (tx) => {
        const updated = await tx.membership.updateMany({ where: { id: m.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } });
        if (updated.count === 0) return;
        await tx.membershipEvent.create({ data: { membershipId: m.id, type: 'EXPIRED' } });
        await audit({ actorId: null, action: 'membership.expired', entityType: 'Membership', entityId: m.id }, tx);
      });
    }
    return { processed: due.length };
  },
};
