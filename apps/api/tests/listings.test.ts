import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '../src/core/db.js';
import { app, bearer, login, registerUser, resetDb, superAdmin, verify } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
const P = '/api/v1/merchant/MERCHANT0001';

async function verified(email: string, name = 'User') {
  await registerUser(email, name);
  await verify(email);
  return (await login(email)).accessToken;
}

async function setup() {
  const owner = await verified('kamal@example.com', 'Kamal');
  const u = await db().user.findUniqueOrThrow({ where: { email: 'kamal@example.com' } });
  const m = await db().merchant.create({ data: { publicId: 'MERCHANT0001', slug: 'kamal-tyre', name: 'Kamal Tyre', businessType: 'Tyres', ssmNo: '1', status: 'APPROVED', createdById: u.id } });
  await db().merchantMember.create({ data: { merchantId: m.id, userId: u.id, role: 'OWNER' } });
  const outlet = await db().merchantOutlet.create({ data: { merchantId: m.id, name: 'Main', addressLine1: '1 Jalan', city: 'Petaling Jaya', state: 'Selangor', postcode: '47300' } });
  const tyres = await db().category.findUniqueOrThrow({ where: { slug: 'tyres' } });
  return { owner, m, outlet, tyres, admin: await superAdmin() };
}

const photo = async (token: string) => (await request(app).post('/api/v1/uploads?purpose=LISTING_IMAGE').set(bearer(token)).set('Content-Type', 'application/octet-stream').send(PNG)).body.data.id as string;

async function draft(s: Awaited<ReturnType<typeof setup>>, extra: object = {}) {
  const res = await request(app)
    .post(`${P}/listings`)
    .set(bearer(s.owner))
    .send({ type: 'PRODUCT', categoryId: s.tyres.id, title: 'Michelin Pilot Sport 5 225/45R17', description: 'Set of four, fitted and balanced.', priceSen: 180000, memberPriceSen: 162000, stockQty: 12, outletIds: [s.outlet.id.toString()], imageFileIds: [await photo(s.owner)], ...extra });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data as { id: string; missing: string[] };
}

async function live(s: Awaited<ReturnType<typeof setup>>) {
  const d = await draft(s);
  await request(app).post(`${P}/listings/${d.id}/submit`).set(bearer(s.owner)).expect(200);
  await request(app).post(`/api/v1/admin/listings/${d.id}/approve`).set(bearer(s.admin)).send({}).expect(200);
  return d.id;
}

describe('categories', () => {
  it('starts with the plan’s categories; admins can add and hide them', async () => {
    const admin = await superAdmin();
    const pub = await request(app).get('/api/v1/public/categories');
    expect(pub.body.data.map((c: { name: string }) => c.name)).toEqual(['Servicing', 'Tyres', 'Car wash & detailing', 'Accessories', 'Insurance', 'Towing']);
    const created = await request(app).post('/api/v1/admin/categories').set(bearer(admin)).send({ name: 'Windscreen', sort: 70 });
    expect(created.body.data.slug).toBe('windscreen');
    await request(app).patch(`/api/v1/admin/categories/${created.body.data.id}`).set(bearer(admin)).send({ isActive: false }).expect(200);
    expect((await request(app).get('/api/v1/public/categories')).body.data).toHaveLength(6);
  });
});

