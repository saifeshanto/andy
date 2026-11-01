import { formatRM } from '@andy/shared';
import type { Listing, Merchant, MerchantMember, Prisma } from '../../generated/prisma/client.js';
import { audit } from '../../core/audit.js';
import { publicId } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { fileUrl } from '../files/index.js';
import { slugify } from '../merchants/merchants.service.js';
import { queueEmail } from '../notifications/index.js';
import { REVIEWED_FIELDS, type ListingPatch, type ReviewedField } from './listings.schemas.js';

type Tx = Prisma.TransactionClient;
type Ctx = { merchant: Merchant; seat: MerchantMember; user: { id: bigint } };

// ───────── helpers ─────────

async function assertCategory(categoryId: number, tx: Tx = db()) {
  const c = await tx.category.findUnique({ where: { id: categoryId } });
  if (!c || !c.isActive) throw new AppError('CATEGORY_NOT_FOUND', 400, 'Choose a category from the list');
}

async function resolveOutlets(merchantId: bigint, ids: string[] | undefined): Promise<bigint[] | undefined> {
  if (!ids) return undefined;
  const unique = [...new Set(ids)].map((i) => BigInt(i));
  const found = await db().merchantOutlet.findMany({ where: { merchantId, id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length) throw new AppError('OUTLET_NOT_FOUND', 400, 'One of the outlets was not found');
  return unique;
}

/**
 * Photos must be LISTING_IMAGE uploads, either uploaded by this user or already on this listing,
 * and not used by another listing. Returns file ids in the given order.
 */
async function resolveImages(userId: bigint, listingId: bigint | null, publicIds: string[] | undefined): Promise<bigint[] | undefined> {
  if (!publicIds) return undefined;
  const unique = [...new Set(publicIds)];
  const files = await db().storedFile.findMany({ where: { publicId: { in: unique }, purpose: 'LISTING_IMAGE' } });
  const attached = await db().listingImage.findMany({ where: { fileId: { in: files.map((f) => f.id) } } });
  const usedBy = new Map(attached.map((a) => [a.fileId, a.listingId]));
  const byPublic = new Map(files.map((f) => [f.publicId, f]));
  return unique.map((pid) => {
    const f = byPublic.get(pid);
    const owner = f && usedBy.get(f.id);
    const ok = f && (owner === undefined ? f.ownerUserId === userId : owner === listingId);
    if (!f || !ok) throw new AppError('FILE_NOT_FOUND', 400, 'One of the photos was not found');
    return f.id;
  });
}

async function setImages(tx: Tx, listingId: bigint, fileIds: bigint[]) {
  await tx.listingImage.deleteMany({ where: { listingId } });
  if (fileIds.length) await tx.listingImage.createMany({ data: fileIds.map((fileId, sort) => ({ listingId, fileId, sort })) });
}

async function setOutlets(tx: Tx, listingId: bigint, outletIds: bigint[]) {
  await tx.listingOutlet.deleteMany({ where: { listingId } });
  if (outletIds.length) await tx.listingOutlet.createMany({ data: outletIds.map((outletId) => ({ listingId, outletId })) });
}

/** Stock only applies to products and duration only to services. */
function typeSpecific<T extends { type?: 'PRODUCT' | 'SERVICE'; stockQty?: number | null; durationMinutes?: number | null }>(v: T, type: 'PRODUCT' | 'SERVICE'): T {
  return { ...v, ...(type === 'SERVICE' ? { stockQty: null } : { durationMinutes: null }) };
}

async function uniqueListingSlug(title: string, merchantSlug: string, exceptId: bigint): Promise<string> {
  const base = slugify(`${title} ${merchantSlug}`).slice(0, 140);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db().listing.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${publicId(6).toLowerCase()}`;
}

export async function findListing(merchantId: bigint, listingPublicId: string) {
  const l = await db().listing.findFirst({ where: { publicId: listingPublicId, merchantId } });
  if (!l) throw new AppError('NOT_FOUND', 404, 'Listing not found');
  return l;
}

// ───────── merchant side ─────────

export async function createListing(ctx: Ctx, input: ListingPatch & { type: 'PRODUCT' | 'SERVICE'; categoryId: number; title: string; description: string; priceSen: number }, ip: string | null) {
  await assertCategory(input.categoryId);
  if ((await db().listing.count({ where: { merchantId: ctx.merchant.id, status: { not: 'ARCHIVED' } } })) >= 500) throw new AppError('TOO_MANY_LISTINGS', 409, 'At most 500 listings');
  const outlets = await resolveOutlets(ctx.merchant.id, input.outletIds);
  const images = await resolveImages(ctx.user.id, null, input.imageFileIds);
  const { outletIds: _o, imageFileIds: _i, ...fields } = typeSpecific(input, input.type);
  const pid = publicId(16);
  return db().$transaction(async (tx) => {
    const l = await tx.listing.create({ data: { ...fields, publicId: pid, slug: `draft-${pid.toLowerCase()}`, merchantId: ctx.merchant.id } });
    if (images) await setImages(tx, l.id, images);
    if (outlets) await setOutlets(tx, l.id, outlets);
    await audit({ actorId: ctx.user.id, action: 'listing.created', entityType: 'Listing', entityId: l.id, after: { title: l.title, price: formatRM(l.priceSen) }, ip }, tx);
    return l;
  });
}

/**
 * Drafts and rejected listings change directly (a rejected one goes back to draft).
 * On a live listing, reviewed fields go into one pending revision; the rest apply at once.
 */
export async function updateListing(ctx: Ctx, listingPublicId: string, patch: ListingPatch, ip: string | null) {
  const l = await findListing(ctx.merchant.id, listingPublicId);
  if (l.status === 'PENDING') throw new AppError('LISTING_IN_REVIEW', 409, 'This listing is waiting for approval. You can edit it after the review.');
  if (l.status === 'ARCHIVED') throw new AppError('LISTING_ARCHIVED', 409, 'This listing is archived');
  if (patch.categoryId !== undefined) await assertCategory(patch.categoryId);
  const outlets = await resolveOutlets(ctx.merchant.id, patch.outletIds);
  const images = await resolveImages(ctx.user.id, l.id, patch.imageFileIds);

  const pending = l.status === 'APPROVED' ? await db().listingRevision.findFirst({ where: { listingId: l.id, status: 'PENDING' } }) : null;
  const proposed = { ...(pending?.data as Record<string, unknown> | undefined) };
  const type = (patch.type ?? (proposed.type as Listing['type'] | undefined) ?? l.type) as 'PRODUCT' | 'SERVICE';
  const price = patch.priceSen ?? (proposed.priceSen as number | undefined) ?? l.priceSen;
  const member = patch.memberPriceSen !== undefined ? patch.memberPriceSen : proposed.memberPriceSen !== undefined ? (proposed.memberPriceSen as number | null) : l.memberPriceSen;
  if (member != null && member > price) throw new AppError('VALIDATION_ERROR', 400, 'Member price cannot be higher than the normal price', [{ path: ['memberPriceSen'], message: 'Member price cannot be higher than the normal price' }]);

  const { outletIds: _o, imageFileIds: _i, ...fields } = typeSpecific(patch, type);

  return db().$transaction(async (tx) => {
    if (l.status === 'DRAFT' || l.status === 'REJECTED') {
      await tx.listing.update({ where: { id: l.id }, data: { ...fields, status: 'DRAFT' } });
      if (images) await setImages(tx, l.id, images);
    } else {
      const instant: Prisma.ListingUpdateInput = {};
      const reviewed: Partial<Record<ReviewedField, unknown>> = {};
      for (const [k, v] of Object.entries(fields)) {
        if ((REVIEWED_FIELDS as readonly string[]).includes(k)) {
          if (v !== (l as Record<string, unknown>)[k]) reviewed[k as ReviewedField] = v;
        } else (instant as Record<string, unknown>)[k] = v;
      }
      if (images) {
        const current = (await tx.listingImage.findMany({ where: { listingId: l.id }, orderBy: { sort: 'asc' } })).map((i) => i.fileId.toString());
        if (images.map(String).join() !== current.join()) reviewed.imageFileIds = patch.imageFileIds;
      }
      if (Object.keys(instant).length) await tx.listing.update({ where: { id: l.id }, data: instant });
      if (Object.keys(reviewed).length) {
        const data = { ...proposed, ...reviewed } as Prisma.InputJsonValue;
        if (pending) await tx.listingRevision.update({ where: { id: pending.id }, data: { data, submittedById: ctx.user.id, createdAt: new Date() } });
        else await tx.listingRevision.create({ data: { listingId: l.id, data, submittedById: ctx.user.id } });
      }
    }
    if (outlets) await setOutlets(tx, l.id, outlets);
    await audit({ actorId: ctx.user.id, action: 'listing.updated', entityType: 'Listing', entityId: l.id, after: { fields: Object.keys(patch) }, ip }, tx);
    return tx.listing.findUniqueOrThrow({ where: { id: l.id } });
  });
}

/** What a draft still needs before it can be sent for approval. */
export async function missingForSubmit(l: Listing): Promise<string[]> {
  const [images, outlets] = await Promise.all([
    db().listingImage.count({ where: { listingId: l.id } }),
    db().listingOutlet.count({ where: { listingId: l.id, outlet: { isActive: true } } }),
  ]);
  const missing: string[] = [];
  if (!images) missing.push('At least one photo');
  if (!outlets) missing.push('At least one open outlet where it is available');
  return missing;
}

export async function submitListing(ctx: Ctx, listingPublicId: string, ip: string | null) {
  const l = await findListing(ctx.merchant.id, listingPublicId);
  if (l.status !== 'DRAFT' && l.status !== 'REJECTED') throw new AppError('INVALID_STATE', 409, 'Only drafts can be sent for approval');
  const missing = await missingForSubmit(l);
  if (missing.length) throw new AppError('LISTING_INCOMPLETE', 400, `Please add: ${missing.join(', ')}`, { missing });
  const { count } = await db().listing.updateMany({ where: { id: l.id, status: { in: ['DRAFT', 'REJECTED'] } }, data: { status: 'PENDING', submittedAt: new Date() } });
  if (!count) throw new AppError('INVALID_STATE', 409, 'Only drafts can be sent for approval');
  await audit({ actorId: ctx.user.id, action: 'listing.submitted', entityType: 'Listing', entityId: l.id, ip });
}

export async function archiveListing(ctx: Ctx, listingPublicId: string, ip: string | null) {
  const l = await findListing(ctx.merchant.id, listingPublicId);
  await db().$transaction(async (tx) => {
    await tx.listing.update({ where: { id: l.id }, data: { status: 'ARCHIVED' } });
    await tx.listingRevision.updateMany({ where: { listingId: l.id, status: 'PENDING' }, data: { status: 'REJECTED', reviewNote: 'Listing archived by the merchant' } });
    await audit({ actorId: ctx.user.id, action: 'listing.archived', entityType: 'Listing', entityId: l.id, before: { status: l.status }, ip }, tx);
  });
}

export async function cancelRevision(ctx: Ctx, listingPublicId: string, ip: string | null) {
  const l = await findListing(ctx.merchant.id, listingPublicId);
  const { count } = await db().listingRevision.deleteMany({ where: { listingId: l.id, status: 'PENDING' } });
  if (!count) throw new AppError('NOT_FOUND', 404, 'No pending changes');
  await audit({ actorId: ctx.user.id, action: 'listing.changesCancelled', entityType: 'Listing', entityId: l.id, ip });
}

// ───────── admin review ─────────

async function notifyOwners(tx: Tx, merchantId: bigint, template: 'listingApproved' | 'listingRejected', vars: { title: string; note: string; merchantPublicId: string }) {
  const owners = await tx.merchantMember.findMany({ where: { merchantId, role: { in: ['OWNER', 'MANAGER'] }, status: 'ACTIVE' }, select: { userId: true } });
  const users = await tx.user.findMany({ where: { id: { in: owners.map((o) => o.userId) } } });
  for (const u of users) await queueEmail(u.email, template, { name: u.fullName, ...vars }, tx);
}

export async function reviewListing(actor: { id: bigint; ip: string | null }, listingPublicId: string, decision: 'approve' | 'reject', note?: string) {
  const l = await db().listing.findUnique({ where: { publicId: listingPublicId }, include: { merchant: true } });
  if (!l) throw new AppError('NOT_FOUND', 404, 'Listing not found');
  const slug = decision === 'approve' ? await uniqueListingSlug(l.title, l.merchant.slug, l.id) : undefined;
  return db().$transaction(async (tx) => {
    const now = new Date();
    const data: Prisma.ListingUpdateManyMutationInput =
      decision === 'approve'
        ? { status: 'APPROVED', slug, publishedAt: l.publishedAt ?? now, reviewedById: actor.id, reviewedAt: now, reviewNote: null }
        : { status: 'REJECTED', reviewedById: actor.id, reviewedAt: now, reviewNote: note ?? null };
    const { count } = await tx.listing.updateMany({ where: { id: l.id, status: 'PENDING' }, data });
    if (!count) throw new AppError('INVALID_STATE', 409, 'This listing is not waiting for approval');
    await audit({ actorId: actor.id, action: decision === 'approve' ? 'listing.approved' : 'listing.rejected', entityType: 'Listing', entityId: l.id, after: { note: note ?? null }, ip: actor.ip }, tx);
    await notifyOwners(tx, l.merchantId, decision === 'approve' ? 'listingApproved' : 'listingRejected', { title: l.title, note: note ?? '', merchantPublicId: l.merchant.publicId });
    return tx.listing.findUniqueOrThrow({ where: { id: l.id } });
  });
}

export async function reviewRevision(actor: { id: bigint; ip: string | null }, revisionId: bigint, decision: 'approve' | 'reject', note?: string) {
  const rev = await db().listingRevision.findUnique({ where: { id: revisionId }, include: { listing: { include: { merchant: true } } } });
  if (!rev) throw new AppError('NOT_FOUND', 404, 'Change request not found');
  const l = rev.listing;
  const data = rev.data as Record<string, unknown>;
  // Photos are resolved again at approval time, so a file removed meanwhile cannot slip through.
  const images = decision === 'approve' && Array.isArray(data.imageFileIds) ? await resolveImages(rev.submittedById, l.id, data.imageFileIds as string[]) : undefined;
  return db().$transaction(async (tx) => {
    const now = new Date();
    const { count } = await tx.listingRevision.updateMany({ where: { id: rev.id, status: 'PENDING' }, data: { status: decision === 'approve' ? 'APPROVED' : 'REJECTED', reviewedById: actor.id, reviewedAt: now, reviewNote: note ?? null } });
    if (!count) throw new AppError('INVALID_STATE', 409, 'These changes have already been reviewed');
    if (decision === 'approve') {
      if (l.status !== 'APPROVED') throw new AppError('INVALID_STATE', 409, 'The listing is no longer live');
      const { imageFileIds: _i, ...fields } = data;
      const type = (fields.type as 'PRODUCT' | 'SERVICE' | undefined) ?? l.type;
      await tx.listing.update({ where: { id: l.id }, data: typeSpecific(fields as { type?: 'PRODUCT' | 'SERVICE'; stockQty?: number | null; durationMinutes?: number | null }, type) as Prisma.ListingUpdateInput });
      if (images) await setImages(tx, l.id, images);
    }
    await audit({ actorId: actor.id, action: decision === 'approve' ? 'listing.changesApproved' : 'listing.changesRejected', entityType: 'Listing', entityId: l.id, after: { revisionId: rev.id.toString(), fields: Object.keys(data), note: note ?? null }, ip: actor.ip }, tx);
    await notifyOwners(tx, l.merchantId, decision === 'approve' ? 'listingApproved' : 'listingRejected', { title: l.title, note: note ?? '', merchantPublicId: l.merchant.publicId });
  });
}

// ───────── presenters ─────────

export async function presentListings(rows: Listing[], opts: { detail?: boolean } = {}) {
  const ids = rows.map((r) => r.id);
  const [images, outlets, categories, revisions] = await Promise.all([
    db().listingImage.findMany({ where: { listingId: { in: ids } }, orderBy: { sort: 'asc' } }),
    opts.detail ? db().listingOutlet.findMany({ where: { listingId: { in: ids } } }) : Promise.resolve([]),
    db().category.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.categoryId))] } } }),
    db().listingRevision.findMany({ where: { listingId: { in: ids }, status: 'PENDING' } }),
  ]);
  const files = await db().storedFile.findMany({ where: { id: { in: images.map((i) => i.fileId) } }, select: { id: true, publicId: true } });
  const filePid = new Map(files.map((f) => [f.id, f.publicId]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  return rows.map((l) => {
    const imgs = images.filter((i) => i.listingId === l.id).map((i) => ({ id: filePid.get(i.fileId)!, url: fileUrl(filePid.get(i.fileId))! }));
    const rev = revisions.find((r) => r.listingId === l.id);
    return {
      id: l.publicId,
      slug: l.status === 'APPROVED' ? l.slug : null,
      type: l.type,
      category: cat.get(l.categoryId) ? { id: l.categoryId, name: cat.get(l.categoryId)!.name, slug: cat.get(l.categoryId)!.slug } : null,
      title: l.title,
      description: l.description,
      priceSen: l.priceSen,
      memberPriceSen: l.memberPriceSen,
      stockQty: l.stockQty,
      durationMinutes: l.durationMinutes,
      isAvailable: l.isAvailable,
      status: l.status,
      reviewNote: l.reviewNote,
      submittedAt: l.submittedAt,
      publishedAt: l.publishedAt,
      updatedAt: l.updatedAt,
      images: imgs,
      ...(opts.detail ? { outletIds: outlets.filter((o) => o.listingId === l.id).map((o) => o.outletId.toString()) } : {}),
      pendingChanges: rev ? { id: rev.id.toString(), data: rev.data, createdAt: rev.createdAt } : null,
    };
  });
}

export async function presentListing(l: Listing) {
  return (await presentListings([l], { detail: true }))[0]!;
}
