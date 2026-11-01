import { randomInt } from 'node:crypto';
import { describeBenefit, formatVoucherCode, normalizeVoucherCode, VOUCHER_CODE_ALPHABET, VOUCHER_CODE_LENGTH } from '@andy/shared';
import type { Merchant, MerchantMember, Voucher, VoucherCampaign } from '../../generated/prisma/client.js';
import { audit } from '../../core/audit.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { currentMembership } from '../membership/index.js';
import { queueEmail } from '../notifications/index.js';
import { claimState } from './campaigns.service.js';

type Ctx = { merchant: Merchant; seat: MerchantMember; user: { id: bigint } };

/** Undo window for a redemption made by mistake (OPEN-28 default, pending Andy). */
export const REVERSE_WITHIN_HOURS = 24;
const DAY = 24 * 60 * 60_000;

function newCode(): string {
  let s = '';
  for (let i = 0; i < VOUCHER_CODE_LENGTH; i++) s += VOUCHER_CODE_ALPHABET[randomInt(VOUCHER_CODE_ALPHABET.length)];
  return s;
}

/** A voucher expires at the offer's end date, or validDays after claiming if that is sooner. */
export function expiryFor(c: Pick<VoucherCampaign, 'validUntil' | 'validDays'>, claimedAt: Date): Date {
  if (!c.validDays) return c.validUntil;
  const byDays = new Date(claimedAt.getTime() + c.validDays * DAY);
  return byDays < c.validUntil ? byDays : c.validUntil;
}

/** ACTIVE vouchers past their expiry count as expired even before the nightly job marks them. */
export const effectiveStatus = (v: Pick<Voucher, 'status' | 'expiresAt'>, now = new Date()) => (v.status === 'ACTIVE' && v.expiresAt <= now ? 'EXPIRED' : v.status);

/** "Ahmad Faizal bin Ali" → "Ahmad F." so counter staff can greet the member without seeing the full name. */
export function maskName(full: string): string {
  const [first = '', second] = full.trim().split(/\s+/);
  return second ? `${first} ${second[0]!.toUpperCase()}.` : first;
}

// ───────── member side ─────────

/**
 * Claims one voucher. The quantity check and increment are one conditional UPDATE, which also locks the
 * offer row, so concurrent claims can never exceed the total or the per-member limit.
 */
export async function claimVoucher(user: { id: bigint; status: string }, campaignPublicId: string, ip: string | null) {
  if (user.status !== 'ACTIVE') throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please confirm your email address first');
  const c = await db().voucherCampaign.findUnique({ where: { publicId: campaignPublicId }, include: { merchant: true } });
  if (!c) throw new AppError('NOT_FOUND', 404, 'Voucher not found');
  const state = claimState(c, c.merchant.status);
  if (state === 'SOLD_OUT') throw new AppError('SOLD_OUT', 409, 'Sorry, all of these vouchers have been claimed');
  if (state !== 'OPEN') throw new AppError('NOT_CLAIMABLE', 409, state === 'NOT_STARTED' ? 'This voucher cannot be claimed yet' : 'This voucher can no longer be claimed');
  if (c.memberOnly && !(await currentMembership(user.id))) throw new AppError('MEMBERSHIP_REQUIRED', 403, 'This voucher is for members. Join or renew your membership to claim it.');

  const now = new Date();
  const voucher = await db().$transaction(async (tx) => {
    const taken = await tx.$executeRaw`UPDATE VoucherCampaign SET claimedCount = claimedCount + 1 WHERE id = ${c.id} AND status = 'APPROVED' AND (totalQty IS NULL OR claimedCount < totalQty)`;
    if (!taken) throw new AppError('SOLD_OUT', 409, 'Sorry, all of these vouchers have been claimed');
    const mine = await tx.voucher.count({ where: { campaignId: c.id, userId: user.id, status: { not: 'VOID' } } });
    if (mine >= c.perUserLimit) throw new AppError('LIMIT_REACHED', 409, c.perUserLimit === 1 ? 'You have already claimed this voucher' : `You can claim this voucher ${c.perUserLimit} times`);
    let code = newCode();
    while (await tx.voucher.findUnique({ where: { code }, select: { id: true } })) code = newCode();
    const v = await tx.voucher.create({ data: { code, campaignId: c.id, userId: user.id, claimedAt: now, expiresAt: expiryFor(c, now) } });
    await audit({ actorId: user.id, action: 'voucher.claimed', entityType: 'Voucher', entityId: v.id, after: { campaign: c.publicId }, ip }, tx);
    return v;
  });
  return voucher;
}