describe('merchant listings', () => {
  it('creates a draft; validates member price and type-specific fields', async () => {
    const s = await setup();
    const bad = await request(app).post(`${P}/listings`).set(bearer(s.owner)).send({ type: 'PRODUCT', categoryId: s.tyres.id, title: 'Tyre', description: 'A good tyre for you', priceSen: 100, memberPriceSen: 200 });
    expect(bad.status).toBe(400);
    const svc = await draft(s, { type: 'SERVICE', stockQty: 5, durationMinutes: 60 });
    const row = await db().listing.findUniqueOrThrow({ where: { publicId: svc.id } });
    expect(row).toMatchObject({ status: 'DRAFT', stockQty: null, durationMinutes: 60 });
  });

  it('will not submit without a photo and an outlet', async () => {
    const s = await setup();
    const d = await draft(s, { imageFileIds: [], outletIds: [] });
    expect(d.missing).toEqual(['At least one photo', 'At least one open outlet where it is available']);
    expect((await request(app).post(`${P}/listings/${d.id}/submit`).set(bearer(s.owner))).status).toBe(400);
  });

  it('cannot use another user’s photo or another merchant’s outlet', async () => {
    const s = await setup();
    const eve = await verified('eve@example.com');
    const theirs = await photo(eve);
    expect((await request(app).post(`${P}/listings`).set(bearer(s.owner)).send({ type: 'PRODUCT', categoryId: s.tyres.id, title: 'Tyre set', description: 'Four tyres fitted', priceSen: 100, imageFileIds: [theirs] })).status).toBe(400);
    expect((await request(app).post(`${P}/listings`).set(bearer(s.owner)).send({ type: 'PRODUCT', categoryId: s.tyres.id, title: 'Tyre set', description: 'Four tyres fitted', priceSen: 100, outletIds: ['999999'] })).status).toBe(400);
  });

  it('cashiers can read listings but not change them', async () => {
    const s = await setup();
    const c = await verified('c@example.com');
    const cu = await db().user.findUniqueOrThrow({ where: { email: 'c@example.com' } });
    await db().merchantMember.create({ data: { merchantId: s.m.id, userId: cu.id, role: 'CASHIER' } });
    expect((await request(app).get(`${P}/listings`).set(bearer(c))).status).toBe(200);
    expect((await request(app).post(`${P}/listings`).set(bearer(c)).send({})).status).toBe(403);
  });
});

