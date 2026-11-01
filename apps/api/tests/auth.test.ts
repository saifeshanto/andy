import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '../src/core/db.js';
import { APP_HEADER, PASSWORD, app, bearer, login, refreshCookie, registerUser, resetDb, tokenFromEmail, verify } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

describe('register', () => {
  it('creates a pending user, signs them in and queues a verification email', async () => {
    const { accessToken, user, cookie } = await registerUser('ali@example.com', 'Ali');
    expect(accessToken).toBeTruthy();
    expect(cookie).toMatch(/^andy_rt=/);
    expect(user).toMatchObject({ email: 'ali@example.com', status: 'PENDING_VERIFICATION', emailVerified: false, roles: [] });
    expect(await db().emailOutbox.count({ where: { toEmail: 'ali@example.com', templateKey: 'verifyEmail' } })).toBe(1);
    const stored = await db().user.findUniqueOrThrow({ where: { email: 'ali@example.com' } });
    expect(stored.passwordHash).not.toContain(PASSWORD);
  });

  it('normalises email case and rejects duplicates', async () => {
    await registerUser('Siti@Example.com');
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'siti@example.com', fullName: 'Siti', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects weak passwords', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@example.com', fullName: 'A B', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('login and me', () => {
  it('logs in and returns the profile', async () => {
    await registerUser('ali@example.com', 'Ali');
    const { res, accessToken } = await login('ali@example.com');
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/v1/auth/me').set(bearer(accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.fullName).toBe('Ali');
    expect(me.body.data.id).not.toMatch(/^\d+$/); // public id, not the internal number
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await registerUser('ali@example.com');
    const wrong = (await login('ali@example.com', 'wrong-password-1')).res;
    const unknown = (await login('nobody@example.com')).res;
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it('rejects requests without a valid token', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set(bearer('garbage'))).status).toBe(401);
  });
});

describe('refresh tokens', () => {
  it('rotates the refresh token', async () => {
    const { cookie } = await registerUser('ali@example.com');
    const res = await request(app).post('/api/v1/auth/refresh').set(APP_HEADER).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(refreshCookie(res)).not.toBe(cookie);
  });

  it('requires the app header (CSRF defence)', async () => {
    const { cookie } = await registerUser('ali@example.com');
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(403);
  });

  it('revokes the whole session when an old token is reused after the grace window', async () => {
    const { cookie } = await registerUser('ali@example.com');
    const first = await request(app).post('/api/v1/auth/refresh').set(APP_HEADER).set('Cookie', cookie);
    const newCookie = refreshCookie(first);
    // Age the rotation beyond the grace window, then replay the old token.
    await db().refreshToken.updateMany({ where: { replacedAt: { not: null } }, data: { replacedAt: new Date(Date.now() - 60_000) } });
    const replay = await request(app).post('/api/v1/auth/refresh').set(APP_HEADER).set('Cookie', cookie);
    expect(replay.status).toBe(401);
    const after = await request(app).post('/api/v1/auth/refresh').set(APP_HEADER).set('Cookie', newCookie);
    expect(after.status).toBe(401);
    expect(await db().auditLog.count({ where: { action: 'auth.refresh_reuse_detected' } })).toBe(1);
  });

  it('logout ends the session', async () => {
    const { cookie } = await registerUser('ali@example.com');
    expect((await request(app).post('/api/v1/auth/logout').set(APP_HEADER).set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').set(APP_HEADER).set('Cookie', cookie)).status).toBe(401);
  });
});

describe('email verification', () => {
  it('activates the account once, and the link cannot be reused', async () => {
    await registerUser('ali@example.com');
    const token = await tokenFromEmail('ali@example.com', 'verifyEmail');
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(200);
    const user = await db().user.findUniqueOrThrow({ where: { email: 'ali@example.com' } });
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(400);
  });

  it('makes the bootstrap email Super Admin only while none exists', async () => {
    await registerUser('owner@example.com');
    await verify('owner@example.com');
    const { accessToken } = await login('owner@example.com');
    const me = await request(app).get('/api/v1/auth/me').set(bearer(accessToken));
    expect(me.body.data.roles).toEqual(['SUPER_ADMIN']);
    expect(me.body.data.permissions).toContain('roles.assign');
  });

  it('does not grant admin to other emails', async () => {
    await registerUser('ali@example.com');
    await verify('ali@example.com');
    const { accessToken } = await login('ali@example.com');
    const me = await request(app).get('/api/v1/auth/me').set(bearer(accessToken));
    expect(me.body.data.roles).toEqual([]);
  });
});

describe('password reset', () => {
  it('does not reveal whether an email exists', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(await db().emailOutbox.count()).toBe(0);
  });

  it('resets the password, signs out other sessions and notifies the user', async () => {
    const { cookie } = await registerUser('ali@example.com');
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ali@example.com' }).expect(200);
    const token = await tokenFromEmail('ali@example.com', 'passwordReset');
    const res = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'brand-new-pass-7' });
    expect(res.status).toBe(200);
    expect((await login('ali@example.com')).res.status).toBe(401);
    expect((await login('ali@example.com', 'brand-new-pass-7')).res.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').set(APP_HEADER).set('Cookie', cookie)).status).toBe(401);
    expect(await db().emailOutbox.count({ where: { templateKey: 'passwordChanged' } })).toBe(1);
    expect((await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'another-pass-8' })).status).toBe(400);
  });

  it('only the newest reset link works', async () => {
    await registerUser('ali@example.com');
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ali@example.com' });
    const old = await tokenFromEmail('ali@example.com', 'passwordReset');
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ali@example.com' });
    expect((await request(app).post('/api/v1/auth/reset-password').send({ token: old, password: 'brand-new-pass-7' })).status).toBe(400);
  });
});
