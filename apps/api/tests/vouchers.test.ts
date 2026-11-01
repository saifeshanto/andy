import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '../src/core/db.js';
import { runJob } from '../src/jobs/runner.js';
import { app, bearer, login, registerUser, resetDb, superAdmin, verify } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

const P = '/api/v1/merchant/MERCHANT0001';
const DAY = 24 * 60 * 60_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

async function verified(email: string, name = 'User') {
  await registerUser(email, name);
  await verify(email);
  return (await login(email)).accessToken;
}

async function makeMember(email: string, name: string, active = true) {
  const token = await verified(email, name);
  const u = await db().user.findUniqueOrThrow({ where: { email } });
  const plan = await db().membershipPlan.findFirstOrThrow();
  await db().membership.create({ data: { userId: u.id, planId: plan.id, status: 'ACTIVE', startAt: new Date(Date.now() - DAY), endAt: new Date(Date.now() + (active ? 300 : -0.5) * DAY) } });
  return { token, user: u };
}

async function setup() {
  const owner = await verified('kamal@example.com', 'Kamal');
  const u = await db().user.findUniqueOrThrow({ where: { email: 'kamal@example.com' } });
  const m = await db().merchant.create({ data: { publicId: 'MERCHANT0001', slug: 'kamal-wash', name: 'Kamal Wash', businessType: 'Car wash', ssmNo: '1', status: 'APPROVED', createdById: u.id } });
  await db().merchantMember.create({ data: { merchantId: m.id, userId: u.id, role: 'OWNER' } });
  const outlet = await db().merchantOutlet.create({ data: { merchantId: m.id, name: 'PJ', addressLine1: '1 Jalan', city: 'Petaling Jaya', state: 'Selangor', postcode: '47300' } });
  const other = await db().merchantOutlet.create({ data: { merchantId: m.id, name: 'Shah Alam', addressLine1: '2 Jalan', city: 'Shah Alam', state: 'Selangor', postcode: '40000' } });
  return { owner, m, outlet, other, admin: await superAdmin() };
}

type S = Awaited<ReturnType<typeof setup>>;

async function draft(s: S, extra: object = {}) {
  const res = await request(app)
    .post(`${P}/vouchers`)
    .set(bearer(s.owner))
    .send({ title: 'Free premium car wash', terms: 'One wash per voucher. Sedans and SUVs.', benefitType: 'FREE_ITEM', claimEndAt: inDays(30), validUntil: inDays(60), outletIds: [s.outlet.id.toString()], ...extra });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data as { id: string; missing: string[] };
}

async function live(s: S, extra: object = {}) {
  const d = await draft(s, extra);
  await request(app).post(`${P}/vouchers/${d.id}/submit`).set(bearer(s.owner)).expect(200);
  const ok = await request(app).post(`/api/v1/admin/vouchers/${d.id}/approve`).set(bearer(s.admin)).send({});
  expect(ok.status).toBe(200);
  return ok.body.data as { id: string; slug: string };
}

const claim = (token: string, campaignId: string) => request(app).post('/api/v1/me/vouchers').set(bearer(token)).send({ campaignId });

