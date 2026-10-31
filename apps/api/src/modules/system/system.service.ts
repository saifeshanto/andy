import type { PrismaClient } from '../../generated/prisma/client.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  time: string;
  node: string;
  uptimeSeconds: number;
  database: { ok: boolean; version?: string; error?: string };
  cron: { lastHeartbeatAt: string | null };
}

/** Health check used by uptime monitors and the Phase 0 Hostinger test. */
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
    return {
      status: 'degraded',
      ...base,
      database: { ok: false, error: exposeErrors && err instanceof Error ? err.message : 'Database unreachable' },
      cron: { lastHeartbeatAt: null },
    };
  }
}
