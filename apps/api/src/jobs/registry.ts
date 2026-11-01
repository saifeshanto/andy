import { cleanupTokensJob } from './cleanup-tokens.js';
import { expireMembershipsJob } from './expire-memberships.js';
import { expireOrdersJob } from './expire-orders.js';
import { expireVouchersJob } from './expire-vouchers.js';
import { heartbeatJob } from './heartbeat.js';
import { membershipRemindersJob } from './membership-reminders.js';
import { reconcilePaymentsJob } from './reconcile-payments.js';
import { sendEmailsJob } from './send-emails.js';
import type { Job } from './types.js';

/** Every cron job must be registered here. */
export const jobs: Record<string, Job> = Object.fromEntries(
  [heartbeatJob, reconcilePaymentsJob, expireOrdersJob, expireMembershipsJob, expireVouchersJob, membershipRemindersJob, sendEmailsJob, cleanupTokensJob].map((j) => [j.name, j]),
);

/**
 * Jobs run by the single "tick" cron entry (one hPanel cron line every 5 minutes), in this order.
 * Emails go last so anything queued by earlier jobs is sent in the same tick.
 */
export const tickJobs = [
  heartbeatJob.name,
  reconcilePaymentsJob.name,
  expireOrdersJob.name,
  expireMembershipsJob.name,
  expireVouchersJob.name,
  membershipRemindersJob.name,
  sendEmailsJob.name,
  cleanupTokensJob.name,
];
