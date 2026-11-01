import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '../src/core/db.js';
import { app, bearer, registerUser, resetDb, superAdmin, verify } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function verifiedUser(email = 'kamal@example.com', name = 'Kamal') {
  const { accessToken, user } = await registerUser(email, name);
  await verify(email);
  return { token: accessToken, user };
}

const upload = (token: string, purpose: string, body: Buffer, name = 'file') =>
  request(app).post(`/api/v1/uploads?purpose=${purpose}`).set(bearer(token)).set('Content-Type', 'application/octet-stream').set('x-file-name', name).send(body);

const FULL = {
  name: 'Kamal Tyre & Service',
  businessType: 'Tyres and servicing',
  ssmNo: '202301012345',
  phone: '03-1234 5678',
  addressLine1: '12 Jalan Klang Lama',
  city: 'Kuala Lumpur',
  state: 'Kuala Lumpur',
  postcode: '58000',
};

async function submittedApplication(token: string) {
  const app1 = await request(app).post('/api/v1/merchant-applications').set(bearer(token)).send(FULL);
  const id = app1.body.data.id as string;
  const file = await upload(token, 'MERCHANT_DOCUMENT', PDF, 'ssm.pdf');
  await request(app).post(`/api/v1/merchant-applications/${id}/documents`).set(bearer(token)).send({ type: 'SSM_CERTIFICATE', fileId: file.body.data.id }).expect(201);
  await request(app).post(`/api/v1/merchant-applications/${id}/submit`).set(bearer(token)).expect(200);
  return id;
}

describe('uploads', () => {
  it('stores an allowed file and serves a public image to anyone', async () => {
    const { token } = await verifiedUser();
    const res = await upload(token, 'MERCHANT_LOGO', PNG, 'logo.png');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ mime: 'image/png', name: 'logo.png' });
    const get = await request(app).get(res.body.data.url);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
  });

  it('judges the type by content, not by name or header', async () => {
    const { token } = await verifiedUser();
    const fake = await upload(token, 'MERCHANT_LOGO', Buffer.from('<svg onload=alert(1)>'), 'logo.png');
    expect(fake.status).toBe(415);
    expect((await upload(token, 'MERCHANT_LOGO', PDF, 'x.png')).status).toBe(415); // PDFs are not logos
  });

  it('rejects oversize files and unverified users', async () => {
    const { token } = await verifiedUser();
    expect((await upload(token, 'MERCHANT_LOGO', Buffer.concat([PNG, Buffer.alloc(2.5 * 1024 * 1024)]))).status).toBe(413);
    const fresh = await registerUser('new@example.com');
    expect((await upload(fresh.accessToken, 'MERCHANT_LOGO', PNG)).status).toBe(403);
  });

  it('keeps documents private: only the uploader and merchant reviewers can read them', async () => {
    const { token } = await verifiedUser();
    const doc = await upload(token, 'MERCHANT_DOCUMENT', PDF, 'ssm.pdf');
    const url = doc.body.data.url as string;
    expect((await request(app).get(url)).status).toBe(404);
    const other = await verifiedUser('other@example.com');
    expect((await request(app).get(url).set(bearer(other.token))).status).toBe(404);
    expect((await request(app).get(url).set(bearer(token))).status).toBe(200);
    const admin = await superAdmin();
    const asAdmin = await request(app).get(url).set(bearer(admin));
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.headers['content-disposition']).toMatch(/^attachment/);
  });
});

describe('merchant application', () => {
  it('needs a confirmed email, and only one open application at a time', async () => {
    const fresh = await registerUser('new@example.com');
    expect((await request(app).post('/api/v1/merchant-applications').set(bearer(fresh.accessToken)).send(FULL)).status).toBe(403);
    const { token } = await verifiedUser();
    expect((await request(app).post('/api/v1/merchant-applications').set(bearer(token)).send(FULL)).status).toBe(201);
    const again = await request(app).post('/api/v1/merchant-applications').set(bearer(token)).send(FULL);
    expect(again.body.error.code).toBe('APPLICATION_IN_PROGRESS');
  });

  it('lists what is missing and refuses to submit until complete', async () => {
    const { token } = await verifiedUser();
    const created = await request(app).post('/api/v1/merchant-applications').set(bearer(token)).send({ name: 'Kamal Tyre', businessType: 'Tyres' });
    const id = created.body.data.id;
    const view = await request(app).get(`/api/v1/merchant-applications/${id}`).set(bearer(token));
    expect(view.body.data.missing).toEqual(['SSM registration number', 'Business phone', 'Full business address', 'SSM certificate (upload)']);
    const submit = await request(app).post(`/api/v1/merchant-applications/${id}/submit`).set(bearer(token));
    expect(submit.status).toBe(400);
    expect(submit.body.error.code).toBe('APPLICATION_INCOMPLETE');
  });

  it('validates fields', async () => {
    const { token } = await verifiedUser();
    const res = await request(app).post('/api/v1/merchant-applications').set(bearer(token)).send({ ...FULL, postcode: '123', state: 'Atlantis' });
    expect(res.status).toBe(400);
  });

  it('cannot attach someone else’s file or edit someone else’s application', async () => {
    const a = await verifiedUser('a@example.com');
    const b = await verifiedUser('b@example.com');
    const appA = (await request(app).post('/api/v1/merchant-applications').set(bearer(a.token)).send(FULL)).body.data.id;
    const fileB = (await upload(b.token, 'MERCHANT_DOCUMENT', PDF)).body.data.id;
    expect((await request(app).post(`/api/v1/merchant-applications/${appA}/documents`).set(bearer(a.token)).send({ type: 'OTHER', fileId: fileB })).status).toBe(404);
    expect((await request(app).patch(`/api/v1/merchant-applications/${appA}`).set(bearer(b.token)).send({ name: 'Hijack' })).status).toBe(404);
  });

  it('submits, emails the applicant, and locks editing', async () => {
    const { token } = await verifiedUser();
    const id = await submittedApplication(token);
    expect((await db().merchant.findUniqueOrThrow({ where: { publicId: id } })).status).toBe('SUBMITTED');
    expect(await db().emailOutbox.count({ where: { templateKey: 'merchantApplicationReceived' } })).toBe(1);
    expect((await request(app).patch(`/api/v1/merchant-applications/${id}`).set(bearer(token)).send({ name: 'Changed' })).status).toBe(409);
  });
});

