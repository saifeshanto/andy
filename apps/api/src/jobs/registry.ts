import { cleanupTokensJob } from './cleanup-tokens.js';
import { heartbeatJob } from './heartbeat.js';
import { sendEmailsJob } from './send-emails.js';
import type { Job } from './types.js';

/** Every cron job must be registered here. */
export const jobs: Record<string, Job> = {
  [heartbeatJob.name]: heartbeatJob,
  [sendEmailsJob.name]: sendEmailsJob,
  [cleanupTokensJob.name]: cleanupTokensJob,
};

/** Jobs run by the single "tick" cron entry (one hPanel cron line every 5 minutes). */
export const tickJobs = [heartbeatJob.name, sendEmailsJob.name, cleanupTokensJob.name];
