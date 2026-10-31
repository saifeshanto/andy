import type { Job } from './types.js';

/** Phase 0 test job: proves Hostinger cron can reach the app and write to MariaDB. */
export const heartbeatJob: Job = {
  name: 'heartbeat',
  staleAfterMinutes: 5,
  async run({ db, now }) {
    await db.setting.upsert({
      where: { key: 'system.lastHeartbeatAt' },
      create: { key: 'system.lastHeartbeatAt', value: now.toISOString() },
      update: { value: now.toISOString() },
    });
    return { processed: 1 };
  },
};
