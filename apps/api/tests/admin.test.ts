import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '../src/core/db.js';
import { APP_HEADER, app, bearer, login, registerUser, resetDb, superAdmin } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

async function memberToken(email = 'ali@example.com') {
  const { accessToken, user } = await registerUser(email);
  return { token: accessToken, publicId: user.id as string };
}

describe('admin permissions', () => {
  it('blocks normal users from every admin endpoint', async () => {
    const { token } = await memberToken();
    for (const path of ['/api/v1/admin/users', '/api/v1/admin/roles', '/api/v1/admin/settings', '/api/v1/admin/audit-log', '/api/v1/admin/emails']) {
      const res = await request(app).get(path).set(bearer(token));
      expect(res.status, path).toBe(403);
    }
  });

  it('applies role-specific permissions (Support cannot read audit log or change settings)', async () => {
    const admin = await superAdmin();
    const { publicId } = await memberToken('support@example.com');
    await request(app).put(`/api/v1/admin/users/${publicId}/roles`).set(bearer(admin)).send({ roles: ['SUPPORT'] }).expect(200);
    const { accessToken } = await login('support@example.com');
    expect((await request(app).get('/api/v1/admin/users').set(bearer(accessToken))).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/audit-log').set(bearer(accessToken))).status).toBe(403);
    expect((await request(app).put('/api/v1/admin/settings/site.name').set(bearer(accessToken)).send({ value: 'X Club' })).status).toBe(403);
  });
});

describe('admin users', () => {
  it('lists and searches users', async () => {
    const admin = await superAdmin();
    await registerUser('ali@example.com', 'Ali Ahmad');
    await registerUser('mei@example.com', 'Mei Ling');
    const res = await request(app).get('/api/v1/admin/users?q=Mei').set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { email: string }) => u.email)).toEqual(['mei@example.com']);
    expect(res.body.meta.total).toBe(1);
  });

  it('suspends a user, ends their sessions, blocks login, and audits it', async () => {
    const admin = await superAdmin();
    const { user, cookie } = await registerUser('ali@example.com');
    const res = await request(app).post(`/api/v1/admin/users/${user.id}/suspend`).set(bearer(admin)).send({ reason: 'Fraud check' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUSPENDED');
    expect((await login('ali@example.com')).res.status).toBe(403);
    expect((await request(app).post('/api/v1/auth/refresh').set(APP_HEADER).set('Cookie', cookie)).status).toBe(401);
    const log = await db().auditLog.findFirstOrThrow({ where: { action: 'user.suspended' } });
    expect(log.after).toMatchObject({ status: 'SUSPENDED', reason: 'Fraud check' });

    const back = await request(app).post(`/api/v1/admin/users/${user.id}/unsuspend`).set(bearer(admin)).send({ reason: 'Cleared' });
    expect(back.body.data.status).toBe('PENDING_VERIFICATION'); // never verified, so not ACTIVE
  });

  it('cannot suspend yourself or remove the last Super Admin', async () => {
    const admin = await superAdmin();
    const me = await request(app).get('/api/v1/auth/me').set(bearer(admin));
    const self = await request(app).post(`/api/v1/admin/users/${me.body.data.id}/suspend`).set(bearer(admin)).send({ reason: 'test' });
    expect(self.body.error.code).toBe('CANNOT_CHANGE_SELF');
    const demote = await request(app).put(`/api/v1/admin/users/${me.body.data.id}/roles`).set(bearer(admin)).send({ roles: [] });
    expect(demote.body.error.code).toBe('LAST_SUPER_ADMIN');
    expect(await db().userRole.count()).toBe(1); // rolled back
  });

  it('rejects unknown roles', async () => {
    const admin = await superAdmin();
    const { publicId } = await memberToken();
    const res = await request(app).put(`/api/v1/admin/users/${publicId}/roles`).set(bearer(admin)).send({ roles: ['GOD'] });
    expect(res.body.error.code).toBe('UNKNOWN_ROLE');
  });
});

describe('settings', () => {
  it('validates, saves and audits a setting, and exposes public ones', async () => {
    const admin = await superAdmin();
    expect((await request(app).get('/api/v1/public/settings')).body.data['site.name']).toBe('Andy Auto Club');
    const bad = await request(app).put('/api/v1/admin/settings/site.contactEmail').set(bearer(admin)).send({ value: 'not-an-email' });
    expect(bad.status).toBe(400);
    const ok = await request(app).put('/api/v1/admin/settings/site.name').set(bearer(admin)).send({ value: 'Andy Car Club' });
    expect(ok.status).toBe(200);
    expect((await request(app).get('/api/v1/public/settings')).body.data['site.name']).toBe('Andy Car Club');
    const log = await db().auditLog.findFirstOrThrow({ where: { action: 'setting.changed' } });
    expect(log).toMatchObject({ entityId: 'site.name', after: 'Andy Car Club' });
    expect((await request(app).put('/api/v1/admin/settings/nope').set(bearer(admin)).send({ value: 1 })).status).toBe(404);
  });
});

describe('roles and audit log', () => {
  it('lists roles with their permissions', async () => {
    const admin = await superAdmin();
    const res = await request(app).get('/api/v1/admin/roles').set(bearer(admin));
    expect(res.body.data.roles.map((r: { key: string }) => r.key)).toEqual(['SUPER_ADMIN', 'OPERATIONS', 'FINANCE', 'SUPPORT']);
  });

  it('shows audit entries with the actor', async () => {
    const admin = await superAdmin();
    await request(app).put('/api/v1/admin/settings/site.maintenanceMode').set(bearer(admin)).send({ value: true });
    const res = await request(app).get('/api/v1/admin/audit-log?action=setting.changed').set(bearer(admin));
    expect(res.body.data[0].actor.email).toBe('owner@example.com');
  });
});
