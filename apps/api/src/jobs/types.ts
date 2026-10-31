import type { PrismaClient } from '../generated/prisma/client.js';

export interface JobContext {
  db: PrismaClient;
  now: Date;
}

/**
 * A cron job. Must be idempotent (safe to run twice), bounded (batches, finishes well
 * inside the cron interval) and must not rely on in-memory state. See AGENTS.md section 8.
 */
export interface Job {
  name: string;
  /** A RUNNING row older than this is treated as crashed, so a new run may start. */
  staleAfterMinutes: number;
  run(ctx: JobContext): Promise<{ processed: number }>;
}