export async function presentMyVouchers(rows: (Voucher & { campaign: VoucherCampaign & { merchant: Merchant } })[], opts: { detail?: boolean } = {}) {
  const campaignIds = [...new Set(rows.map((r) => r.campaignId))];
  const [outlets, redemptions] = await Promise.all([
    opts.detail ? db().merchantOutlet.findMany({ where: { isActive: true, campaigns: { some: { campaignId: { in: campaignIds } } } }, include: { campaigns: { where: { campaignId: { in: campaignIds } } } } }) : Promise.resolve([]),
    db().voucherRedemption.findMany({ where: { voucherId: { in: rows.map((r) => r.id) }, reversedAt: null } }),
  ]);
  const outletNames = new Map((await db().merchantOutlet.findMany({ where: { id: { in: redemptions.map((r) => r.outletId) } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  return rows.map((v) => {
    const r = redemptions.find((x) => x.voucherId === v.id);
    return {
      code: formatVoucherCode(v.code),
      status: effectiveStatus(v),
      claimedAt: v.claimedAt,
      expiresAt: v.expiresAt,
      redeemedAt: v.redeemedAt,
      redeemedOutlet: r ? (outletNames.get(r.outletId) ?? null) : null,
      title: v.campaign.title,
      terms: v.campaign.terms,
      benefit: describeBenefit(v.campaign.benefitType, v.campaign.benefitValue),
      memberOnly: v.campaign.memberOnly,
      campaignSlug: v.campaign.slug,
      merchant: { name: v.campaign.merchant.name, slug: v.campaign.merchant.slug, phone: v.campaign.merchant.phone },
      ...(opts.detail
        ? {
            outlets: outlets
              .filter((o) => o.campaigns.some((x) => x.campaignId === v.campaignId))
              .map((o) => ({ id: o.id.toString(), name: o.name, addressLine1: o.addressLine1, addressLine2: o.addressLine2, city: o.city, state: o.state, postcode: o.postcode, phone: o.phone, hours: o.hours })),
          }
        : {}),
    };
  });
}

// ───────── counter redemption ─────────

type Check = { ok: true } | { ok: false; reason: 'REDEEMED' | 'EXPIRED' | 'VOID' | 'MEMBERSHIP_INACTIVE' | 'MERCHANT_SUSPENDED' };

/** Finds a voucher by code for this merchant. Codes for other merchants look exactly like unknown codes. */
async function voucherForMerchant(merchantId: bigint, rawCode: string) {
  const code = normalizeVoucherCode(rawCode);
  const v = code ? await db().voucher.findUnique({ where: { code }, include: { campaign: true } }) : null;
  if (!v || v.campaign.merchantId !== merchantId) throw new AppError('CODE_NOT_FOUND', 404, 'We could not find this code for your business. Check it and try again.');
  return v;
}

async function check(v: Voucher & { campaign: VoucherCampaign }, merchant: Merchant): Promise<Check> {
  const status = effectiveStatus(v);
  if (status !== 'ACTIVE') return { ok: false, reason: status };
  if (merchant.status !== 'APPROVED') return { ok: false, reason: 'MERCHANT_SUSPENDED' };
  // OPEN-25 default: a members-only voucher needs a membership that is active on the day it is used.
  if (v.campaign.memberOnly && !(await currentMembership(v.userId))) return { ok: false, reason: 'MEMBERSHIP_INACTIVE' };
  return { ok: true };
}

const REASON_TEXT: Record<Exclude<Check, { ok: true }>['reason'], string> = {
  REDEEMED: 'This voucher has already been used',
  EXPIRED: 'This voucher has expired',
  VOID: 'This voucher has been cancelled',
  MEMBERSHIP_INACTIVE: 'This voucher is for members, and this customer’s membership is not active',
  MERCHANT_SUSPENDED: 'Your business is suspended, so vouchers cannot be redeemed',
};

/** Allowed outlets for this voucher, narrowed to the staff member's own outlet if they have one. */
async function allowedOutlets(campaignId: bigint, merchantId: bigint, seat: MerchantMember) {
  const rows = await db().merchantOutlet.findMany({ where: { merchantId, isActive: true, campaigns: { some: { campaignId } }, ...(seat.outletId ? { id: seat.outletId } : {}) }, orderBy: { id: 'asc' } });
  return rows.map((o) => ({ id: o.id.toString(), name: o.name }));
}

/** Step 1 at the counter: show what the code is for. Changes nothing. */
export async function lookupVoucher(ctx: Ctx, rawCode: string) {
  const v = await voucherForMerchant(ctx.merchant.id, rawCode);
  const [result, user, outlets, last] = await Promise.all([
    check(v, ctx.merchant),
    db().user.findUniqueOrThrow({ where: { id: v.userId }, select: { fullName: true } }),
    allowedOutlets(v.campaignId, ctx.merchant.id, ctx.seat),
    db().voucherRedemption.findFirst({ where: { voucherId: v.id, reversedAt: null }, orderBy: { id: 'desc' } }),
  ]);
  const lastOutlet = last ? await db().merchantOutlet.findUnique({ where: { id: last.outletId }, select: { name: true } }) : null;
  return {
    code: formatVoucherCode(v.code),
    title: v.campaign.title,
    terms: v.campaign.terms,
    benefit: describeBenefit(v.campaign.benefitType, v.campaign.benefitValue),
    memberName: maskName(user.fullName),
    expiresAt: v.expiresAt,
    canRedeem: result.ok && outlets.length > 0,
    reason: result.ok ? (outlets.length ? null : 'This voucher cannot be used at your outlet') : REASON_TEXT[result.reason],
    reasonCode: result.ok ? (outlets.length ? null : 'WRONG_OUTLET') : result.reason,
    redeemedAt: last?.createdAt ?? null,
    redeemedOutlet: lastOutlet?.name ?? null,
    outlets,
  };
}

/**
 * Step 2: mark it used. The voucher row only moves from ACTIVE to REDEEMED once (conditional update),
 * so two cashiers scanning the same code at the same moment cannot both succeed.
 */
export async function redeemVoucher(ctx: Ctx, rawCode: string, outletId: bigint, meta: { ip: string | null; userAgent: string | null }) {
  const v = await voucherForMerchant(ctx.merchant.id, rawCode);
  const result = await check(v, ctx.merchant);
  if (!result.ok) throw new AppError(result.reason === 'REDEEMED' ? 'ALREADY_REDEEMED' : result.reason, 409, REASON_TEXT[result.reason]);
  const outlets = await allowedOutlets(v.campaignId, ctx.merchant.id, ctx.seat);
  if (!outlets.some((o) => o.id === outletId.toString())) throw new AppError('WRONG_OUTLET', 409, 'This voucher cannot be used at that outlet');

  const now = new Date();
  const redemption = await db().$transaction(async (tx) => {
    const { count } = await tx.voucher.updateMany({ where: { id: v.id, status: 'ACTIVE', expiresAt: { gt: now } }, data: { status: 'REDEEMED', redeemedAt: now } });
    if (!count) throw new AppError('ALREADY_REDEEMED', 409, REASON_TEXT.REDEEMED);
    const r = await tx.voucherRedemption.create({
      data: { voucherId: v.id, merchantId: ctx.merchant.id, merchantMemberId: ctx.seat.id, staffUserId: ctx.user.id, outletId, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) ?? null, createdAt: now },
    });
    await audit({ actorId: ctx.user.id, action: 'voucher.redeemed', entityType: 'Voucher', entityId: v.id, after: { redemptionId: r.id.toString(), outletId: outletId.toString() }, ip: meta.ip }, tx);
    const member = await tx.user.findUniqueOrThrow({ where: { id: v.userId } });
    const outlet = outlets.find((o) => o.id === outletId.toString())!;
    await queueEmail(member.email, 'voucherRedeemed', { name: member.fullName, title: v.campaign.title, merchant: ctx.merchant.name, outlet: outlet.name, at: now }, tx);
    return r;
  });
  return { id: redemption.id.toString(), code: formatVoucherCode(v.code), title: v.campaign.title, redeemedAt: now };
}

// ───────── admin ─────────

/** Undo a redemption made by mistake (OPEN-28 default: admin only, within 24 hours, with a reason). */
export async function reverseRedemption(actor: { id: bigint; ip: string | null }, redemptionId: bigint, reason: string) {
  const r = await db().voucherRedemption.findUnique({ where: { id: redemptionId }, include: { voucher: true } });
  if (!r) throw new AppError('NOT_FOUND', 404, 'Redemption not found');
  if (r.reversedAt) throw new AppError('INVALID_STATE', 409, 'This redemption has already been undone');
  if (Date.now() - r.createdAt.getTime() > REVERSE_WITHIN_HOURS * 60 * 60_000) throw new AppError('TOO_LATE', 409, `A redemption can only be undone within ${REVERSE_WITHIN_HOURS} hours`);
  const now = new Date();
  await db().$transaction(async (tx) => {
    const { count } = await tx.voucherRedemption.updateMany({ where: { id: r.id, reversedAt: null }, data: { reversedAt: now, reversedById: actor.id, reverseReason: reason } });
    if (!count) throw new AppError('INVALID_STATE', 409, 'This redemption has already been undone');
    await tx.voucher.updateMany({ where: { id: r.voucherId, status: 'REDEEMED' }, data: { status: r.voucher.expiresAt > now ? 'ACTIVE' : 'EXPIRED', redeemedAt: null } });
    await audit({ actorId: actor.id, action: 'voucher.redemptionReversed', entityType: 'Voucher', entityId: r.voucherId, after: { redemptionId: r.id.toString(), reason }, ip: actor.ip }, tx);
  });
}

export async function presentRedemptions(rows: { id: bigint; voucherId: bigint; staffUserId: bigint; outletId: bigint; merchantId: bigint; createdAt: Date; reversedAt: Date | null; reverseReason: string | null }[], opts: { fullNames?: boolean } = {}) {
  const [vouchers, staff, outlets, merchants] = await Promise.all([
    db().voucher.findMany({ where: { id: { in: rows.map((r) => r.voucherId) } }, include: { campaign: { select: { title: true, publicId: true } } } }),
    db().user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.staffUserId))] } }, select: { id: true, fullName: true } }),
    db().merchantOutlet.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.outletId))] } }, select: { id: true, name: true } }),
    opts.fullNames ? db().merchant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.merchantId))] } }, select: { id: true, name: true, publicId: true } }) : Promise.resolve([]),
  ]);
  const members = await db().user.findMany({ where: { id: { in: vouchers.map((v) => v.userId) } }, select: { id: true, fullName: true, email: true } });
  const vById = new Map(vouchers.map((v) => [v.id, v]));
  const name = (list: { id: bigint; fullName?: string; name?: string }[], id: bigint) => {
    const x = list.find((i) => i.id === id);
    return x ? (x.fullName ?? x.name ?? '') : '';
  };
  return rows.map((r) => {
    const v = vById.get(r.voucherId)!;
    const m = members.find((u) => u.id === v.userId);
    return {
      id: r.id.toString(),
      at: r.createdAt,
      code: formatVoucherCode(v.code),
      title: v.campaign.title,
      member: opts.fullNames ? { name: m?.fullName ?? '', email: m?.email ?? '' } : { name: maskName(m?.fullName ?? '') },
      staff: name(staff, r.staffUserId),
      outlet: name(outlets, r.outletId),
      ...(opts.fullNames ? { merchant: merchants.find((x) => x.id === r.merchantId)?.name ?? '' } : {}),
      reversedAt: r.reversedAt,
      reverseReason: r.reverseReason,
    };
  });
}
