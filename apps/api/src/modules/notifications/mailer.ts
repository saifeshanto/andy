import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendFn = (email: OutgoingEmail) => Promise<void>;

let transporter: Transporter | undefined;

/** Sends one email using MAIL_TRANSPORT ("smtp" or "log"). */
export const sendEmail: SendFn = async (email) => {
  const cfg = env();
  if (cfg.MAIL_TRANSPORT === 'log') {
    logger.info({ to: email.to, subject: email.subject, text: email.text }, 'Email (log transport, not sent)');
    return;
  }
  if (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASSWORD) {
    throw new Error('MAIL_TRANSPORT=smtp but SMTP_HOST, SMTP_USER or SMTP_PASSWORD is missing');
  }
  transporter ??= nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_SECURE,
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASSWORD },
  });
  await transporter.sendMail({ from: cfg.MAIL_FROM, to: email.to, subject: email.subject, html: email.html, text: email.text });
};
