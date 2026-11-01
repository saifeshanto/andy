import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/core/crypto.js';
import { db, disconnectDb } from '../src/core/db.js';
import { app, bearer, login, registerUser, resetDb, verify } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

async function verified(email: string, name = 'User') {
  await registerUser(email, name);
  await verify(email);
  return (await login(email)).accessToken;
}

/** An approved merchant owned by kamal@example.com, created directly in the database. */
async function approvedMerchant() {
  const owner = await verified('kamal@example.com', 'Kamal');
  const u = await db().user.findUniqueOrThrow({ where: { email: 'kamal@example.com' } });
  const m = await db().merchant.create({
    data: { publicId: 'MERCHANT0001', slug: 'kamal-tyre', name: 'Kamal Tyre', businessType: 'Tyres', ssmNo: '123', status: 'APPROVED', createdById: u.id, phone: '0312345678' },
  });
  await db().merchantMember.create({ data: { merchantId: m.id, userId: u.id, role: 'OWNER' } });
  const outlet = await db().merchantOutlet.create({ data: { merchantId: m.id, name: 'Main', addressLine1: '1 Jalan', city: 'KL', state: 'Kuala Lumpur', postcode: '50000' } });
  return { owner, m, outlet };
}

const P = '/api/v1/merchant/MERCHANT0001';

/** Invites and accepts, returning the new staff member's token. Reads the raw token from the queued email. */
async function hire(ownerToken: string, email: string, role: 'MANAGER' | 'CASHIER') {
  await request(app).post(`${P}/staff/invites`).set(bearer(ownerToken)).send({ email, role }).expect(201);
  const mail = await db().emailOutbox.findFirstOrThrow({ where: { toEmail: email, templateKey: 'merchantStaffInvite' }, orderBy: { id: 'desc' } });
  const token = decodeURIComponent(/token=([A-Za-z0-9_%-]+)/.exec(mail.bodyText)![1]!);
  const staff = await verified(email, role);
  await request(app).post('/api/v1/merchant-invites/accept').set(bearer(staff)).send({ token }).expect(200);
  return { staff: (await login(email)).accessToken, token };
}

describe('merchant portal access', () => {
  it('shows the owner their business, role and allowed actions', async () => {
    const { owner } = await approvedMerchant();
    const res = await request(app).get(P).set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ role: 'OWNER', merchant: { name: 'Kamal Tyre' }, counts: { outlets: 1, staff: 1 } });
    expect(res.body.data.actions).toContain('staff.manageManagers');
  });

  it('hides the merchant from non-staff (404, not 403)', async () => {
    await approvedMerchant();
    const stranger = await verified('x@example.com');
    expect((await request(app).get(P).set(bearer(stranger))).status).toBe(404);
  });

  it('a suspended merchant can be viewed but not changed', async () => {
    const { owner, m } = await approvedMerchant();
    await db().merchant.update({ where: { id: m.id }, data: { status: 'SUSPENDED' } });
    expect((await request(app).get(P).set(bearer(owner))).status).toBe(200);
    expect((await request(app).patch(`${P}/profile`).set(bearer(owner)).send({ description: 'x' })).status).toBe(409);
  });
});

