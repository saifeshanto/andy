import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { runJob } from '../../jobs/runner.js';
import { getHealth } from './system.service.js';

export const systemRouter = Router();

systemRouter.get('/system/health', async (_req, res) => {
  const report = await getHealth(db(), env().NODE_ENV !== 'production');
  res.status(report.status === 'ok' ? 200 : 503).json({ data: report });
});

function secretMatches(given: string | undefined): boolean {
  const expected = Buffer.from(env().CRON_SECRET);
  const actual = Buffer.from(given ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * HTTP fallback for Hostinger cron, for when a CLI command cannot be used:
 *   curl -fsS -X POST -H "x-cron-secret: $SECRET" https://<domain>/api/v1/internal/cron/heartbeat
 */
export const internalRouter = Router();

internalRouter.post('/internal/cron/:job', async (req, res) => {
  if (!secretMatches(req.header('x-cron-secret'))) {
    throw new AppError('FORBIDDEN', 403, 'Invalid cron secret');
  }
  const { job } = z.object({ job: z.string().regex(/^[a-z0-9-]{1,60}$/) }).parse(req.params);
  const result = await runJob(db(), job, 'http');
  res.status(result.status === 'FAILED' ? 500 : 200).json({ data: result });
});
