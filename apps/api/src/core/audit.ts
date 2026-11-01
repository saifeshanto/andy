import type { Prisma } from '../generated/prisma/client.js';
import type { Request } from 'express';
import { db } from './db.js';

type Tx = Prisma.TransactionClient;

export interface AuditEntry {
  actorId: bigint | null;
  action: string;
  entityType: string;
  entityId?: string | bigint | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const toJson = (v: unknown) =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))) as Prisma.InputJsonValue);

/** Writes an append-only audit row. Pass `tx` to include it in the caller's transaction. */
export async function audit(entry: AuditEntry, tx?: Tx): Promise<void> {
  await (tx ?? db()).auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: entry.ip ?? null,
    },
  });
}

export const requestIp = (req: Request) => req.ip ?? null;