describe('admin review', () => {
  it('approves: sets the public slug, creates the first outlet, emails the owner and audits', async () => {
    const admin = await superAdmin();
    const { token } = await verifiedUser();
    const id = await submittedApplication(token);
    const queue = await request(app).get('/api/v1/admin/merchants?status=SUBMITTED').set(bearer(admin));
    expect(queue.body.data.map((m: { id: string }) => m.id)).toEqual([id]);
    const res = await request(app).post(`/api/v1/admin/merchants/${id}/approve`).set(bearer(admin)).send({});
    expect(res.body.data).toMatchObject({ status: 'APPROVED', slug: 'kamal-tyre-service' });
    const m = await db().merchant.findUniqueOrThrow({ where: { publicId: id }, include: { outlets: true } });
    expect(m.outlets).toHaveLength(1);
    expect(m.outlets[0]).toMatchObject({ city: 'Kuala Lumpur', postcode: '58000' });
    expect(await db().emailOutbox.count({ where: { templateKey: 'merchantApproved' } })).toBe(1);
    expect(await db().auditLog.count({ where: { action: 'merchant.approved' } })).toBe(1);
    // Approving twice is refused.
    expect((await request(app).post(`/api/v1/admin/merchants/${id}/approve`).set(bearer(admin)).send({})).status).toBe(409);
  });

  it('only one of two simultaneous decisions wins', async () => {
    const admin = await superAdmin();
    const id = await submittedApplication((await verifiedUser()).token);
    const results = await Promise.all([
      request(app).post(`/api/v1/admin/merchants/${id}/approve`).set(bearer(admin)).send({}),
      request(app).post(`/api/v1/admin/merchants/${id}/reject`).set(bearer(admin)).send({ note: 'Duplicate business' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('requests changes with a reason; the applicant edits and resubmits', async () => {
    const admin = await superAdmin();
    const { token } = await verifiedUser();
    const id = await submittedApplication(token);
    expect((await request(app).post(`/api/v1/admin/merchants/${id}/request-changes`).set(bearer(admin)).send({})).status).toBe(400);
    await request(app).post(`/api/v1/admin/merchants/${id}/request-changes`).set(bearer(admin)).send({ note: 'SSM certificate is unreadable' }).expect(200);
    const mine = await request(app).get(`/api/v1/merchant-applications/${id}`).set(bearer(token));
    expect(mine.body.data).toMatchObject({ status: 'CHANGES_REQUESTED', reviewNote: 'SSM certificate is unreadable' });
    await request(app).patch(`/api/v1/merchant-applications/${id}`).set(bearer(token)).send({ description: 'Tyres since 1998', website: 'https://kamal.my' }).expect(200);
    const cleared = await request(app).patch(`/api/v1/merchant-applications/${id}`).set(bearer(token)).send({ website: '' });
    expect(cleared.body.data).toMatchObject({ website: null, description: 'Tyres since 1998', ssmNo: '202301012345' });
    await request(app).post(`/api/v1/merchant-applications/${id}/submit`).set(bearer(token)).expect(200);
    expect((await db().merchant.findUniqueOrThrow({ where: { publicId: id } })).status).toBe('SUBMITTED');
  });

  it('a rejected applicant may apply again', async () => {
    const admin = await superAdmin();
    const { token } = await verifiedUser();
    const id = await submittedApplication(token);
    await request(app).post(`/api/v1/admin/merchants/${id}/reject`).set(bearer(admin)).send({ note: 'Not an automotive business' }).expect(200);
    expect((await request(app).post('/api/v1/merchant-applications').set(bearer(token)).send(FULL)).status).toBe(201);
  });

  it('suspends and reinstates an approved merchant', async () => {
    const admin = await superAdmin();
    const id = await submittedApplication((await verifiedUser()).token);
    await request(app).post(`/api/v1/admin/merchants/${id}/approve`).set(bearer(admin)).send({}).expect(200);
    await request(app).post(`/api/v1/admin/merchants/${id}/suspend`).set(bearer(admin)).send({ note: 'Customer complaints under review' }).expect(200);
    await request(app).post(`/api/v1/admin/merchants/${id}/reinstate`).set(bearer(admin)).send({}).expect(200);
    expect((await db().merchant.findUniqueOrThrow({ where: { publicId: id } })).status).toBe('APPROVED');
  });

  it('hides drafts from the default admin list and needs merchant permissions', async () => {
    const admin = await superAdmin();
    const { token } = await verifiedUser();
    await request(app).post('/api/v1/merchant-applications').set(bearer(token)).send(FULL);
    expect((await request(app).get('/api/v1/admin/merchants').set(bearer(admin))).body.data).toHaveLength(0);
    expect((await request(app).get('/api/v1/admin/merchants').set(bearer(token))).status).toBe(403);
  });
});
