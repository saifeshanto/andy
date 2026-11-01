import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { PaginationSchema, pageArgs, pageMeta } from '../../core/http.js';
import type { Listing, MerchantOutlet, Prisma } from '../../generated/prisma/client.js';
import { fileUrl } from '../files/index.js';
import { MY_STATES } from '../merchants/merchants.schemas.js';
import { presentListings } from './listings.service.js';

/**
 * Public marketplace (listing only: customers pay at the merchant until OPEN-11 says otherwise).
 * Only approved listings of approved merchants are shown.
 */
export const marketplaceRouter = Router();

const LIVE: Prisma.ListingWhereInput = { status: 'APPROVED', merchant: { status: 'APPROVED' } };

async function merchantCards(ids: bigint[]) {
  const ms = await db().merchant.findMany({ where: { id: { in: ids } } });
  const logos = await db().storedFile.findMany({ where: { id: { in: ms.flatMap((m) => (m.logoFileId ? [m.logoFileId] : [])) } }, select: { id: true, publicId: true } });
  const logo = new Map(logos.map((f) => [f.id, f.publicId]));
  return new Map(ms.map((m) => [m.id, { name: m.name, slug: m.slug, logoUrl: m.logoFileId ? fileUrl(logo.get(m.logoFileId)) : null, city: m.city, state: m.state }]));
}

async function publicCards(rows: Listing[]) {
  const [views, merchants] = await Promise.all([presentListings(rows), merchantCards([...new Set(rows.map((r) => r.merchantId))])]);
  return views.map((v, i) => ({
    id: v.id,
    slug: v.slug,
    type: v.type,
    title: v.title,
    category: v.category,
    priceSen: v.priceSen,
    memberPriceSen: v.memberPriceSen,
    isAvailable: v.isAvailable,
    imageUrl: v.images[0]?.url ?? null,
    merchant: merchants.get(rows[i]!.merchantId)!,
  }));
}

const publicOutlet = (o: MerchantOutlet) => ({ id: o.id.toString(), name: o.name, addressLine1: o.addressLine1, addressLine2: o.addressLine2, city: o.city, state: o.state, postcode: o.postcode, phone: o.phone, hours: o.hours });

const ListingsQuery = PaginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(120).optional(),
  state: z.enum(MY_STATES).optional(),
  type: z.enum(['PRODUCT', 'SERVICE']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
});

marketplaceRouter.get('/public/listings', async (req, res) => {
  const q = ListingsQuery.parse(req.query);
  const where: Prisma.ListingWhereInput = {
    ...LIVE,
    isAvailable: true,
    ...(q.type ? { type: q.type } : {}),
    ...(q.category ? { category: { slug: q.category } } : {}),
    ...(q.state ? { outlets: { some: { outlet: { state: q.state, isActive: true } } } } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q } }, { description: { contains: q.q } }, { merchant: { name: { contains: q.q } } }] } : {}),
  };
  const orderBy: Prisma.ListingOrderByWithRelationInput = q.sort === 'price_asc' ? { priceSen: 'asc' } : q.sort === 'price_desc' ? { priceSen: 'desc' } : { publishedAt: 'desc' };
  const [rows, total] = await Promise.all([db().listing.findMany({ where, orderBy: [orderBy, { id: 'desc' }], ...pageArgs(q) }), db().listing.count({ where })]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: await publicCards(rows), meta: pageMeta(q, total) });
});

marketplaceRouter.get('/public/listings/:slug', async (req, res) => {
  const { slug } = z.object({ slug: z.string().max(160) }).parse(req.params);
  const l = await db().listing.findFirst({ where: { ...LIVE, slug } });
  if (!l) throw new AppError('NOT_FOUND', 404, 'This listing is not available');
  const [[view], merchants, outlets, more] = await Promise.all([
    presentListings([l]),
    merchantCards([l.merchantId]),
    db().merchantOutlet.findMany({ where: { isActive: true, listings: { some: { listingId: l.id } } }, orderBy: { id: 'asc' } }),
    db().listing.findMany({ where: { ...LIVE, isAvailable: true, merchantId: l.merchantId, id: { not: l.id } }, orderBy: { publishedAt: 'desc' }, take: 4 }),
  ]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    data: {
      id: view!.id,
      slug: view!.slug,
      type: view!.type,
      title: view!.title,
      description: view!.description,
      category: view!.category,
      priceSen: view!.priceSen,
      memberPriceSen: view!.memberPriceSen,
      stockQty: view!.stockQty,
      durationMinutes: view!.durationMinutes,
      isAvailable: view!.isAvailable,
      images: view!.images,
      merchant: merchants.get(l.merchantId),
      outlets: outlets.map(publicOutlet),
      moreFromMerchant: await publicCards(more),
    },
  });
});

marketplaceRouter.get('/public/merchants', async (req, res) => {
  const q = PaginationSchema.extend({ q: z.string().trim().max(100).optional(), state: z.enum(MY_STATES).optional() }).parse(req.query);
  const where: Prisma.MerchantWhereInput = {
    status: 'APPROVED',
    ...(q.q ? { OR: [{ name: { contains: q.q } }, { businessType: { contains: q.q } }] } : {}),
    ...(q.state ? { outlets: { some: { state: q.state, isActive: true } } } : {}),
  };
  const [rows, total] = await Promise.all([db().merchant.findMany({ where, orderBy: { name: 'asc' }, ...pageArgs(q) }), db().merchant.count({ where })]);
  const cards = await merchantCards(rows.map((r) => r.id));
  const counts = await db().listing.groupBy({ by: ['merchantId'], where: { ...LIVE, isAvailable: true, merchantId: { in: rows.map((r) => r.id) } }, _count: true });
  const count = new Map(counts.map((c) => [c.merchantId, c._count]));
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: rows.map((m) => ({ ...cards.get(m.id)!, businessType: m.businessType, listings: count.get(m.id) ?? 0 })), meta: pageMeta(q, total) });
});

marketplaceRouter.get('/public/merchants/:slug', async (req, res) => {
  const { slug } = z.object({ slug: z.string().max(120) }).parse(req.params);
  const m = await db().merchant.findFirst({ where: { slug, status: 'APPROVED' } });
  if (!m) throw new AppError('NOT_FOUND', 404, 'This business is not available');
  const [cards, outlets, listings] = await Promise.all([
    merchantCards([m.id]),
    db().merchantOutlet.findMany({ where: { merchantId: m.id, isActive: true }, orderBy: { id: 'asc' } }),
    db().listing.findMany({ where: { ...LIVE, isAvailable: true, merchantId: m.id }, orderBy: { publishedAt: 'desc' }, take: 60 }),
  ]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    data: {
      ...cards.get(m.id)!,
      businessType: m.businessType,
      description: m.description,
      phone: m.phone,
      email: m.email,
      website: m.website,
      outlets: outlets.map(publicOutlet),
      listings: await publicCards(listings),
    },
  });
});
