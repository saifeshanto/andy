import { merchantCan } from '@andy/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requestIp } from '../../core/audit.js';
import { currentUser, optionalAuth, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { IdParam, PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Prisma, VoucherCampaign } from '../../generated/prisma/client.js';
import { fileUrl } from '../files/index.js';
import { merchantAccess } from '../merchant-portal/access.js';
import { ReviewNote } from '../merchants/merchants.schemas.js';
import {
  changeCampaignState,
  claimState,
  createCampaign,
  findCampaign,
  missingForSubmit,
  presentCampaign,
  presentCampaigns,
  reviewCampaign,
  submitCampaign,
  updateCampaign,
} from './campaigns.service.js';
import { CampaignInput, CampaignPatch, CodeBody, RedeemBody, ReverseBody } from './vouchers.schemas.js';
import { claimVoucher, lookupVoucher, presentMyVouchers, presentRedemptions, redeemVoucher, reverseRedemption } from './vouchers.service.js';

export const vouchersRouter = Router();
const base = '/merchant/:merchantId/vouchers';
const CampaignParam = z.object({ campaignId: z.string().regex(/^[A-Za-z0-9]{8,24}$/) });
const CAMPAIGN_STATUS = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'ENDED']);

/** Counter lookups: 60 a minute per signed-in staff member, enough for a busy counter, too few to guess codes. */
const counterLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => `u:${currentUser(req).id}`,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many codes checked. Please wait a minute.' } },
});

// ───────── Merchant portal: offers ─────────

vouchersRouter.get(base, requireAuth, async (req, res) => {
  const { merchant } = await merchantAccess(req, 'vouchers.redeem');
  const status = CAMPAIGN_STATUS.optional().parse(req.query.status || undefined);
  const rows = await db().voucherCampaign.findMany({ where: { merchantId: merchant.id, ...(status ? { status } : {}) }, orderBy: { updatedAt: 'desc' }, take: 500 });
  res.json({ data: await presentCampaigns(rows) });
});

vouchersRouter.post(base, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'vouchers.manage', { write: true });
  const c = await createCampaign(ctx, CampaignInput.parse(req.body), requestIp(req));
  res.status(201).json({ data: { ...(await presentCampaign(c)), missing: await missingForSubmit(c) } });
});

vouchersRouter.get(`${base}/:campaignId`, requireAuth, async (req, res) => {
  const { merchant } = await merchantAccess(req, 'vouchers.redeem');
  const c = await findCampaign(merchant.id, CampaignParam.parse(req.params).campaignId);
  res.json({ data: { ...(await presentCampaign(c)), missing: await missingForSubmit(c) } });
});

vouchersRouter.patch(`${base}/:campaignId`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'vouchers.manage', { write: true });
  const c = await updateCampaign(ctx, CampaignParam.parse(req.params).campaignId, CampaignPatch.parse(req.body), requestIp(req));
  res.json({ data: { ...(await presentCampaign(c)), missing: await missingForSubmit(c) } });
});

vouchersRouter.post(`${base}/:campaignId/submit`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'vouchers.manage', { write: true });
  const { campaignId } = CampaignParam.parse(req.params);
  await submitCampaign(ctx, campaignId, requestIp(req));
  res.json({ data: await presentCampaign(await findCampaign(ctx.merchant.id, campaignId)) });
});

for (const action of ['pause', 'resume', 'end'] as const) {
  vouchersRouter.post(`${base}/:campaignId/${action}`, requireAuth, async (req, res) => {
    const ctx = await merchantAccess(req, 'vouchers.manage', { write: true });
    const c = await findCampaign(ctx.merchant.id, CampaignParam.parse(req.params).campaignId);
    await changeCampaignState({ id: ctx.user.id, ip: requestIp(req) }, c, action, 'merchant');
    res.json({ data: await presentCampaign(await findCampaign(ctx.merchant.id, c.publicId)) });
  });
}

// ───────── Merchant portal: counter ─────────

vouchersRouter.post('/merchant/:merchantId/redemptions/lookup', requireAuth, counterLimiter, async (req, res) => {
  const ctx = await merchantAccess(req, 'vouchers.redeem');
  res.json({ data: await lookupVoucher(ctx, CodeBody.parse(req.body).code) });
});

