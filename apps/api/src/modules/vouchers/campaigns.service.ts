import { describeBenefit } from '@andy/shared';
import type { Merchant, MerchantMember, Prisma, VoucherCampaign } from '../../generated/prisma/client.js';
import { audit } from '../../core/audit.js';
import { publicId } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { slugify } from '../merchants/merchants.service.js';
import { queueEmail } from '../notifications/index.js';
import { campaignIssues, LIVE_EDITABLE, type CampaignInput, type CampaignPatch } from './vouchers.schemas.js';

type Tx = Prisma.TransactionClient;
type Ctx = { merchant: Merchant; seat: MerchantMember; user: { id: bigint } };
type Actor = { id: bigint; ip: string | null };

const MAX_OPEN_CAMPAIGNS = 200;

async function resolveOutlets(merchantId: bigint, ids: string[] | undefined): Promise<bigint[] | undefined> {
  if (!ids) return undefined;
  const unique = [...new Set(ids)].map((i) => BigInt(i));
  const found = await db().merchantOutlet.count({ where: { merchantId, id: { in: unique } } });
  if (found !== unique.length) throw new AppError('OUTLET_NOT_FOUND', 400, 'One of the outlets was not found');
  return unique;
}

async function setOutlets(tx: Tx, campaignId: bigint, outletIds: bigint[]) {
  await tx.voucherCampaignOutlet.deleteMany({ where: { campaignId } });
  if (outletIds.length) await tx.voucherCampaignOutlet.createMany({ data: outletIds.map((outletId) => ({ campaignId, outletId })) });
}

/** FREE_ITEM carries no value; the other types keep theirs. */
const normaliseBenefit = <T extends { benefitType?: string; benefitValue?: number | null }>(v: T): T => (v.benefitType === 'FREE_ITEM' ? { ...v, benefitValue: null } : v);

export async function findCampaign(merchantId: bigint, campaignPublicId: string) {
  const c = await db().voucherCampaign.findFirst({ where: { publicId: campaignPublicId, merchantId } });
  if (!c) throw new AppError('NOT_FOUND', 404, 'Voucher not found');
  return c;
}

export async function createCampaign(ctx: Ctx, input: CampaignInput, ip: string | null) {
  const open = await db().voucherCampaign.count({ where: { merchantId: ctx.merchant.id, status: { not: 'ENDED' } } });
  if (open >= MAX_OPEN_CAMPAIGNS) throw new AppError('TOO_MANY_VOUCHERS', 409, `At most ${MAX_OPEN_CAMPAIGNS} vouchers at a time. End old ones first.`);
  const outlets = await resolveOutlets(ctx.merchant.id, input.outletIds);
  const { outletIds: _o, ...fields } = normaliseBenefit(input);
  const pid = publicId(16);
  return db().$transaction(async (tx) => {
    const c = await tx.voucherCampaign.create({ data: { ...fields, publicId: pid, slug: `draft-${pid.toLowerCase()}`, merchantId: ctx.merchant.id, createdById: ctx.user.id } });
    if (outlets) await setOutlets(tx, c.id, outlets);
    await audit({ actorId: ctx.user.id, action: 'voucher.created', entityType: 'VoucherCampaign', entityId: c.id, after: { title: c.title }, ip }, tx);
    return c;
  });
}

/**
 * Drafts and rejected offers change freely (a rejected one goes back to draft).
 * Live offers only allow quantity and outlets: members claimed them under the existing terms.
 */
