import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const auditRouter = Router();

const Query = PaginationSchema.extend({
  action: z.string().max(100).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
});

auditRouter.get('/admin/audit-log', requireAuth, requirePermission('admin.access', 'audit.read'), async (req, res) => {
  const q = Query.parse(req.query);
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: q.action } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
  };
  const [rows, total] = await Promise.all([
    db().auditLog.findMany({ where, orderBy: { id: 'desc' }, ...pageArgs(q) }),
    db().auditLog.count({ where }),
  ]);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is bigint => x !== null))];
  const actors = await db().user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true, fullName: true } });
  const byId = new Map(actors.map((a) => [a.id, a]));
  res.json({
    data: rows.map((r) => ({
      id: r.id.toString(),
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      ip: r.ip,
      createdAt: r.createdAt,
      actor: r.actorId ? { email: byId.get(r.actorId)?.email ?? null, name: byId.get(r.actorId)?.fullName ?? null } : null,
    })),
    meta: pageMeta(q, total),
  });
});
