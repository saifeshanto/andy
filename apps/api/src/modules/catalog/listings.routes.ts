import { Router } from 'express';
import { z } from 'zod';
import { requestIp } from '../../core/audit.js';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { merchantAccess } from '../merchant-portal/access.js';
import { ReviewNote } from '../merchants/merchants.schemas.js';
import { ListingInput, ListingPatch } from './listings.schemas.js';
import {
  archiveListing,
  cancelRevision,
  createListing,
  findListing,
  missingForSubmit,
  presentListing,
  presentListings,
  reviewListing,
  reviewRevision,
  submitListing,
  updateListing,
} from './listings.service.js';

export const listingsRouter = Router();
const base = '/merchant/:merchantId/listings';
const ListingParam = z.object({ listingId: z.string().regex(/^[A-Za-z0-9]{8,24}$/) });

// ───────── Merchant portal ─────────

listingsRouter.get(base, requireAuth, async (req, res) => {
  const { merchant } = await merchantAccess(req, 'listings.read');
  const status = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional().parse(req.query.status || undefined);
  const rows = await db().listing.findMany({ where: { merchantId: merchant.id, status: status ?? { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' }, take: 500 });
  res.json({ data: await presentListings(rows) });
});

listingsRouter.post(base, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'listings.manage', { write: true });
  const l = await createListing(ctx, ListingInput.parse(req.body), requestIp(req));
  res.status(201).json({ data: { ...(await presentListing(l)), missing: await missingForSubmit(l) } });
});

listingsRouter.get(`${base}/:listingId`, requireAuth, async (req, res) => {
  const { merchant } = await merchantAccess(req, 'listings.read');
  const l = await findListing(merchant.id, ListingParam.parse(req.params).listingId);
  res.json({ data: { ...(await presentListing(l)), missing: await missingForSubmit(l) } });
});

listingsRouter.patch(`${base}/:listingId`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'listings.manage', { write: true });
  const l = await updateListing(ctx, ListingParam.parse(req.params).listingId, ListingPatch.parse(req.body), requestIp(req));
  res.json({ data: { ...(await presentListing(l)), missing: await missingForSubmit(l) } });
});

listingsRouter.post(`${base}/:listingId/submit`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'listings.manage', { write: true });
  const { listingId } = ListingParam.parse(req.params);
  await submitListing(ctx, listingId, requestIp(req));
  res.json({ data: await presentListing(await findListing(ctx.merchant.id, listingId)) });
});

listingsRouter.post(`${base}/:listingId/archive`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'listings.manage', { write: true });
  const { listingId } = ListingParam.parse(req.params);
  await archiveListing(ctx, listingId, requestIp(req));
  res.json({ data: await presentListing(await findListing(ctx.merchant.id, listingId)) });
});

listingsRouter.delete(`${base}/:listingId/pending-changes`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'listings.manage', { write: true });
  await cancelRevision(ctx, ListingParam.parse(req.params).listingId, requestIp(req));
  res.status(204).end();
});

// ───────── Admin review ─────────

const adminOnly = [requireAuth, requirePermission('admin.access', 'listings.review')];

/** The approval queue: new listings and changes to live listings, oldest first. */
listingsRouter.get('/admin/listing-approvals', ...adminOnly, async (_req, res) => {
  const [listings, revisions] = await Promise.all([
    db().listing.findMany({ where: { status: 'PENDING' }, orderBy: { submittedAt: 'asc' }, take: 200, include: { merchant: { select: { name: true, publicId: true } } } }),
    db().listingRevision.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 200, include: { listing: { include: { merchant: { select: { name: true, publicId: true } } } } } }),
  ]);
  res.json({
    data: [
      ...listings.map((l) => ({ kind: 'NEW' as const, listingId: l.publicId, revisionId: null, title: l.title, merchant: l.merchant.name, at: l.submittedAt })),
      ...revisions.map((r) => ({ kind: 'CHANGES' as const, listingId: r.listing.publicId, revisionId: r.id.toString(), title: r.listing.title, merchant: r.listing.merchant.name, at: r.createdAt })),
    ].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)),
  });
});

listingsRouter.get('/admin/listings', requireAuth, requirePermission('admin.access', 'merchants.read'), async (req, res) => {
  const q = PaginationSchema.extend({ status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(), q: z.string().trim().max(100).optional() }).parse(req.query);
  const where: Prisma.ListingWhereInput = { status: q.status ?? { not: 'DRAFT' }, ...(q.q ? { title: { contains: q.q } } : {}) };
  const [rows, total] = await Promise.all([db().listing.findMany({ where, orderBy: { updatedAt: 'desc' }, ...pageArgs(q) }), db().listing.count({ where })]);
  res.json({ data: await presentListings(rows), meta: pageMeta(q, total) });
});

listingsRouter.get('/admin/listings/:listingId', requireAuth, requirePermission('admin.access', 'merchants.read'), async (req, res) => {
  const l = await db().listing.findUnique({ where: { publicId: ListingParam.parse(req.params).listingId }, include: { merchant: true } });
  if (!l) throw new AppError('NOT_FOUND', 404, 'Listing not found');
  const outlets = await db().merchantOutlet.findMany({ where: { listings: { some: { listingId: l.id } } } });
  const view = await presentListing(l);
  // Show proposed photos from a pending change as URLs, so the reviewer can compare.
  const pendingImages = Array.isArray((view.pendingChanges?.data as { imageFileIds?: unknown })?.imageFileIds)
    ? ((view.pendingChanges!.data as { imageFileIds: string[] }).imageFileIds).map((id) => ({ id, url: `/api/v1/files/${id}` }))
    : null;
  const categories = await db().category.findMany({ select: { id: true, name: true } });
  res.json({
    data: {
      ...view,
      merchant: { id: l.merchant.publicId, name: l.merchant.name, status: l.merchant.status },
      outlets: outlets.map((o) => ({ id: o.id.toString(), name: o.name, city: o.city, state: o.state })),
      pendingImages,
      categoryNames: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    },
  });
});

const reviewRoute = (path: string, fn: (actor: { id: bigint; ip: string | null }, id: string, note?: string) => Promise<unknown>, needsNote: boolean) =>
  listingsRouter.post(path, ...adminOnly, async (req, res) => {
    const id = String(req.params.id);
    const note = needsNote ? ReviewNote.parse(req.body).note : undefined;
    await fn({ id: currentUser(req).id, ip: requestIp(req) }, id, note);
    res.json({ data: { ok: true } });
  });

reviewRoute('/admin/listings/:id/approve', (a, id) => reviewListing(a, id, 'approve'), false);
reviewRoute('/admin/listings/:id/reject', (a, id, note) => reviewListing(a, id, 'reject', note), true);
reviewRoute('/admin/listing-revisions/:id/approve', (a, id) => reviewRevision(a, BigInt(z.string().regex(/^\d+$/).parse(id)), 'approve'), false);
reviewRoute('/admin/listing-revisions/:id/reject', (a, id, note) => reviewRevision(a, BigInt(z.string().regex(/^\d+$/).parse(id)), 'reject', note), true);