vouchersRouter.post('/merchant/:merchantId/redemptions', requireAuth, counterLimiter, async (req, res) => {
  const ctx = await merchantAccess(req, 'vouchers.redeem', { write: true });
  const body = RedeemBody.parse(req.body);
  const result = await redeemVoucher(ctx, body.code, BigInt(body.outletId), { ip: requestIp(req), userAgent: req.header('user-agent') ?? null });
  res.status(201).json({ data: result });
});

/** Owners and managers see every redemption; cashiers see only their own. */
vouchersRouter.get('/merchant/:merchantId/redemptions', requireAuth, async (req, res) => {
  const { merchant, seat, user } = await merchantAccess(req, 'vouchers.redeem');
  const q = PaginationSchema.parse(req.query);
  const where: Prisma.VoucherRedemptionWhereInput = { merchantId: merchant.id, ...(merchantCan(seat.role, 'redemptions.readAll') ? {} : { staffUserId: user.id }) };
  const [rows, total] = await Promise.all([db().voucherRedemption.findMany({ where, orderBy: { id: 'desc' }, ...pageArgs(q) }), db().voucherRedemption.count({ where })]);
  res.json({ data: await presentRedemptions(rows), meta: pageMeta(q, total) });
});

// ───────── Members ─────────

const MY_TABS = { active: ['ACTIVE'], used: ['REDEEMED'], expired: ['EXPIRED', 'VOID'] } as const;

vouchersRouter.post('/me/vouchers', requireAuth, async (req, res) => {
  const { campaignId } = z.object({ campaignId: z.string().regex(/^[A-Za-z0-9]{8,24}$/) }).parse(req.body);
  const user = currentUser(req);
  const v = await claimVoucher(user, campaignId, requestIp(req));
  const full = await db().voucher.findUniqueOrThrow({ where: { id: v.id }, include: { campaign: { include: { merchant: true } } } });
  res.status(201).json({ data: (await presentMyVouchers([full]))[0] });
});

vouchersRouter.get('/me/vouchers', requireAuth, async (req, res) => {
  const tab = z.enum(['active', 'used', 'expired']).default('active').parse(req.query.tab || undefined);
  const now = new Date();
  const userId = currentUser(req).id;
  // Expiry is checked against the clock, so a voucher moves tabs on time even before the nightly job runs.
  const where: Prisma.VoucherWhereInput =
    tab === 'active'
      ? { userId, status: 'ACTIVE', expiresAt: { gt: now } }
      : tab === 'expired'
        ? { userId, OR: [{ status: { in: [...MY_TABS.expired] } }, { status: 'ACTIVE', expiresAt: { lte: now } }] }
        : { userId, status: 'REDEEMED' };
  const rows = await db().voucher.findMany({ where, orderBy: tab === 'active' ? { expiresAt: 'asc' } : { claimedAt: 'desc' }, take: 200, include: { campaign: { include: { merchant: true } } } });
  res.json({ data: await presentMyVouchers(rows) });
});

