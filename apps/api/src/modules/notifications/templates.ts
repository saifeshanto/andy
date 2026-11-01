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

const p = (t: string) => `<p>${esc(t)}</p>`;
const noteBlock = (note: string) => (note ? `<p style="background:#f5f6f8;border-radius:8px;padding:12px 14px"><strong>Note from our team:</strong><br>${esc(note)}</p>` : '');

export const merchantTemplates = {
  merchantApplicationReceived(x: { name: string; merchant: string }): RenderedEmail {
    const url = `${env().APP_URL}/merchant/apply`;
    return {
      subject: `We received your merchant application: ${x.merchant}`,
      html: layout(`Thanks, ${x.name}`, p(`We have received the application for ${x.merchant}. Our team will review it and email you the outcome.`) + button(url, 'View application')),
      text: `Hi ${x.name},\n\nWe have received the application for ${x.merchant}. Our team will review it and email you the outcome.\n${url}\n`,
    };
  },
  merchantApproved(x: { name: string; merchant: string }): RenderedEmail {
    const url = `${env().APP_URL}/merchant`;
    return {
      subject: `${x.merchant} is approved`,
      html: layout(`Welcome aboard, ${x.name}`, p(`${x.merchant} has been approved. You can now open your merchant portal to add outlets, staff and listings.`) + button(url, 'Open merchant portal')),
      text: `Hi ${x.name},\n\n${x.merchant} has been approved. Open your merchant portal: ${url}\n`,
    };
  },
  merchantChangesRequested(x: { name: string; merchant: string; note: string }): RenderedEmail {
    const url = `${env().APP_URL}/merchant/apply`;
    return {
      subject: `Changes needed for ${x.merchant}`,
      html: layout(`Hi ${x.name}, a few changes are needed`, p(`Our team reviewed the application for ${x.merchant} and needs some changes before it can be approved.`) + noteBlock(x.note) + button(url, 'Update application')),
      text: `Hi ${x.name},\n\nChanges are needed for ${x.merchant}:\n${x.note}\n\nUpdate it here: ${url}\n`,
    };
  },
  merchantRejected(x: { name: string; merchant: string; note: string }): RenderedEmail {
    return {
      subject: `Your merchant application: ${x.merchant}`,
      html: layout(`Hi ${x.name}`, p(`Thank you for applying. We are unable to approve ${x.merchant} at this time.`) + noteBlock(x.note)),
      text: `Hi ${x.name},\n\nThank you for applying. We are unable to approve ${x.merchant} at this time.\n${x.note}\n`,
    };
  },
  merchantSuspended(x: { name: string; merchant: string; note: string }): RenderedEmail {
    return {
      subject: `${x.merchant} has been suspended`,
      html: layout(`Hi ${x.name}`, p(`${x.merchant} has been suspended and its listings are hidden from the marketplace. Please contact us if you have questions.`) + noteBlock(x.note)),
      text: `Hi ${x.name},\n\n${x.merchant} has been suspended and its listings are hidden.\n${x.note}\n`,
    };
  },
};

const roleName = (r: string) => (r === 'MANAGER' ? 'manager' : r === 'CASHIER' ? 'cashier' : r.toLowerCase());

export const merchantStaffTemplates = {
  merchantStaffInvite(x: { merchant: string; inviter: string; role: string; token: string; days: number }): RenderedEmail {
    const url = `${env().APP_URL}/merchant/invite?token=${encodeURIComponent(x.token)}`;
    return {
      subject: `${x.inviter} invited you to ${x.merchant} on Andy Auto Club`,
      html: layout(
        `Join ${x.merchant}`,
        p(`${x.inviter} has invited you to join ${x.merchant} as a ${roleName(x.role)}. Sign in or create an account with this email address, then accept. The link expires in ${x.days} days.`) +
          button(url, 'Accept invitation') +
          p('If you were not expecting this, you can ignore this email.'),
      ),
      text: `${x.inviter} has invited you to join ${x.merchant} as a ${roleName(x.role)}.\nAccept (expires in ${x.days} days): ${url}\n\nIf you were not expecting this, ignore this email.\n`,
    };
  },
};

export const listingTemplates = {
  listingApproved(x: { name: string; title: string; merchantPublicId: string }): RenderedEmail {
    const url = `${env().APP_URL}/merchant/${x.merchantPublicId}/listings`;
    return {
      subject: `Approved: ${x.title}`,
      html: layout(`Hi ${x.name}, your listing is live`, p(`"${x.title}" has been approved and is now shown in the marketplace.`) + button(url, 'View listings')),
      text: `Hi ${x.name},\n\n"${x.title}" has been approved and is now shown in the marketplace.\n${url}\n`,
    };
  },
  listingRejected(x: { name: string; title: string; note: string; merchantPublicId: string }): RenderedEmail {
    const url = `${env().APP_URL}/merchant/${x.merchantPublicId}/listings`;
    return {
      subject: `Not approved: ${x.title}`,
      html: layout(`Hi ${x.name}, a listing needs changes`, p(`We could not approve "${x.title}" (or its latest changes).`) + noteBlock(x.note) + button(url, 'Edit listing')),
      text: `Hi ${x.name},\n\nWe could not approve "${x.title}" (or its latest changes).\n${x.note}\n${url}\n`,
    };
  },
};

export const allTemplates = { ...templates, ...membershipTemplates, ...merchantTemplates, ...merchantStaffTemplates, ...listingTemplates };
export type TemplateKey = keyof typeof allTemplates;