describe('profile and outlets', () => {
  it('edits the public profile but not the name or SSM number', async () => {
    const { owner } = await approvedMerchant();
    const res = await request(app).patch(`${P}/profile`).set(bearer(owner)).send({ description: 'Tyres since 1998', website: 'https://kamal.my', name: 'Other' });
    expect(res.body.data).toMatchObject({ description: 'Tyres since 1998', website: 'https://kamal.my', name: 'Kamal Tyre' });
  });

  it('adds and closes outlets; validates postcode and state', async () => {
    const { owner } = await approvedMerchant();
    const bad = await request(app).post(`${P}/outlets`).set(bearer(owner)).send({ name: 'PJ', addressLine1: '2 Jalan', city: 'PJ', state: 'Narnia', postcode: '4' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post(`${P}/outlets`).set(bearer(owner)).send({ name: 'PJ', addressLine1: '2 Jalan SS2', city: 'Petaling Jaya', state: 'Selangor', postcode: '47300' });
    expect(ok.status).toBe(201);
    await request(app).patch(`${P}/outlets/${ok.body.data.id}`).set(bearer(owner)).send({ isActive: false }).expect(200);
    const list = await request(app).get(`${P}/outlets`).set(bearer(owner));
    expect(list.body.data.map((o: { name: string; isActive: boolean }) => [o.name, o.isActive])).toEqual([['Main', true], ['PJ', false]]);
  });

  it('cannot edit another merchant’s outlet', async () => {
    const { owner } = await approvedMerchant();
    const u = await db().user.findUniqueOrThrow({ where: { email: 'kamal@example.com' } });
    const other = await db().merchant.create({ data: { publicId: 'MERCHANT0002', slug: 'o', name: 'O', businessType: 'x', ssmNo: '1', status: 'APPROVED', createdById: u.id } });
    const theirs = await db().merchantOutlet.create({ data: { merchantId: other.id, name: 'Theirs', addressLine1: 'a', city: 'b', state: 'Johor', postcode: '80000' } });
    expect((await request(app).patch(`${P}/outlets/${theirs.id}`).set(bearer(owner)).send({ name: 'Mine now' })).status).toBe(404);
  });
});

describe('staff', () => {
  it('invites by email; the invitee accepts with the matching account and gets portal access', async () => {
    const { owner } = await approvedMerchant();
    const { staff } = await hire(owner, 'siti@example.com', 'CASHIER');
    const res = await request(app).get(P).set(bearer(staff));
    expect(res.body.data.role).toBe('CASHIER');
    expect(res.body.data.actions).toEqual(['listings.read', 'vouchers.redeem']);
  });

  it('stores only a hash of the invite token, and a token works once', async () => {
    const { owner } = await approvedMerchant();
    const { token } = await hire(owner, 'siti@example.com', 'CASHIER');
    expect(await db().merchantInvite.count({ where: { tokenHash: sha256(token) } })).toBe(1);
    const again = await request(app).post('/api/v1/merchant-invites/accept').set(bearer((await login('siti@example.com')).accessToken)).send({ token });
    expect(again.status).toBe(410);
  });

  it('refuses an invite accepted by a different account', async () => {
    const { owner } = await approvedMerchant();
    await request(app).post(`${P}/staff/invites`).set(bearer(owner)).send({ email: 'siti@example.com', role: 'CASHIER' }).expect(201);
    const mail = await db().emailOutbox.findFirstOrThrow({ where: { templateKey: 'merchantStaffInvite' } });
    const token = decodeURIComponent(/token=([A-Za-z0-9_%-]+)/.exec(mail.bodyText)![1]!);
    const preview = await request(app).get(`/api/v1/merchant-invites/preview?token=${encodeURIComponent(token)}`);
    expect(preview.body.data).toMatchObject({ merchant: 'Kamal Tyre', role: 'CASHIER', email: 'siti@example.com' });
    const eve = await verified('eve@example.com');
    const res = await request(app).post('/api/v1/merchant-invites/accept').set(bearer(eve)).send({ token });
    expect(res.body.error.code).toBe('INVITE_EMAIL_MISMATCH');
  });

  it('cashiers cannot manage staff; managers manage cashiers but not managers or the owner', async () => {
    const { owner } = await approvedMerchant();
    const { staff: cashier } = await hire(owner, 'c@example.com', 'CASHIER');
    expect((await request(app).get(`${P}/staff`).set(bearer(cashier))).status).toBe(403);
    expect((await request(app).post(`${P}/outlets`).set(bearer(cashier)).send({})).status).toBe(403);

    const { staff: manager } = await hire(owner, 'm@example.com', 'MANAGER');
    expect((await request(app).post(`${P}/staff/invites`).set(bearer(manager)).send({ email: 'm2@example.com', role: 'MANAGER' })).status).toBe(403);
    expect((await request(app).post(`${P}/staff/invites`).set(bearer(manager)).send({ email: 'c2@example.com', role: 'CASHIER' })).status).toBe(201);

    const list = (await request(app).get(`${P}/staff`).set(bearer(manager))).body.data.members as { id: string; role: string }[];
    const ownerSeat = list.find((x) => x.role === 'OWNER')!;
    const cashierSeat = list.find((x) => x.role === 'CASHIER')!;
    expect((await request(app).patch(`${P}/staff/${ownerSeat.id}`).set(bearer(manager)).send({ status: 'DISABLED' })).status).toBe(403);
    expect((await request(app).patch(`${P}/staff/${cashierSeat.id}`).set(bearer(manager)).send({ role: 'MANAGER' })).status).toBe(403);
    await request(app).patch(`${P}/staff/${cashierSeat.id}`).set(bearer(manager)).send({ status: 'DISABLED' }).expect(200);
    // A disabled cashier loses access at once.
    expect((await request(app).get(P).set(bearer(cashier))).status).toBe(404);
  });

  it('a new invite replaces the old one, and invites can be revoked', async () => {
    const { owner } = await approvedMerchant();
    await request(app).post(`${P}/staff/invites`).set(bearer(owner)).send({ email: 'siti@example.com', role: 'CASHIER' });
    await request(app).post(`${P}/staff/invites`).set(bearer(owner)).send({ email: 'siti@example.com', role: 'MANAGER' });
    const { invites } = (await request(app).get(`${P}/staff`).set(bearer(owner))).body.data;
    expect(invites).toHaveLength(1);
    expect(invites[0].role).toBe('MANAGER');
    await request(app).delete(`${P}/staff/invites/${invites[0].id}`).set(bearer(owner)).expect(204);
    expect((await request(app).get(`${P}/staff`).set(bearer(owner))).body.data.invites).toHaveLength(0);
  });
});