describe('voucher offers', () => {
  it('validates the benefit and dates', async () => {
    const s = await setup();
    const send = (body: object) => request(app).post(`${P}/vouchers`).set(bearer(s.owner)).send({ title: 'RM20 off tyres', terms: 'Valid for a set of four.', claimEndAt: inDays(30), validUntil: inDays(60), ...body });
    expect((await send({ benefitType: 'FIXED_OFF' })).status).toBe(400);
    expect((await send({ benefitType: 'PERCENT_OFF', benefitValue: 150 })).status).toBe(400);
    expect((await send({ benefitType: 'FREE_ITEM', validUntil: inDays(10) })).status).toBe(400);
    const free = await send({ benefitType: 'FREE_ITEM', benefitValue: 999 });
    expect(free.body.data).toMatchObject({ benefitValue: null, benefit: 'Free', memberOnly: true, perUserLimit: 1, status: 'DRAFT' });
    const fixed = await send({ benefitType: 'FIXED_OFF', benefitValue: 2000 });
    expect(fixed.body.data.benefit).toBe('RM 20.00 off');
  });

  it('needs an outlet before review; cashiers cannot create offers', async () => {
    const s = await setup();
    const d = await draft(s, { outletIds: [] });
    expect(d.missing).toEqual(['At least one open outlet where it can be used']);
    expect((await request(app).post(`${P}/vouchers/${d.id}/submit`).set(bearer(s.owner))).status).toBe(400);
    const cashier = await verified('ali@example.com', 'Ali');
    const cu = await db().user.findUniqueOrThrow({ where: { email: 'ali@example.com' } });
    await db().merchantMember.create({ data: { merchantId: s.m.id, userId: cu.id, role: 'CASHIER' } });
    expect((await request(app).post(`${P}/vouchers`).set(bearer(cashier)).send({})).status).toBe(403);
  });

  it('is approved by admin, emails the owner, and then only quantity and outlets can change', async () => {
    const s = await setup();
    const c = await live(s, { totalQty: 10 });
    expect(c.slug).toBe('free-premium-car-wash-kamal-wash');
    expect(await db().emailOutbox.count({ where: { toEmail: 'kamal@example.com', templateKey: 'voucherApproved' } })).toBe(1);
    const locked = await request(app).patch(`${P}/vouchers/${c.id}`).set(bearer(s.owner)).send({ title: 'Something else' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('VOUCHER_LIVE');
    const ok = await request(app).patch(`${P}/vouchers/${c.id}`).set(bearer(s.owner)).send({ totalQty: 20, outletIds: [s.outlet.id.toString(), s.other.id.toString()] });
    expect(ok.body.data).toMatchObject({ totalQty: 20, status: 'APPROVED' });
    expect(ok.body.data.outletIds).toHaveLength(2);
  });

  it('rejection needs a note and lets the merchant edit and resubmit', async () => {
    const s = await setup();
    const d = await draft(s);
    await request(app).post(`${P}/vouchers/${d.id}/submit`).set(bearer(s.owner)).expect(200);
    expect((await request(app).post(`/api/v1/admin/vouchers/${d.id}/reject`).set(bearer(s.admin)).send({})).status).toBe(400);
    await request(app).post(`/api/v1/admin/vouchers/${d.id}/reject`).set(bearer(s.admin)).send({ note: 'Please say which car sizes.' }).expect(200);
    const edited = await request(app).patch(`${P}/vouchers/${d.id}`).set(bearer(s.owner)).send({ terms: 'One wash per voucher. Sedans only.' });
    expect(edited.body.data.status).toBe('DRAFT');
  });
});

describe('claiming', () => {
  it('shows live offers publicly and lets a member claim within the limit', async () => {
    const s = await setup();
    const c = await live(s);
    const pub = await request(app).get('/api/v1/public/vouchers');
    expect(pub.body.data).toHaveLength(1);
    expect(pub.body.data[0]).toMatchObject({ title: 'Free premium car wash', claimState: 'OPEN', memberOnly: true });

    const { token } = await makeMember('siti@example.com', 'Siti Aminah');
    const res = await claim(token, c.id);
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(new Date(res.body.data.expiresAt).getTime()).toBeCloseTo(Date.now() + 60 * DAY, -5);
    expect((await claim(token, c.id)).body.error.code).toBe('LIMIT_REACHED');

    const mine = await request(app).get('/api/v1/me/vouchers').set(bearer(token));
    expect(mine.body.data).toHaveLength(1);
    const detail = await request(app).get(`/api/v1/public/vouchers/${c.slug}`).set(bearer(token));
    expect(detail.body.data.myClaims).toBe(1);
  });

  it('members-only offers need an active membership; open offers do not', async () => {
    const s = await setup();
    const c = await live(s);
    const guest = await verified('guest@example.com');
    expect((await claim(guest, c.id)).body.error.code).toBe('MEMBERSHIP_REQUIRED');
    const open = await live(s, { title: 'Free air top-up', memberOnly: false });
    expect((await claim(guest, open.id)).status).toBe(201);
  });

  it('never gives out more than the total, even with concurrent claims', async () => {
    const s = await setup();
    const c = await live(s, { totalQty: 3 });
    const members = [];
    for (const i of [1, 2, 3, 4, 5, 6]) members.push(await makeMember(`m${i}@example.com`, `Member ${i}`));
    const results = await Promise.all(members.map((m) => claim(m.token, c.id)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'SOLD_OUT')).toBe(true);
    const row = await db().voucherCampaign.findUniqueOrThrow({ where: { publicId: c.id } });
    expect(row.claimedCount).toBe(3);
    expect(await db().voucher.count()).toBe(3);
  }, 30_000);

  it('a voucher expires after validDays if that is sooner than the end date', async () => {
    const s = await setup();
    const c = await live(s, { validDays: 7 });
    const { token } = await makeMember('siti@example.com', 'Siti');
    const res = await claim(token, c.id);
    expect(new Date(res.body.data.expiresAt).getTime()).toBeCloseTo(Date.now() + 7 * DAY, -5);
  });

  it('paused and ended offers cannot be claimed, but vouchers already held still work', async () => {
    const s = await setup();
    const c = await live(s, { perUserLimit: 2 });
    const { token } = await makeMember('siti@example.com', 'Siti');
    await claim(token, c.id).expect(201);
    await request(app).post(`${P}/vouchers/${c.id}/pause`).set(bearer(s.owner)).expect(200);
    expect((await claim(token, c.id)).body.error.code).toBe('NOT_CLAIMABLE');
    expect((await request(app).get('/api/v1/public/vouchers')).body.data).toHaveLength(0);
    await request(app).post(`${P}/vouchers/${c.id}/end`).set(bearer(s.owner)).expect(200);
    expect((await request(app).get('/api/v1/me/vouchers').set(bearer(token))).body.data[0].status).toBe('ACTIVE');
  });
});

describe('counter redemption', () => {
  async function held(s: S, extra: object = {}) {
    const c = await live(s, extra);
    const m = await makeMember('siti@example.com', 'Siti Aminah binti Hassan');
    const code = (await claim(m.token, c.id)).body.data.code as string;
    return { c, code, member: m };
  }

  it('looks up, then redeems once; a second scan is refused', async () => {
    const s = await setup();
    const { code, member } = await held(s);
    const look = await request(app).post(`${P}/redemptions/lookup`).set(bearer(s.owner)).send({ code: code.toLowerCase().replace('-', ' ') });
    expect(look.body.data).toMatchObject({ canRedeem: true, memberName: 'Siti A.', benefit: 'Free', outlets: [{ id: s.outlet.id.toString(), name: 'PJ' }] });

    const wrongOutlet = await request(app).post(`${P}/redemptions`).set(bearer(s.owner)).send({ code, outletId: s.other.id.toString() });
    expect(wrongOutlet.body.error.code).toBe('WRONG_OUTLET');

    const both = await Promise.all([1, 2].map(() => request(app).post(`${P}/redemptions`).set(bearer(s.owner)).send({ code, outletId: s.outlet.id.toString() })));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db().voucherRedemption.count()).toBe(1);
    expect(await db().emailOutbox.count({ where: { toEmail: 'siti@example.com', templateKey: 'voucherRedeemed' } })).toBe(1);

    const again = await request(app).post(`${P}/redemptions/lookup`).set(bearer(s.owner)).send({ code });
    expect(again.body.data).toMatchObject({ canRedeem: false, reasonCode: 'REDEEMED', redeemedOutlet: 'PJ' });
    const mine = await request(app).get('/api/v1/me/vouchers?tab=used').set(bearer(member.token));
    expect(mine.body.data[0]).toMatchObject({ status: 'REDEEMED', redeemedOutlet: 'PJ' });
  });

  it('another merchant’s code looks like an unknown code', async () => {
    const s = await setup();
    const { code } = await held(s);
    const other = await verified('other@example.com', 'Other');
    const ou = await db().user.findUniqueOrThrow({ where: { email: 'other@example.com' } });
    const m2 = await db().merchant.create({ data: { publicId: 'MERCHANT0002', slug: 'other', name: 'Other', businessType: 'Tyres', ssmNo: '2', status: 'APPROVED', createdById: ou.id } });
    await db().merchantMember.create({ data: { merchantId: m2.id, userId: ou.id, role: 'OWNER' } });
    const res = await request(app).post('/api/v1/merchant/MERCHANT0002/redemptions/lookup').set(bearer(other)).send({ code });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CODE_NOT_FOUND');
    expect((await request(app).post(`${P}/redemptions/lookup`).set(bearer(s.owner)).send({ code: 'AAAAA-BBBBB' })).body.error.code).toBe('CODE_NOT_FOUND');
  });

  it('refuses expired vouchers and lapsed memberships', async () => {
    const s = await setup();
    const { code, member } = await held(s);
    await db().membership.updateMany({ where: { userId: member.user.id }, data: { endAt: new Date(Date.now() - 1000) } });
    const look = await request(app).post(`${P}/redemptions/lookup`).set(bearer(s.owner)).send({ code });
    expect(look.body.data.reasonCode).toBe('MEMBERSHIP_INACTIVE');
    await db().voucher.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await request(app).post(`${P}/redemptions`).set(bearer(s.owner)).send({ code, outletId: s.outlet.id.toString() });
    expect(r.body.error.code).toBe('EXPIRED');
    await runJob(db(), 'expire-vouchers', 'cli');
    expect((await db().voucher.findFirstOrThrow()).status).toBe('EXPIRED');
  });

  it('cashiers redeem and see only their own history; a cashier tied to an outlet can only use that outlet', async () => {
    const s = await setup();
    const { code } = await held(s, { outletIds: [s.outlet.id.toString(), s.other.id.toString()] });
    const cashier = await verified('ali@example.com', 'Ali');
    const cu = await db().user.findUniqueOrThrow({ where: { email: 'ali@example.com' } });
    await db().merchantMember.create({ data: { merchantId: s.m.id, userId: cu.id, role: 'CASHIER', outletId: s.other.id } });
    const look = await request(app).post(`${P}/redemptions/lookup`).set(bearer(cashier)).send({ code });
    expect(look.body.data.outlets).toEqual([{ id: s.other.id.toString(), name: 'Shah Alam' }]);
    expect((await request(app).post(`${P}/redemptions`).set(bearer(cashier)).send({ code, outletId: s.outlet.id.toString() })).body.error.code).toBe('WRONG_OUTLET');
    await request(app).post(`${P}/redemptions`).set(bearer(cashier)).send({ code, outletId: s.other.id.toString() }).expect(201);
    expect((await request(app).get(`${P}/redemptions`).set(bearer(cashier))).body.data).toHaveLength(1);
    expect((await request(app).get(`${P}/redemptions`).set(bearer(s.owner))).body.data[0]).toMatchObject({ staff: 'Ali', outlet: 'Shah Alam', member: { name: 'Siti A.' } });
  });

  it('admin can undo a redemption within 24 hours, with a reason', async () => {
    const s = await setup();
    const { code } = await held(s);
    const r = await request(app).post(`${P}/redemptions`).set(bearer(s.owner)).send({ code, outletId: s.outlet.id.toString() });
    const id = r.body.data.id as string;
    expect((await request(app).post(`/api/v1/admin/redemptions/${id}/reverse`).set(bearer(s.admin)).send({ reason: '' })).status).toBe(400);
    await request(app).post(`/api/v1/admin/redemptions/${id}/reverse`).set(bearer(s.admin)).send({ reason: 'Cashier scanned the wrong phone' }).expect(204);
    expect((await db().voucher.findFirstOrThrow()).status).toBe('ACTIVE');
    const list = await request(app).get(`/api/v1/admin/redemptions?code=${code}`).set(bearer(s.admin));
    expect(list.body.data[0]).toMatchObject({ reverseReason: 'Cashier scanned the wrong phone', member: { email: 'siti@example.com' } });
    // Can be redeemed again after the undo, and an old redemption cannot be undone.
    const again = await request(app).post(`${P}/redemptions`).set(bearer(s.owner)).send({ code, outletId: s.outlet.id.toString() });
    expect(again.status).toBe(201);
    await db().voucherRedemption.update({ where: { id: BigInt(again.body.data.id) }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    expect((await request(app).post(`/api/v1/admin/redemptions/${again.body.data.id}/reverse`).set(bearer(s.admin)).send({ reason: 'Too late now' })).body.error.code).toBe('TOO_LATE');
  });

  it('a suspended merchant cannot redeem', async () => {
    const s = await setup();
    const { code } = await held(s);
    await db().merchant.update({ where: { id: s.m.id }, data: { status: 'SUSPENDED' } });
    expect((await request(app).post(`${P}/redemptions`).set(bearer(s.owner)).send({ code, outletId: s.outlet.id.toString() })).status).toBe(409);
  });
});
