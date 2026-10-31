import { sendEmail, type SendFn } from '../modules/notifications/index.js';
import type { Job, JobContext } from './types.js';

const BATCH = 50;
const MAX_ATTEMPTS = 5;

/** Retry backoff: 5, 10, 20, 40 minutes. */
const backoffMs = (attempt: number) => 5 * 60_000 * 2 ** (attempt - 1);

/** Sends queued emails in small batches. Safe to run every few minutes. */
export function makeSendEmailsJob(send: SendFn = sendEmail): Job {
  return {
    name: 'send-emails',
    staleAfterMinutes: 10,
    async run({ db, now }: JobContext) {
      // Reclaim emails stuck in SENDING from a crashed run.
      await db.emailOutbox.updateMany({
        where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
        data: { status: 'QUEUED' },
      });
      const due = await db.emailOutbox.findMany({
        where: { status: 'QUEUED', sendAfter: { lte: now } },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      let processed = 0;
      for (const email of due) {
        // Claim the row so an overlapping run cannot send it twice.
        const claimed = await db.emailOutbox.updateMany({
          where: { id: email.id, status: 'QUEUED' },
          data: { status: 'SENDING', attempts: { increment: 1 } },
        });
        if (claimed.count === 0) continue;
        const attempt = email.attempts + 1;
        try {
          await send({ to: email.toEmail, subject: email.subject, html: email.bodyHtml, text: email.bodyText });
          await db.emailOutbox.update({ where: { id: email.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const giveUp = attempt >= MAX_ATTEMPTS;
          await db.emailOutbox.update({
            where: { id: email.id },
            data: {
              status: giveUp ? 'FAILED' : 'QUEUED',
              lastError: message.slice(0, 2000),
              sendAfter: new Date(Date.now() + backoffMs(attempt)),
            },
          });
        }
        processed++;
      }
      return { processed };
    },
  };
}

export const sendEmailsJob = makeSendEmailsJob();