vouchersRouter.get('/me/vouchers/:code', requireAuth, async (req, res) => {
  const code = z.string().max(20).parse(req.params.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const v = await db().voucher.findFirst({ where: { code, userId: currentUser(req).id }, include: { campaign: { include: { merchant: true } } } });
  if (!v) throw new AppError('NOT_FOUND', 404, 'Voucher not found');
  res.json({ data: (await presentMyVouchers([v], { detail: true }))[0] });
});

// ───────── Public ─────────

const LIVE = (now: Date): Prisma.VoucherCampaignWhereInput => ({
  status: 'APPROVED',
  merchant: { status: 'APPROVED' },
  claimEndAt: { gt: now },
  OR: [{ claimStartAt: null }, { claimStartAt: { lte: now } }],
});

async function publicCards(rows: VoucherCampaign[], userId?: bigint) {
  const views = await presentCampaigns(rows);
  const merchants = await db().merchant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.merchantId))] } } });
  const logos = await db().storedFile.findMany({ where: { id: { in: merchants.flatMap((m) => (m.logoFileId ? [m.logoFileId] : [])) } }, select: { id: true, publicId: true } });
  const mine = userId ? await db().voucher.groupBy({ by: ['campaignId'], where: { userId, campaignId: { in: rows.map((r) => r.id) }, status: { not: 'VOID' } }, _count: { _all: true } }) : [];
  return views.map((v, i) => {
    const row = rows[i]!;
    const m = merchants.find((x) => x.id === row.merchantId)!;
    const logo = logos.find((f) => f.id === m.logoFileId);
    return {
      id: v.id,
      slug: v.slug,
      title: v.title,
      benefit: v.benefit,
      benefitType: v.benefitType,
      memberOnly: v.memberOnly,
      claimEndAt: v.claimEndAt,
      validUntil: v.validUntil,
      validDays: v.validDays,
      remaining: v.totalQty == null ? null : Math.max(0, v.totalQty - v.claimedCount),
      perUserLimit: v.perUserLimit,
      claimState: claimState(row, m.status),
      myClaims: mine.find((x) => x.campaignId === row.id)?._count._all ?? 0,
      merchant: { name: m.name, slug: m.slug, city: m.city, state: m.state, logoUrl: logo ? fileUrl(logo.publicId) : null },
    };
  });
}

vouchersRouter.get('/public/vouchers', optionalAuth, async (req, res) => {
  const q = PaginationSchema.extend({ merchant: z.string().max(120).optional(), q: z.string().trim().max(100).optional() }).parse(req.query);
  const where: Prisma.VoucherCampaignWhereInput = {
    ...LIVE(new Date()),
    ...(q.merchant ? { merchant: { status: 'APPROVED', slug: q.merchant } } : {}),
    ...(q.q ? { AND: [{ OR: [{ title: { contains: q.q } }, { merchant: { name: { contains: q.q } } }] }] } : {}),
  };
  const [rows, total] = await Promise.all([db().voucherCampaign.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], ...pageArgs(q) }), db().voucherCampaign.count({ where })]);
  if (!req.user) res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: await publicCards(rows, req.user?.id), meta: pageMeta(q, total) });
});

vouchersRouter.get('/public/vouchers/:slug', optionalAuth, async (req, res) => {
  const { slug } = z.object({ slug: z.string().max(160) }).parse(req.params);
  // Paused or ended offers still have a page (members may hold them), but cannot be claimed.
  const c = await db().voucherCampaign.findFirst({ where: { slug, status: { in: ['APPROVED', 'PAUSED', 'ENDED'] }, merchant: { status: 'APPROVED' } } });
  if (!c) throw new AppError('NOT_FOUND', 404, 'This voucher is not available');
  const [[card], outlets] = await Promise.all([
    publicCards([c], req.user?.id),
    db().merchantOutlet.findMany({ where: { isActive: true, campaigns: { some: { campaignId: c.id } } }, orderBy: { id: 'asc' } }),
  ]);
  if (!req.user) res.set('Cache-Control', 'public, max-age=60');
  res.json({
    data: {
      ...card,
      terms: c.terms,
      claimStartAt: c.claimStartAt,
      outlets: outlets.map((o) => ({ id: o.id.toString(), name: o.name, addressLine1: o.addressLine1, addressLine2: o.addressLine2, city: o.city, state: o.state, postcode: o.postcode, phone: o.phone, hours: o.hours })),
    },
  });
});

// ───────── Admin ─────────

vouchersRouter.get('/admin/voucher-approvals', requireAuth, requirePermission('admin.access', 'vouchers.review'), async (_req, res) => {
  const rows = await db().voucherCampaign.findMany({ where: { status: 'PENDING' }, orderBy: { submittedAt: 'asc' }, take: 200, include: { merchant: { select: { name: true } } } });
  res.json({ data: rows.map((c) => ({ id: c.publicId, title: c.title, merchant: c.merchant.name, at: c.submittedAt })) });
});