describe('approval and the marketplace', () => {
  it('is hidden until approved, then appears with a readable slug', async () => {
    const s = await setup();
    const d = await draft(s);
    await request(app).post(`${P}/listings/${d.id}/submit`).set(bearer(s.owner)).expect(200);
    expect((await request(app).get('/api/v1/public/listings')).body.data).toHaveLength(0);
    // Locked while waiting for review.
    expect((await request(app).patch(`${P}/listings/${d.id}`).set(bearer(s.owner)).send({ title: 'x title' })).status).toBe(409);
    const queue = await request(app).get('/api/v1/admin/listing-approvals').set(bearer(s.admin));
    expect(queue.body.data).toEqual([expect.objectContaining({ kind: 'NEW', listingId: d.id })]);
    await request(app).post(`/api/v1/admin/listings/${d.id}/approve`).set(bearer(s.admin)).send({}).expect(200);
    const pub = await request(app).get('/api/v1/public/listings');
    expect(pub.body.data[0]).toMatchObject({ title: 'Michelin Pilot Sport 5 225/45R17', priceSen: 180000, memberPriceSen: 162000, merchant: { name: 'Kamal Tyre' } });
    expect(pub.body.data[0].slug).toBe('michelin-pilot-sport-5-225-45r17-kamal-tyre');
    const detail = await request(app).get(`/api/v1/public/listings/${pub.body.data[0].slug}`);
    expect(detail.body.data.outlets[0]).toMatchObject({ city: 'Petaling Jaya' });
    expect(detail.body.data).not.toHaveProperty('reviewNote');
    expect(await db().emailOutbox.count({ where: { templateKey: 'listingApproved' } })).toBe(1);
  });

  it('a rejected listing goes back to draft when edited and can be resubmitted', async () => {
    const s = await setup();
    const d = await draft(s);
    await request(app).post(`${P}/listings/${d.id}/submit`).set(bearer(s.owner));
    expect((await request(app).post(`/api/v1/admin/listings/${d.id}/reject`).set(bearer(s.admin)).send({})).status).toBe(400);
    await request(app).post(`/api/v1/admin/listings/${d.id}/reject`).set(bearer(s.admin)).send({ note: 'Photo is not of the product' }).expect(200);
    const after = await request(app).patch(`${P}/listings/${d.id}`).set(bearer(s.owner)).send({ imageFileIds: [await photo(s.owner)] });
    expect(after.body.data.status).toBe('DRAFT');
    await request(app).post(`${P}/listings/${d.id}/submit`).set(bearer(s.owner)).expect(200);
  });

  it('price changes on a live listing wait for approval; stock changes apply at once', async () => {
    const s = await setup();
    const id = await live(s);
    const res = await request(app).patch(`${P}/listings/${id}`).set(bearer(s.owner)).send({ priceSen: 170000, stockQty: 3 });
    expect(res.body.data).toMatchObject({ status: 'APPROVED', priceSen: 180000, stockQty: 3 });
    expect(res.body.data.pendingChanges.data).toEqual({ priceSen: 170000 });
    // Still the old price publicly.
    expect((await request(app).get('/api/v1/public/listings')).body.data[0].priceSen).toBe(180000);
    // A second edit merges into the same pending change.
    await request(app).patch(`${P}/listings/${id}`).set(bearer(s.owner)).send({ title: 'Michelin PS5 225/45R17 (set of 4)' });
    const rev = await db().listingRevision.findFirstOrThrow({ where: { status: 'PENDING' } });
    expect(rev.data).toEqual({ priceSen: 170000, title: 'Michelin PS5 225/45R17 (set of 4)' });
    expect(await db().listingRevision.count()).toBe(1);
    await request(app).post(`/api/v1/admin/listing-revisions/${rev.id}/approve`).set(bearer(s.admin)).send({}).expect(200);
    expect((await request(app).get('/api/v1/public/listings')).body.data[0]).toMatchObject({ priceSen: 170000, title: 'Michelin PS5 225/45R17 (set of 4)' });
  });

  it('rejects a change that would put the member price above the normal price', async () => {
    const s = await setup();
    const id = await live(s);
    expect((await request(app).patch(`${P}/listings/${id}`).set(bearer(s.owner)).send({ priceSen: 100000 })).status).toBe(400);
  });

  it('suspending the merchant hides its listings; archiving hides one', async () => {
    const s = await setup();
    const id = await live(s);
    await db().merchant.update({ where: { id: s.m.id }, data: { status: 'SUSPENDED' } });
    expect((await request(app).get('/api/v1/public/listings')).body.data).toHaveLength(0);
    expect((await request(app).get('/api/v1/public/merchants/kamal-tyre')).status).toBe(404);
    await db().merchant.update({ where: { id: s.m.id }, data: { status: 'APPROVED' } });
    await request(app).post(`${P}/listings/${id}/archive`).set(bearer(s.owner)).expect(200);
    expect((await request(app).get('/api/v1/public/listings')).body.data).toHaveLength(0);
  });

  it('filters by category, state and search, and sorts by price', async () => {
    const s = await setup();
    await live(s);
    const servicing = await db().category.findUniqueOrThrow({ where: { slug: 'servicing' } });
    const d = await draft(s, { type: 'SERVICE', categoryId: servicing.id, title: 'Full service with oil change', priceSen: 25000, memberPriceSen: null, durationMinutes: 90 });
    await request(app).post(`${P}/listings/${d.id}/submit`).set(bearer(s.owner));
    await request(app).post(`/api/v1/admin/listings/${d.id}/approve`).set(bearer(s.admin)).send({});
    const get = (qs: string) => request(app).get(`/api/v1/public/listings?${qs}`).then((r) => r.body.data.map((x: { title: string }) => x.title));
    expect(await get('category=servicing')).toEqual(['Full service with oil change']);
    expect(await get('state=Johor')).toEqual([]);
    expect(await get('state=Selangor&sort=price_asc')).toEqual(['Full service with oil change', 'Michelin Pilot Sport 5 225/45R17']);
    expect(await get('q=oil')).toEqual(['Full service with oil change']);
    const mp = await request(app).get('/api/v1/public/merchants/kamal-tyre');
    expect(mp.body.data.listings).toHaveLength(2);
    expect((await request(app).get('/api/v1/public/merchants')).body.data[0]).toMatchObject({ name: 'Kamal Tyre', listings: 2 });
  });

  it('only listing reviewers can approve', async () => {
    const s = await setup();
    const d = await draft(s);
    await request(app).post(`${P}/listings/${d.id}/submit`).set(bearer(s.owner));
    expect((await request(app).post(`/api/v1/admin/listings/${d.id}/approve`).set(bearer(s.owner)).send({})).status).toBe(403);
  });
});
