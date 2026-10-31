import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '../src/core/db.js';
import { expireMembershipsJob } from '../src/jobs/expire-memberships.js';
import { membershipRemindersJob } from '../src/jobs/membership-reminders.js';
import { reconcilePaymentsJob } from '../src/jobs/reconcile-payments.js';
import { addMonths } from '../src/modules/membership/dates.js';
import { fakeMarkPaid, fakeSign } from '../src/modules/payments/providers/fake.js';
import { app, bearer, registerUser, resetDb, superAdmin } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

const DAY = 24 * 60 * 60_000;

async function member(email = 'ali@example.com') {
  const { accessToken } = await registerUser(email, 'Ali');
  return accessToken;
}

async function checkout(token: string) {
  const res = await request(app).post('/api/v1/me/membership/checkout').set(bearer(token));
  if (res.status !== 201) throw new Error(`checkout ${res.status} ${JSON.stringify(res.body)}`);
  const payment = await db().payment.findFirstOrThrow({ where: { order: { publicNo: res.body.data.orderNo } } });
  return { orderNo: res.body.data.orderNo as string, checkoutUrl: res.body.data.checkoutUrl as string, ref: payment.providerRef! };
}

function callback(ref: string, paid = true, amount = 39900, signature = fakeSign(ref, paid, amount)) {
  return request(app).post('/api/v1/payments/webhook/fake').type('form').send({ ref, paid: String(paid), amount: String(amount), signature });
}

const setSetting = (key: string, value: unknown) => db().setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });

describe('membership checkout', () => {
  it('shows the RM399 plan publicly', async () => {
    const res = await request(app).get('/api/v1/public/membership-plan');
    expect(res.body.data).toEqual({ name: 'Annual membership', priceSen: 39900, durationMonths: 12 });
  });

  it('creates a pending order and a gateway bill, without activating anything', async () => {
    const token = await member();
    const { orderNo, checkoutUrl } = await checkout(token);
    expect(checkoutUrl).toContain('/api/v1/payments/fake/checkout/');
    const order = await db().order.findUniqueOrThrow({ where: { publicNo: orderNo }, include: { items: true } });
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', totalSen: 39900, type: 'MEMBERSHIP' });
    expect(order.items[0]).toMatchObject({ itemType: 'MEMBERSHIP', unitPriceSen: 39900 });
    expect(await db().membership.count()).toBe(0);
  });

  it('reuses a recent unpaid checkout instead of creating a second bill', async () => {
    const token = await member();
    const a = await checkout(token);
    const b = await checkout(token);
    expect(b.orderNo).toBe(a.orderNo);
    expect(await db().order.count()).toBe(1);
  });

  it('requires sign-in', async () => {
    expect((await request(app).post('/api/v1/me/membership/checkout')).status).toBe(401);
  });
});