vouchersRouter.get('/admin/vouchers', requireAuth, requirePermission('admin.access', 'merchants.read'), async (req, res) => {
  const q = PaginationSchema.extend({ status: CAMPAIGN_STATUS.optional(), q: z.string().trim().max(100).optional() }).parse(req.query);
  const where: Prisma.VoucherCampaignWhereInput = { status: q.status ?? { not: 'DRAFT' }, ...(q.q ? { OR: [{ title: { contains: q.q } }, { merchant: { name: { contains: q.q } } }] } : {}) };
  const [rows, total] = await Promise.all([db().voucherCampaign.findMany({ where, orderBy: { updatedAt: 'desc' }, ...pageArgs(q), include: { merchant: { select: { name: true } } } }), db().voucherCampaign.count({ where })]);
  const views = await presentCampaigns(rows);
  res.json({ data: views.map((v, i) => ({ ...v, merchant: rows[i]!.merchant.name })), meta: pageMeta(q, total) });
});

vouchersRouter.get('/admin/vouchers/:campaignId', requireAuth, requirePermission('admin.access', 'merchants.read'), async (req, res) => {
  const c = await db().voucherCampaign.findUnique({ where: { publicId: CampaignParam.parse(req.params).campaignId }, include: { merchant: true } });
  if (!c) throw new AppError('NOT_FOUND', 404, 'Voucher not found');
  const outlets = await db().merchantOutlet.findMany({ where: { campaigns: { some: { campaignId: c.id } } } });
  res.json({
    data: {
      ...(await presentCampaign(c)),
      merchant: { id: c.merchant.publicId, name: c.merchant.name, status: c.merchant.status },
      outlets: outlets.map((o) => ({ id: o.id.toString(), name: o.name, city: o.city, state: o.state, isActive: o.isActive })),
    },
  });
});

vouchersRouter.post('/admin/vouchers/:campaignId/approve', requireAuth, requirePermission('admin.access', 'vouchers.review'), async (req, res) => {
  const c = await reviewCampaign({ id: currentUser(req).id, ip: requestIp(req) }, CampaignParam.parse(req.params).campaignId, 'approve');
  res.json({ data: await presentCampaign(c) });
});

vouchersRouter.post('/admin/vouchers/:campaignId/reject', requireAuth, requirePermission('admin.access', 'vouchers.review'), async (req, res) => {
  const { note } = ReviewNote.parse(req.body);
  const c = await reviewCampaign({ id: currentUser(req).id, ip: requestIp(req) }, CampaignParam.parse(req.params).campaignId, 'reject', note);
  res.json({ data: await presentCampaign(c) });
});

vouchersRouter.post('/admin/vouchers/:campaignId/end', requireAuth, requirePermission('admin.access', 'vouchers.manage'), async (req, res) => {
  const c = await db().voucherCampaign.findUnique({ where: { publicId: CampaignParam.parse(req.params).campaignId } });
  if (!c) throw new AppError('NOT_FOUND', 404, 'Voucher not found');
  await changeCampaignState({ id: currentUser(req).id, ip: requestIp(req) }, c, 'end', 'admin');
  res.json({ data: await presentCampaign(await db().voucherCampaign.findUniqueOrThrow({ where: { id: c.id } })) });
});

vouchersRouter.get('/admin/redemptions', requireAuth, requirePermission('admin.access', 'merchants.read'), async (req, res) => {
  const q = PaginationSchema.extend({ code: z.string().trim().max(20).optional() }).parse(req.query);
  const code = q.code?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const where: Prisma.VoucherRedemptionWhereInput = code ? { voucher: { code } } : {};
  const [rows, total] = await Promise.all([db().voucherRedemption.findMany({ where, orderBy: { id: 'desc' }, ...pageArgs(q) }), db().voucherRedemption.count({ where })]);
  res.json({ data: await presentRedemptions(rows, { fullNames: true }), meta: pageMeta(q, total) });
});

vouchersRouter.post('/admin/redemptions/:id/reverse', requireAuth, requirePermission('admin.access', 'vouchers.manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  await reverseRedemption({ id: currentUser(req).id, ip: requestIp(req) }, id, ReverseBody.parse(req.body).reason);
  res.status(204).end();
});
