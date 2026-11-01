// Integration tests: need a real MariaDB in DATABASE_URL with migrations applied
// (CI provides one; locally use docker, see README).
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { db, disconnectDb } from '../src/core/db.js';
import { runJob } from '../src/jobs/runner.js';

const app = createApp();
const SECRET = process.env.CRON_SECRET!;

beforeEach(async () => {
  await db().jobRun.deleteMany();
  await db().setting.deleteMany();
});

describe('tick', () => {
  it('runs every regular job via HTTP', async () => {
    const res = await request(app).post('/api/v1/internal/cron/tick').set('x-cron-secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { job: string }) => r.job)).toEqual([
      'heartbeat',
      'reconcile-payments',
      'expire-orders',
      'expire-memberships',
      'membership-reminders',
      'send-emails',
      'cleanup-tokens',
    ]);
  });
});

afterAll(async () => {
  await disconnectDb();
});

describe('GET /api/v1/system/health', () => {
  it('reports database ok', async () => {
    const res = await request(app).get('/api/v1/system/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database.ok).toBe(true);
    expect(res.body.data.cron.lastHeartbeatAt).toBeNull();
  });

  it('shows the last heartbeat after the cron job runs', async () => {
    await runJob(db(), 'heartbeat', 'cli');
    const res = await request(app).get('/api/v1/system/health');
    expect(res.body.data.cron.lastHeartbeatAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('POST /api/v1/internal/cron/:job', () => {
  it('rejects a missing or wrong secret', async () => {
    expect((await request(app).post('/api/v1/internal/cron/heartbeat')).status).toBe(403);
    const wrong = await request(app).post('/api/v1/internal/cron/heartbeat').set('x-cron-secret', 'nope');
    expect(wrong.status).toBe(403);
    expect(await db().jobRun.count()).toBe(0);
  });

  it('runs the job with the right secret and records it', async () => {
    const res = await request(app).post('/api/v1/internal/cron/heartbeat').set('x-cron-secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUCCEEDED');
    const runs = await db().jobRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.trigger).toBe('http');
  });

  it('rejects invalid job names', async () => {
    const res = await request(app).post('/api/v1/internal/cron/DROP%20TABLE').set('x-cron-secret', SECRET);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('runJob', () => {
  it('skips when a fresh run is still in progress', async () => {
    await db().jobRun.create({ data: { job: 'heartbeat', status: 'RUNNING', trigger: 'cli' } });
    const result = await runJob(db(), 'heartbeat', 'cli');
    expect(result.status).toBe('SKIPPED');
  });

  it('takes over a stale run', async () => {
    const old = new Date(Date.now() - 60 * 60_000);
    await db().jobRun.create({ data: { job: 'heartbeat', status: 'RUNNING', trigger: 'cli', startedAt: old } });
    const result = await runJob(db(), 'heartbeat', 'cli');
    expect(result.status).toBe('SUCCEEDED');
    expect(await db().jobRun.count({ where: { status: 'FAILED' } })).toBe(1);
  });

  it('skips unknown jobs without writing anything', async () => {
    const result = await runJob(db(), 'nope', 'cli');
    expect(result.status).toBe('SKIPPED');
    expect(await db().jobRun.count()).toBe(0);
  });
});