describe('payment callback', () => {
  it('activates a 12-month membership, sends a receipt and audits it', async () => {
    const token = await member();
    const { orderNo, ref } = await checkout(token);
    const res = await callback(ref);
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('PAID');

    const order = await db().order.findUniqueOrThrow({ where: { publicNo: orderNo } });
    expect(order.status).toBe('PAID');
    const m = await db().membership.findFirstOrThrow();
    expect(m.status).toBe('ACTIVE');
    expect(m.endAt.toISOString()).toBe(addMonths(m.startAt, 12).toISOString());
    const templates = (await db().emailOutbox.findMany({ where: { toEmail: 'ali@example.com' } })).map((e) => e.templateKey).sort();
    expect(templates).toEqual(['membershipActivated', 'paymentReceipt', 'verifyEmail']);
    expect(await db().auditLog.count({ where: { action: 'membership.activated' } })).toBe(1);

    const me = await request(app).get('/api/v1/me/membership').set(bearer(token));
    expect(me.body.data.current.status).toBe('ACTIVE');
    const status = await request(app).get(`/api/v1/me/orders/${orderNo}`).set(bearer(token));
    expect(status.body.data.status).toBe('PAID');
  });

  it('is idempotent: a repeated callback changes nothing', async () => {
    const { ref } = await checkout(await member());
    await callback(ref);
    const again = await callback(ref);
    expect(again.body.data.outcome).toBe('ALREADY_PAID');
    expect(await db().membership.count()).toBe(1);
    expect(await db().emailOutbox.count({ where: { templateKey: 'paymentReceipt' } })).toBe(1);
  });

  it('activates exactly once when 10 callbacks arrive at the same time', async () => {
    const { ref } = await checkout(await member());
    const results = await Promise.all(Array.from({ length: 10 }, () => callback(ref)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.data.outcome === 'PAID')).toHaveLength(1);
    expect(await db().membership.count()).toBe(1);
  });

  it('rejects a bad signature and logs it', async () => {
    const { ref } = await checkout(await member());
    const res = await callback(ref, true, 39900, 'f'.repeat(64));
    expect(res.status).toBe(400);
    expect(await db().membership.count()).toBe(0);
    expect(await db().paymentWebhookLog.count({ where: { signatureValid: false } })).toBe(1);
  });

  it('does not activate when the paid amount differs', async () => {
    const { ref } = await checkout(await member());
    const res = await callback(ref, true, 100);
    expect(res.body.data.outcome).toBe('AMOUNT_MISMATCH');
    expect(await db().membership.count()).toBe(0);
    expect((await db().payment.findFirstOrThrow()).failureCode).toBe('AMOUNT_MISMATCH');
  });

  it('ignores an unpaid result', async () => {
    const { ref } = await checkout(await member());
    expect((await callback(ref, false)).body.data.outcome).toBe('NOT_PAID');
    expect(await db().membership.count()).toBe(0);
  });

  it("does not let one user read another user's order", async () => {
    const { orderNo } = await checkout(await member('ali@example.com'));
    const other = await member('mei@example.com');
    expect((await request(app).get(`/api/v1/me/orders/${orderNo}`).set(bearer(other))).status).toBe(404);
  });
});

describe('browser return', () => {
  it('confirms with the gateway before activating, then redirects to the result page', async () => {
    const { orderNo, ref } = await checkout(await member());
    fakeMarkPaid(ref, true);
    const q = { ref, paid: 'true', amount: '39900', signature: fakeSign(ref, true, 39900) };
    const res = await request(app).get('/api/v1/payments/return/fake').query(q);
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain(`/checkout/result?order=${orderNo}`);
    expect(await db().membership.count()).toBe(1);
  });

  it('does not activate from a forged redirect when the gateway says unpaid', async () => {
    const { ref } = await checkout(await member());
    const q = { ref, paid: 'true', amount: '39900', signature: fakeSign(ref, true, 39900) };
    await request(app).get('/api/v1/payments/return/fake').query(q);
    expect(await db().membership.count()).toBe(0);
  });
});

