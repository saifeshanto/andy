import { Router } from 'express';
import { z } from 'zod';
import { requestIp } from '../../core/audit.js';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationDraft, MY_STATES, ReviewNote } from './merchants.schemas.js';
import {
  addDocument,
  createApplication,
  decide,
  missingForSubmit,
  ownApplication,
  presentMerchant,
  removeDocument,
  submitApplication,
  updateApplication,
} from './merchants.service.js';

export const merchantsRouter = Router();
const MerchantParam = z.object({ merchantId: z.string().regex(/^[A-Za-z0-9]{8,24}$/) });
const DocumentBody = z.object({ type: z.enum(['SSM_CERTIFICATE', 'OWNER_IC', 'BANK_STATEMENT', 'OTHER']), fileId: z.string().min(10).max(32) });

merchantsRouter.get('/public/my-states', (_req, res) => {
  res.json({ data: MY_STATES });
});

// ───────── Applicant ─────────

/** Merchants the signed-in user belongs to (any role), including their own applications. */
merchantsRouter.get('/me/merchants', requireAuth, async (req, res) => {
  const seats = await db().merchantMember.findMany({ where: { userId: currentUser(req).id, status: 'ACTIVE' }, include: { merchant: true }, orderBy: { id: 'asc' } });
  res.json({
    data: await Promise.all(seats.map(async (s) => ({ role: s.role, merchant: await presentMerchant(s.merchant) }))),
  });
});

merchantsRouter.post('/merchant-applications', requireAuth, async (req, res) => {
  const m = await createApplication(currentUser(req), ApplicationDraft.parse(req.body));
  res.status(201).json({ data: await presentMerchant(m, { documents: true }) });
});

merchantsRouter.get('/merchant-applications/:merchantId', requireAuth, async (req, res) => {
  const m = await ownApplication(currentUser(req).id, MerchantParam.parse(req.params).merchantId);
  res.json({ data: { ...(await presentMerchant(m, { documents: true })), missing: await missingForSubmit(m) } });
});

merchantsRouter.patch('/merchant-applications/:merchantId', requireAuth, async (req, res) => {
  const { merchantId } = MerchantParam.parse(req.params);
  const m = await updateApplication(currentUser(req).id, merchantId, ApplicationDraft.partial().parse(req.body));
  res.json({ data: { ...(await presentMerchant(m, { documents: true })), missing: await missingForSubmit(m) } });
});

merchantsRouter.post('/merchant-applications/:merchantId/documents', requireAuth, async (req, res) => {
  const { merchantId } = MerchantParam.parse(req.params);
  const body = DocumentBody.parse(req.body);
  await addDocument(currentUser(req).id, merchantId, body.type, body.fileId);
  const m = await ownApplication(currentUser(req).id, merchantId);
  res.status(201).json({ data: { ...(await presentMerchant(m, { documents: true })), missing: await missingForSubmit(m) } });
});

merchantsRouter.delete('/merchant-applications/:merchantId/documents/:documentId', requireAuth, async (req, res) => {
  const { merchantId, documentId } = MerchantParam.extend({ documentId: z.coerce.bigint() }).parse(req.params);
  await removeDocument(currentUser(req).id, merchantId, documentId);
  res.status(204).end();
});

merchantsRouter.post('/merchant-applications/:merchantId/submit', requireAuth, async (req, res) => {
  const { merchantId } = MerchantParam.parse(req.params);
  await submitApplication(currentUser(req), merchantId);
  const m = await ownApplication(currentUser(req).id, merchantId);
  res.json({ data: await presentMerchant(m, { documents: true }) });
});

// ───────── Admin ─────────

const AdminQuery = PaginationSchema.extend({
  status: z.enum(['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
  q: z.string().trim().max(100).optional(),
});

merchantsRouter.get('/admin/merchants', requireAuth, requirePermission('admin.access', 'merchants.read'), async (req, res) => {
  const q = AdminQuery.parse(req.query);
  // Drafts are private to the applicant until submitted, so they are only listed when asked for explicitly.
  const where: Prisma.MerchantWhereInput = { status: q.status ?? { not: 'DRAFT' } };
  if (q.q) where.OR = [{ name: { contains: q.q } }, { ssmNo: { contains: q.q } }, { email: { contains: q.q } }];
  const orderBy: Prisma.MerchantOrderByWithRelationInput[] = q.status === 'SUBMITTED' ? [{ submittedAt: 'asc' }] : [{ id: 'desc' }];
  const [rows, total] = await Promise.all([db().merchant.findMany({ where, orderBy, ...pageArgs(q) }), db().merchant.count({ where })]);
  res.json({ data: await Promise.all(rows.map((m) => presentMerchant(m))), meta: pageMeta(q, total) });
});

merchantsRouter.get('/admin/merchants/:merchantId', requireAuth, requirePermission('admin.access', 'merchants.read'), async (req, res) => {
  const m = await db().merchant.findUnique({ where: { publicId: MerchantParam.parse(req.params).merchantId } });
  if (!m) throw new AppError('NOT_FOUND', 404, 'Merchant not found');
  const [members, outlets, creator] = await Promise.all([
    db().merchantMember.findMany({ where: { merchantId: m.id }, orderBy: { id: 'asc' } }),
    db().merchantOutlet.findMany({ where: { merchantId: m.id }, orderBy: { id: 'asc' } }),
    db().user.findUnique({ where: { id: m.createdById }, select: { publicId: true, email: true, fullName: true } }),
  ]);
  const users = await db().user.findMany({ where: { id: { in: members.map((x) => x.userId) } }, select: { id: true, publicId: true, email: true, fullName: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({
    data: {
      ...(await presentMerchant(m, { documents: true })),
      applicant: creator && { id: creator.publicId, email: creator.email, fullName: creator.fullName },
      staff: members.map((x) => ({ role: x.role, status: x.status, user: { id: byId.get(x.userId)?.publicId, email: byId.get(x.userId)?.email, fullName: byId.get(x.userId)?.fullName } })),
      outlets: outlets.map((o) => ({ id: o.id.toString(), name: o.name, city: o.city, state: o.state, isActive: o.isActive })),
    },
  });
});

const decisionRoute = (path: string, decision: Parameters<typeof decide>[2], perm: 'merchants.review' | 'merchants.manage', needsNote: boolean) =>
  merchantsRouter.post(`/admin/merchants/:merchantId/${path}`, requireAuth, requirePermission('admin.access', perm), async (req, res) => {
    const { merchantId } = MerchantParam.parse(req.params);
    const note = needsNote ? ReviewNote.parse(req.body).note : z.object({ note: z.string().trim().max(1000).optional() }).parse(req.body ?? {}).note;
    const m = await decide({ id: currentUser(req).id, ip: requestIp(req) }, merchantId, decision, note || undefined);
    res.json({ data: await presentMerchant(m, { documents: true }) });
  });

decisionRoute('approve', 'approve', 'merchants.review', false);
decisionRoute('request-changes', 'requestChanges', 'merchants.review', true);
decisionRoute('reject', 'reject', 'merchants.review', true);
decisionRoute('suspend', 'suspend', 'merchants.manage', true);
decisionRoute('reinstate', 'reinstate', 'merchants.manage', false);
