import { Router } from 'express';
import { z } from 'zod';
import { audit, requestIp } from '../../core/audit.js';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { IdParam, PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';

export const emailAdminRouter = Router();
emailAdminRouter.use('/admin/emails', requireAuth, requirePermission('admin.access'));

const Query = PaginationSchema.extend({
  status: z.enum(['QUEUED', 'SENDING', 'SENT', 'FAILED']).optional(),
  to: z.string().max(191).optional(),
});

emailAdminRouter.get('/admin/emails', requirePermission('emails.read'), async (req, res) => {
  const q = Query.parse(req.query);
  const where = { ...(q.status ? { status: q.status } : {}), ...(q.to ? { toEmail: { contains: q.to } } : {}) };
  const [rows, total] = await Promise.all([
    db().emailOutbox.findMany({
      where,
      orderBy: { id: 'desc' },
      select: { id: true, toEmail: true, templateKey: true, subject: true, status: true, attempts: true, lastError: true, sentAt: true, createdAt: true },
      ...pageArgs(q),
    }),
    db().emailOutbox.count({ where }),
  ]);
  res.json({ data: rows.map((r) => ({ ...r, id: r.id.toString() })), meta: pageMeta(q, total) });
});

emailAdminRouter.post('/admin/emails/:id/retry', requirePermission('emails.manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const updated = await db().emailOutbox.updateMany({
    where: { id, status: 'FAILED' },
    data: { status: 'QUEUED', attempts: 0, sendAfter: new Date() },
  });
  if (updated.count === 0) throw new AppError('NOT_RETRYABLE', 400, 'Only failed emails can be retried');
  await audit({ actorId: currentUser(req).id, action: 'email.retried', entityType: 'EmailOutbox', entityId: id, ip: requestIp(req) });
  res.json({ data: { queued: true } });
});