describe('renewal', () => {
  async function activeMember() {
    const token = await member();
    const { ref } = await checkout(token);
    await callback(ref);
    return token;
  }

  it('blocks early renewal until the rule is set (OPEN-02)', async () => {
    const token = await activeMember();
    const res = await request(app).post('/api/v1/me/membership/checkout').set(bearer(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RENEWAL_NOT_AVAILABLE');
  });

  it('CURRENT_END: the new year starts when the current one ends', async () => {
    const token = await activeMember();
    await setSetting('membership.renewalStartsFrom', 'CURRENT_END');
    const first = await db().membership.findFirstOrThrow();
    const { ref } = await checkout(token);
    await callback(ref);
    const second = await db().membership.findFirstOrThrow({ where: { id: { not: first.id } } });
    expect(second.startAt.toISOString()).toBe(first.endAt.toISOString());
    expect(second.endAt.toISOString()).toBe(addMonths(first.endAt, 12).toISOString());
    expect((await db().membership.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('ACTIVE');
    const me = await request(app).get('/api/v1/me/membership').set(bearer(token));
    expect(new Date(me.body.data.paidUntil).toISOString()).toBe(second.endAt.toISOString());
  });

  it('PAYMENT_DATE: the new year starts now and replaces the old term', async () => {
    const token = await activeMember();
    await setSetting('membership.renewalStartsFrom', 'PAYMENT_DATE');
    const first = await db().membership.findFirstOrThrow();
    const { ref } = await checkout(token);
    await callback(ref);
    expect((await db().membership.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('EXPIRED');
    expect(await db().membership.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });

  it('an expired member can join again without the renewal rule', async () => {
    const token = await activeMember();
    await db().membership.updateMany({ data: { startAt: new Date(Date.now() - 400 * DAY), endAt: new Date(Date.now() - DAY) } });
    await expireMembershipsJob.run({ db: db(), now: new Date() });
    expect((await request(app).post('/api/v1/me/membership/checkout').set(bearer(token))).status).toBe(201);
  });
});

describe('scheduled jobs', () => {
  it('reconcile-payments completes a payment whose callback was missed', async () => {
    const { ref } = await checkout(await member());
    fakeMarkPaid(ref, true);
    await db().payment.updateMany({ data: { createdAt: new Date(Date.now() - 15 * 60_000) } });
    const res = await reconcilePaymentsJob.run({ db: db(), now: new Date() });
    expect(res.processed).toBe(1);
    expect(await db().membership.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });

  it('expire-memberships expires ended terms once', async () => {
    const { ref } = await checkout(await member());
    await callback(ref);
    await db().membership.updateMany({ data: { endAt: new Date(Date.now() - 1000) } });
    expect((await expireMembershipsJob.run({ db: db(), now: new Date() })).processed).toBe(1);
    expect((await expireMembershipsJob.run({ db: db(), now: new Date() })).processed).toBe(0);
    expect((await db().membership.findFirstOrThrow()).status).toBe('EXPIRED');
  });

  it('membership-reminders sends nothing until reminder days are set, then each reminder once', async () => {
    const { ref } = await checkout(await member());
    await callback(ref);
    await db().membership.updateMany({ data: { endAt: new Date(Date.now() + 7 * DAY - 60_000) } });
    await membershipRemindersJob.run({ db: db(), now: new Date() });
    expect(await db().emailOutbox.count({ where: { templateKey: 'membershipReminder' } })).toBe(0);

    await setSetting('membership.reminderDays', [30, 7]);
    await membershipRemindersJob.run({ db: db(), now: new Date() });
    await membershipRemindersJob.run({ db: db(), now: new Date() });
    expect(await db().emailOutbox.count({ where: { templateKey: 'membershipReminder' } })).toBe(1);
  });
});

describe('admin', () => {
  it('lists memberships and orders for permitted admins only', async () => {
    const admin = await superAdmin();
    const token = await member();
    const { ref } = await checkout(token);
    await callback(ref);
    const ms = await request(app).get('/api/v1/admin/memberships').set(bearer(admin));
    expect(ms.body.data[0]).toMatchObject({ status: 'ACTIVE', user: { email: 'ali@example.com' } });
    const orders = await request(app).get('/api/v1/admin/orders?status=PAID').set(bearer(admin));
    expect(orders.body.data[0].payments[0]).toMatchObject({ provider: 'fake', status: 'PAID' });
    expect((await request(app).get('/api/v1/admin/orders').set(bearer(token))).status).toBe(403);
  });

  it('can requery a payment with the gateway', async () => {
    const admin = await superAdmin();
    const { ref } = await checkout(await member());
    fakeMarkPaid(ref, true);
    const payment = await db().payment.findFirstOrThrow({ where: { providerRef: ref } });
    const res = await request(app).post(`/api/v1/admin/payments/${payment.id}/requery`).set(bearer(admin));
    expect(res.body.data.outcome).toBe('PAID');
  });
});
