import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/core/db.js';
import { ensureDefaultPlan } from '../src/modules/membership/index.js';
import { syncRbac } from '../src/modules/rbac/index.js';

export const app = createApp();
export const APP_HEADER = { 'x-requested-with': 'andy-web' };
export const PASSWORD = 'correct-horse-9';

/** Empties every table (children first) and re-syncs roles. */
export async function resetDb() {
  const d = db();
  await d.membershipReminder.deleteMany();
  await d.membershipEvent.deleteMany();
  await d.membership.deleteMany();
  await d.paymentWebhookLog.deleteMany();
  await d.payment.deleteMany();
  await d.orderItem.deleteMany();
  await d.order.deleteMany();
  await d.membershipPlan.deleteMany();
  await d.emailOutbox.deleteMany();
  await d.auditLog.deleteMany();
  await d.verificationToken.deleteMany();
  await d.refreshToken.deleteMany();
  await d.userRole.deleteMany();
  await d.user.deleteMany();
  await d.jobRun.deleteMany();
  await d.setting.deleteMany();
  await syncRbac(d);
  await ensureDefaultPlan(d);
}

/** Pulls the raw token out of the newest queued email to that address. */
export async function tokenFromEmail(to: string, template: 'verifyEmail' | 'passwordReset'): Promise<string> {
  const email = await db().emailOutbox.findFirstOrThrow({ where: { toEmail: to, templateKey: template }, orderBy: { id: 'desc' } });
  const match = /token=([A-Za-z0-9_%-]+)/.exec(email.bodyText);
  if (!match?.[1]) throw new Error('No token in email');
  return decodeURIComponent(match[1]);
}

export function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('andy_rt='));
  if (!cookie) throw new Error('No refresh cookie');
  return cookie.split(';')[0]!;
}

export async function registerUser(email: string, fullName = 'Test User') {
  const res = await request(app).post('/api/v1/auth/register').send({ email, fullName, password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { accessToken: res.body.data.accessToken as string, user: res.body.data.user, cookie: refreshCookie(res) };
}

export async function verify(email: string) {
  const token = await tokenFromEmail(email, 'verifyEmail');
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
}

export async function login(email: string, password = PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return { res, accessToken: res.body.data?.accessToken as string };
}

/** Registers and verifies the bootstrap admin, then returns a fresh access token with Super Admin rights. */
export async function superAdmin() {
  await registerUser('owner@example.com', 'Owner');
  await verify('owner@example.com');
  return (await login('owner@example.com')).accessToken;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
