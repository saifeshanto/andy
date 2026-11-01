import { env } from '../../config/env.js';

/**
 * Email templates (code defaults). PROJECT_PLAN M22 makes these admin-editable in a later phase;
 * until then they live here. Keep wording neutral: no income claims (legal, see plan R1).
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#12161b">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px">
<tr><td style="background:#0b0d10;color:#fff;padding:20px 28px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:1px">ANDY AUTO CLUB</td></tr>
<tr><td style="padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e02a37;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>
<p style="font-size:12px;color:#5b6673">Or paste this link into your browser:<br>${esc(url)}</p>`;
}

export const templates = {
  verifyEmail(p: { name: string; token: string }): RenderedEmail {
    const url = `${env().APP_URL}/verify-email?token=${encodeURIComponent(p.token)}`;
    return {
      subject: 'Confirm your email address',
      html: layout(`Hi ${p.name}, confirm your email`, `<p>Please confirm your email address to finish setting up your account. The link expires in 24 hours.</p>${button(url, 'Confirm email')}`),
      text: `Hi ${p.name},\n\nConfirm your email address (link expires in 24 hours):\n${url}\n`,
    };
  },
  passwordReset(p: { name: string; token: string }): RenderedEmail {
    const url = `${env().APP_URL}/reset-password?token=${encodeURIComponent(p.token)}`;
    return {
      subject: 'Reset your password',
      html: layout('Reset your password', `<p>Hi ${esc(p.name)}, we received a request to reset your password. The link expires in 1 hour. If you did not ask for this, you can ignore this email.</p>${button(url, 'Choose a new password')}`),
      text: `Hi ${p.name},\n\nReset your password (link expires in 1 hour):\n${url}\n\nIf you did not ask for this, ignore this email.\n`,
    };
  },
  passwordChanged(p: { name: string }): RenderedEmail {
    return {
      subject: 'Your password was changed',
      html: layout('Your password was changed', `<p>Hi ${esc(p.name)}, the password for your account was just changed. If this was not you, reset your password straight away and contact support.</p>`),
      text: `Hi ${p.name},\n\nThe password for your account was just changed. If this was not you, reset it now and contact support.\n`,
    };
  },
} as const;


const myDate = (d: Date) =>
  new Intl.DateTimeFormat('en-MY', { dateStyle: 'long', timeZone: 'Asia/Kuala_Lumpur' }).format(d);
const myDateTime = (d: Date) =>
  new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(d);

export const membershipTemplates = {
  paymentReceipt(p: { name: string; orderNo: string; description: string; amount: string; paidAt: Date }): RenderedEmail {
    const rows = [
      ['Order', p.orderNo],
      ['Item', p.description],
      ['Amount paid', p.amount],
      ['Paid on', myDateTime(p.paidAt)],
    ];
    const table = `<table cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows
      .map(([k, v]) => `<tr><td style="color:#5b6673">${esc(k!)}</td><td><strong>${esc(v!)}</strong></td></tr>`)
      .join('')}</table>`;
    return {
      subject: `Payment received: ${p.orderNo}`,
      html: layout(`Thank you, ${p.name}`, `<p>We have received your payment.</p>${table}<p style="font-size:12px;color:#5b6673">Keep this email as your receipt.</p>`),
      text: `Thank you, ${p.name}. We have received your payment.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n`,
    };
  },
  membershipActivated(p: { name: string; startAt: Date; endAt: Date; renewed: boolean }): RenderedEmail {
    const title = p.renewed ? 'Your membership is renewed' : 'Welcome to Andy Auto Club';
    const body = `Your membership runs from ${myDate(p.startAt)} to ${myDate(p.endAt)}.`;
    const url = `${env().APP_URL}/account/membership`;
    return {
      subject: title,
      html: layout(title, `<p>Hi ${esc(p.name)}, ${esc(body)}</p>${button(url, 'View my membership')}`),
      text: `Hi ${p.name},\n\n${body}\n\n${url}\n`,
    };
  },
  membershipReminder(p: { name: string; endAt: Date; expired: boolean }): RenderedEmail {
    const url = `${env().APP_URL}/account/membership`;
    const title = p.expired ? 'Your membership has expired' : 'Your membership is ending soon';
    const body = p.expired ? `Your membership ended on ${myDate(p.endAt)}. Renew to keep your member benefits.` : `Your membership ends on ${myDate(p.endAt)}. Renew to keep your member benefits.`;
    return {
      subject: title,
      html: layout(title, `<p>Hi ${esc(p.name)}, ${esc(body)}</p>${button(url, 'Renew membership')}`),
      text: `Hi ${p.name},\n\n${body}\n\n${url}\n`,
    };
  },
};

export const allTemplates = { ...templates, ...membershipTemplates };
export type TemplateKey = keyof typeof allTemplates;