export async function updateCampaign(ctx: Ctx, campaignPublicId: string, patch: CampaignPatch, ip: string | null) {
  const c = await findCampaign(ctx.merchant.id, campaignPublicId);
  if (c.status === 'PENDING') throw new AppError('VOUCHER_IN_REVIEW', 409, 'This voucher is waiting for approval. You can edit it after the review.');
  if (c.status === 'ENDED') throw new AppError('VOUCHER_ENDED', 409, 'This voucher has ended');
  const live = c.status === 'APPROVED' || c.status === 'PAUSED';
  if (live) {
    const locked = Object.keys(patch).filter((k) => !(LIVE_EDITABLE as readonly string[]).includes(k));
    if (locked.length) throw new AppError('VOUCHER_LIVE', 409, 'Members have this voucher under its current terms. You can change only the quantity and outlets. For new terms, create a new voucher.', { fields: locked });
  }
  if (patch.totalQty != null && patch.totalQty < c.claimedCount) {
    throw new AppError('VALIDATION_ERROR', 400, `${c.claimedCount} have already been claimed`, [{ path: ['totalQty'], message: `Must be at least ${c.claimedCount}, the number already claimed` }]);
  }
  const merged = { ...c, ...patch };
  const issues = campaignIssues(merged);
  if (issues.length) throw new AppError('VALIDATION_ERROR', 400, issues[0]!.message, issues);
  const outlets = await resolveOutlets(ctx.merchant.id, patch.outletIds);
  const { outletIds: _o, ...fields } = normaliseBenefit({ ...patch, benefitType: patch.benefitType ?? c.benefitType });
  if (!patch.benefitType) delete (fields as { benefitType?: unknown }).benefitType;

  return db().$transaction(async (tx) => {
    await tx.voucherCampaign.update({ where: { id: c.id }, data: { ...fields, ...(live ? {} : { status: 'DRAFT' }) } });
    if (outlets) await setOutlets(tx, c.id, outlets);
    await audit({ actorId: ctx.user.id, action: 'voucher.updated', entityType: 'VoucherCampaign', entityId: c.id, after: { fields: Object.keys(patch) }, ip }, tx);
    return tx.voucherCampaign.findUniqueOrThrow({ where: { id: c.id } });
  });
}

/** What a draft still needs before it can be sent for approval. */
export async function missingForSubmit(c: VoucherCampaign): Promise<string[]> {
  const outlets = await db().voucherCampaignOutlet.count({ where: { campaignId: c.id, outlet: { isActive: true } } });
  const missing: string[] = [];
  if (!outlets) missing.push('At least one open outlet where it can be used');
  if (c.claimEndAt <= new Date()) missing.push('A claim end date in the future');
  return missing;
}

export async function submitCampaign(ctx: Ctx, campaignPublicId: string, ip: string | null) {
  const c = await findCampaign(ctx.merchant.id, campaignPublicId);
  if (c.status !== 'DRAFT' && c.status !== 'REJECTED') throw new AppError('INVALID_STATE', 409, 'Only drafts can be sent for approval');
  const missing = await missingForSubmit(c);
  if (missing.length) throw new AppError('VOUCHER_INCOMPLETE', 400, `Please add: ${missing.join(', ')}`, { missing });
  const { count } = await db().voucherCampaign.updateMany({ where: { id: c.id, status: { in: ['DRAFT', 'REJECTED'] } }, data: { status: 'PENDING', submittedAt: new Date() } });
  if (!count) throw new AppError('INVALID_STATE', 409, 'Only drafts can be sent for approval');
  await audit({ actorId: ctx.user.id, action: 'voucher.submitted', entityType: 'VoucherCampaign', entityId: c.id, ip });
}

