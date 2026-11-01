import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '../src/core/db.js';
import { makeSendEmailsJob } from '../src/jobs/send-emails.js';
import { app, bearer, registerUser, resetDb, superAdmin } from './helpers.js';

beforeEach(resetDb);
afterAll(disconnectDb);

const ctx = () => ({ db: db(), now: new Date() });

describe('send-emails job', () => {
  it('sends queued emails once', async () => {
    await registerUser('ali@example.com');
    const sent: string[] = [];
    const job = makeSendEmailsJob(async (e) => void sent.push(e.to));
    expect((await job.run(ctx())).processed).toBe(1);
    expect((await job.run(ctx())).processed).toBe(0);
    expect(sent).toEqual(['ali@example.com']);
    expect((await db().emailOutbox.findFirstOrThrow()).status).toBe('SENT');
  });

  it('retries with backoff and gives up after 5 attempts', async () => {
    await registerUser('ali@example.com');
    const job = makeSendEmailsJob(async () => {
      throw new Error('SMTP down');
    });
    for (let i = 0; i < 5; i++) {
      await db().emailOutbox.updateMany({ data: { sendAfter: new Date(0) } }); // skip the wait
      await job.run(ctx());
    }
    const email = await db().emailOutbox.findFirstOrThrow();
    expect(email).toMatchObject({ status: 'FAILED', attempts: 5, lastError: 'SMTP down' });
  });

  it('lets an admin retry a failed email', async () => {
    const admin = await superAdmin();
    await registerUser('ali@example.com');
    const email = await db().emailOutbox.findFirstOrThrow({ where: { toEmail: 'ali@example.com' } });
    await db().emailOutbox.update({ where: { id: email.id }, data: { status: 'FAILED', attempts: 5 } });
    const res = await request(app).post(`/api/v1/admin/emails/${email.id}/retry`).set(bearer(admin));
    expect(res.status).toBe(200);
    expect((await db().emailOutbox.findUniqueOrThrow({ where: { id: email.id } })).status).toBe('QUEUED');
  });
});
