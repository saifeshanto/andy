import type { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../core/logger.js';
import { jobs } from './registry.js';

export type RunResult =
  | { status: 'SUCCEEDED'; processed: number; runId: string }
  | { status: 'SKIPPED'; reason: string }
  | { status: 'FAILED'; error: string; runId: string };

/**
 * Runs a registered job once, recording it in JobRun.
 * Skips if another run of the same job is still RUNNING and not stale.
 */
export async function runJob(db: PrismaClient, name: string, trigger: 'cli' | 'http'): Promise<RunResult> {
  const job = jobs[name];
  if (!job) return { status: 'SKIPPED', reason: `Unknown job "${name}"` };

  const now = new Date();
  const staleBefore = new Date(now.getTime() - job.staleAfterMinutes * 60_000);

  const run = await db.$transaction(async (tx) => {
    const active = await tx.jobRun.findFirst({
      where: { job: name, status: 'RUNNING', startedAt: { gt: staleBefore } },
    });
    if (active) return null;
    await tx.jobRun.updateMany({
      where: { job: name, status: 'RUNNING', startedAt: { lte: staleBefore } },
      data: { status: 'FAILED', finishedAt: now, error: 'Marked stale by a later run' },
    });
    return tx.jobRun.create({ data: { job: name, status: 'RUNNING', trigger } });
  });

  if (!run) {
    await db.jobRun.create({ data: { job: name, status: 'SKIPPED', trigger, finishedAt: new Date() } });
    return { status: 'SKIPPED', reason: 'Previous run still in progress' };
  }

  try {
    const { processed } = await job.run({ db, now });
    await db.jobRun.update({
      where: { id: run.id },
      data: { status: 'SUCCEEDED', finishedAt: new Date(), processed },
    });
    logger.info({ job: name, processed }, 'Job succeeded');
    return { status: 'SUCCEEDED', processed, runId: run.id.toString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.jobRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: message.slice(0, 5000) },
    });
    logger.error({ job: name, err }, 'Job failed');
    return { status: 'FAILED', error: message, runId: run.id.toString() };
  }
}