const TRANSITIONS = {
  pause: { from: ['APPROVED'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'APPROVED' },
  end: { from: ['APPROVED', 'PAUSED', 'DRAFT', 'REJECTED'], to: 'ENDED' },
} as const;
export type CampaignAction = keyof typeof TRANSITIONS;

/**
 * Pause, resume or end. Pausing or ending only stops new claims: vouchers members already hold
 * stay usable until they expire.
 */
export async function changeCampaignState(actor: Actor, campaign: VoucherCampaign, action: CampaignAction, by: 'merchant' | 'admin') {
  const t = TRANSITIONS[action];
  const { count } = await db().voucherCampaign.updateMany({ where: { id: campaign.id, status: { in: [...t.from] } }, data: { status: t.to } });
  if (!count) throw new AppError('INVALID_STATE', 409, `This voucher cannot be ${action === 'end' ? 'ended' : action === 'pause' ? 'paused' : 'resumed'} now`);
  await audit({ actorId: actor.id, action: `voucher.${action}`, entityType: 'VoucherCampaign', entityId: campaign.id, before: { status: campaign.status }, after: { status: t.to, by }, ip: actor.ip });
}

// ───────── admin review ─────────

async function uniqueSlug(title: string, merchantSlug: string, exceptId: bigint): Promise<string> {
  const base = slugify(`${title} ${merchantSlug}`).slice(0, 140);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db().voucherCampaign.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${publicId(6).toLowerCase()}`;
}

export async function notifyMerchantManagers(tx: Tx, merchantId: bigint, template: 'voucherApproved' | 'voucherRejected', vars: { title: string; note: string; merchantPublicId: string }) {
  const seats = await tx.merchantMember.findMany({ where: { merchantId, role: { in: ['OWNER', 'MANAGER'] }, status: 'ACTIVE' }, select: { userId: true } });
  const users = await tx.user.findMany({ where: { id: { in: seats.map((s) => s.userId) } } });
  for (const u of users) await queueEmail(u.email, template, { name: u.fullName, ...vars }, tx);
}

export async function reviewCampaign(actor: Actor, campaignPublicId: string, decision: 'approve' | 'reject', note?: string) {
  const c = await db().voucherCampaign.findUnique({ where: { publicId: campaignPublicId }, include: { merchant: true } });
  if (!c) throw new AppError('NOT_FOUND', 404, 'Voucher not found');
  if (decision === 'approve' && c.claimEndAt <= new Date()) throw new AppError('VOUCHER_PAST', 409, 'Its claim period has already ended. Reject it so the merchant can set new dates.');
  const slug = decision === 'approve' ? await uniqueSlug(c.title, c.merchant.slug, c.id) : undefined;
  return db().$transaction(async (tx) => {
    const now = new Date();
    const data: Prisma.VoucherCampaignUpdateManyMutationInput =
      decision === 'approve'
        ? { status: 'APPROVED', slug, publishedAt: c.publishedAt ?? now, reviewedById: actor.id, reviewedAt: now, reviewNote: null }
        : { status: 'REJECTED', reviewedById: actor.id, reviewedAt: now, reviewNote: note ?? null };
    const { count } = await tx.voucherCampaign.updateMany({ where: { id: c.id, status: 'PENDING' }, data });
    if (!count) throw new AppError('INVALID_STATE', 409, 'This voucher is not waiting for approval');
    await audit({ actorId: actor.id, action: decision === 'approve' ? 'voucher.approved' : 'voucher.rejected', entityType: 'VoucherCampaign', entityId: c.id, after: { note: note ?? null }, ip: actor.ip }, tx);
    await notifyMerchantManagers(tx, c.merchantId, decision === 'approve' ? 'voucherApproved' : 'voucherRejected', { title: c.title, note: note ?? '', merchantPublicId: c.merchant.publicId });
    return tx.voucherCampaign.findUniqueOrThrow({ where: { id: c.id } });
  });
}

// ───────── presenters ─────────

/** Whether members can claim it right now, and if not, why. */
export function claimState(c: VoucherCampaign, merchantStatus: string, now = new Date()): 'OPEN' | 'NOT_STARTED' | 'CLOSED' | 'SOLD_OUT' | 'UNAVAILABLE' {
  if (c.status !== 'APPROVED' || merchantStatus !== 'APPROVED') return 'UNAVAILABLE';
  if (c.claimStartAt && c.claimStartAt > now) return 'NOT_STARTED';
  if (c.claimEndAt <= now) return 'CLOSED';
  if (c.totalQty != null && c.claimedCount >= c.totalQty) return 'SOLD_OUT';
  return 'OPEN';
}

export async function presentCampaigns(rows: VoucherCampaign[], opts: { detail?: boolean } = {}) {
  const ids = rows.map((r) => r.id);
  const [outlets, redeemed] = await Promise.all([
    opts.detail ? db().voucherCampaignOutlet.findMany({ where: { campaignId: { in: ids } } }) : Promise.resolve([]),
    db().voucher.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, status: 'REDEEMED' }, _count: { _all: true } }),
  ]);
  const used = new Map(redeemed.map((r) => [r.campaignId, r._count._all]));
  return rows.map((c) => ({
    id: c.publicId,
    slug: c.status === 'APPROVED' || c.status === 'PAUSED' || c.status === 'ENDED' ? c.slug : null,
    title: c.title,
    terms: c.terms,
    benefitType: c.benefitType,
    benefitValue: c.benefitValue,
    benefit: describeBenefit(c.benefitType, c.benefitValue),
    memberOnly: c.memberOnly,
    totalQty: c.totalQty,
    claimedCount: c.claimedCount,
    redeemedCount: used.get(c.id) ?? 0,
    perUserLimit: c.perUserLimit,
    claimStartAt: c.claimStartAt,
    claimEndAt: c.claimEndAt,
    validUntil: c.validUntil,
    validDays: c.validDays,
    status: c.status,
    reviewNote: c.reviewNote,
    submittedAt: c.submittedAt,
    publishedAt: c.publishedAt,
    updatedAt: c.updatedAt,
    ...(opts.detail ? { outletIds: outlets.filter((o) => o.campaignId === c.id).map((o) => o.outletId.toString()) } : {}),
  }));
}

export async function presentCampaign(c: VoucherCampaign) {
  return (await presentCampaigns([c], { detail: true }))[0]!;
}

