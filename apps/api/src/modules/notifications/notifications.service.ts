import type { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../core/db.js';
import { templates, type TemplateKey } from './templates.js';

type Tx = Prisma.TransactionClient;

/**
 * Queues an email in the outbox. Call inside the business transaction (pass `tx`) so the email
 * is only sent if the change commits. The send-emails cron job delivers it.
 */
export async function queueEmail<K extends TemplateKey>(
  to: string,
  key: K,
  params: Parameters<(typeof templates)[K]>[0],
  tx?: Tx,
): Promise<void> {
  const render = templates[key] as (p: typeof params) => { subject: string; html: string; text: string };
  const email = render(params);
  await (tx ?? db()).emailOutbox.create({
    data: { toEmail: to, templateKey: key, subject: email.subject, bodyHtml: email.html, bodyText: email.text },
  });
}
