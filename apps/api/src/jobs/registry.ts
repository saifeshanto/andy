import { heartbeatJob } from './heartbeat.js';
import type { Job } from './types.js';

/** Every cron job must be registered here. */
export const jobs: Record<string, Job> = {
  [heartbeatJob.name]: heartbeatJob,
};
