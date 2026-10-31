import type { PrismaClient } from '../../generated/prisma/client.js';

export type DbProblem =
  | 'ACCESS_DENIED'
  | 'UNKNOWN_DATABASE'
  | 'CONNECTION_REFUSED'
  | 'HOST_NOT_FOUND'
  | 'TIMEOUT'
  | 'TABLES_MISSING'
  | 'UNKNOWN';

export interface HealthReport {
  status: 'ok' | 'degraded';
  time: string;
  node: string;
  uptimeSeconds: number;
  database: { ok: boolean; version?: string; problem?: DbProblem; hint?: string; error?: string };
  cron: { lastHeartbeatAt: string | null };
}

const HINTS: Record<DbProblem, string> = {
  ACCESS_DENIED: 'Wrong database user or password in DATABASE_URL',
  UNKNOWN_DATABASE: 'Database name in DATABASE_URL does not exist',
  CONNECTION_REFUSED: 'Nothing is listening at that host/port. Try 127.0.0.1 instead of localhost (or the reverse)',
  HOST_NOT_FOUND: 'Database host name in DATABASE_URL cannot be resolved',
  TIMEOUT: 'Database did not answer in time. Check the host in DATABASE_URL',
  TABLES_MISSING: 'Connected, but tables are missing. Import the migration SQL in phpMyAdmin',
  UNKNOWN: 'Unexpected database error. Check the app logs in hPanel',
};

/** Maps driver errors to a category that is safe to show publicly (no hosts, users or passwords). */
export function classifyDbError(err: unknown): DbProblem {
  const text = [
    err instanceof Error ? err.message : String(err),
    (err as { code?: unknown })?.code,
    (err as { cause?: unknown })?.cause instanceof Error ? ((err as { cause: Error }).cause.message) : '',
    JSON.stringify((err as { meta?: unknown })?.meta ?? ''),
  ].join(' ');
  if (/ER_ACCESS_DENIED|Access denied|1045/i.test(text)) return 'ACCESS_DENIED';
  if (/ER_BAD_DB_ERROR|Unknown database|1049/i.test(text)) return 'UNKNOWN_DATABASE';
  if (/ER_NO_SUCH_TABLE|P2021|doesn't exist|1146|TableDoesNotExist/i.test(text)) return 'TABLES_MISSING';
  if (/ECONNREFUSED|Connection refused/i.test(text)) return 'CONNECTION_REFUSED';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) return 'HOST_NOT_FOUND';
  if (/timeout|ETIMEDOUT|pool timeout/i.test(text)) return 'TIMEOUT';
  return 'UNKNOWN';
}

/** Health check used by uptime monitors and the Hostinger test. */
export async function getHealth(db: PrismaClient, exposeErrors = false): Promise<HealthReport> {
  const base = {
    time: new Date().toISOString(),
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
  };
  try {
    const rows = await db.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`;
    const heartbeat = await db.setting.findUnique({ where: { key: 'system.lastHeartbeatAt' } });
    return {
      status: 'ok',
      ...base,
      database: { ok: true, version: rows[0]?.version },
      cron: { lastHeartbeatAt: typeof heartbeat?.value === 'string' ? heartbeat.value : null },
    };
  } catch (err) {
    const problem = classifyDbError(err);
    return {
      status: 'degraded',
      ...base,
      database: {
        ok: false,
        problem,
        hint: HINTS[problem],
        ...(exposeErrors && err instanceof Error ? { error: err.message } : {}),
      },
      cron: { lastHeartbeatAt: null },
    };
  }
}
