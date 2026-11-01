import { z } from 'zod';

const MAX_SEN = 100_000_000; // RM 1,000,000
const outletIds = z.array(z.string().regex(/^\d+$/)).max(50);

const fields = {
  title: z.string().trim().min(3, 'Enter a title').max(150),
  terms: z.string().trim().min(10, 'Write the terms in at least 10 characters').max(3000),
  benefitType: z.enum(['FREE_ITEM', 'FIXED_OFF', 'PERCENT_OFF']),
  benefitValue: z.number().int().min(1).max(MAX_SEN).nullable().optional(),
  memberOnly: z.boolean(),
  totalQty: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(100),
  claimStartAt: z.coerce.date().nullable().optional(),
  claimEndAt: z.coerce.date(),
  validUntil: z.coerce.date(),
  validDays: z.number().int().min(1).max(3650).nullable().optional(),
  outletIds,
};

type Checked = { benefitType?: string; benefitValue?: number | null; claimStartAt?: Date | null; claimEndAt?: Date; validUntil?: Date };

/** Rules that need several fields. Used on create and on the merged result of an edit. */
export function campaignIssues(v: Checked): { path: string[]; message: string }[] {
  const out: { path: string[]; message: string }[] = [];
  if (v.benefitType === 'FIXED_OFF' && !v.benefitValue) out.push({ path: ['benefitValue'], message: 'Enter the amount off' });
  if (v.benefitType === 'PERCENT_OFF' && (!v.benefitValue || v.benefitValue > 100)) out.push({ path: ['benefitValue'], message: 'Enter a percentage from 1 to 100' });
  if (v.claimStartAt && v.claimEndAt && v.claimStartAt >= v.claimEndAt) out.push({ path: ['claimEndAt'], message: 'Claiming must end after it starts' });
  if (v.claimEndAt && v.validUntil && v.validUntil < v.claimEndAt) out.push({ path: ['validUntil'], message: 'Vouchers must stay valid at least until claiming ends' });
  return out;
}

const withRules = <T extends z.ZodType<Checked>>(s: T) =>
  s.superRefine((v, ctx) => {
    for (const i of campaignIssues(v)) ctx.addIssue({ code: 'custom', path: i.path, message: i.message });
  });

export const CampaignInput = withRules(
  z.object({ ...fields, memberOnly: fields.memberOnly.default(true), perUserLimit: fields.perUserLimit.default(1), outletIds: outletIds.default([]) }),
);
export type CampaignInput = z.infer<typeof CampaignInput>;

export const CampaignPatch = z.object(fields).partial();
export type CampaignPatch = z.infer<typeof CampaignPatch>;

/** On a live (approved or paused) offer only these may change: members claimed it under its terms. */
export const LIVE_EDITABLE = ['totalQty', 'outletIds'] as const;

export const CodeBody = z.object({ code: z.string().trim().min(4).max(64) });
export const RedeemBody = CodeBody.extend({ outletId: z.string().regex(/^\d+$/) });
export const ReverseBody = z.object({ reason: z.string().trim().min(5, 'Say why in a few words').max(500) });
