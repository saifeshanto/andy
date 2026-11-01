import type { MerchantCard, Outlet } from '@/features/marketplace/types';

export type CampaignStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'ENDED';
export type BenefitType = 'FREE_ITEM' | 'FIXED_OFF' | 'PERCENT_OFF';
export type ClaimState = 'OPEN' | 'NOT_STARTED' | 'CLOSED' | 'SOLD_OUT' | 'UNAVAILABLE';

export interface CampaignView {
  id: string;
  slug: string | null;
  title: string;
  terms: string;
  benefitType: BenefitType;
  benefitValue: number | null;
  benefit: string;
  memberOnly: boolean;
  totalQty: number | null;
  claimedCount: number;
  redeemedCount: number;
  perUserLimit: number;
  claimStartAt: string | null;
  claimEndAt: string;
  validUntil: string;
  validDays: number | null;
  status: CampaignStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  outletIds?: string[];
  missing?: string[];
}

export interface PublicVoucher {
  id: string;
  slug: string;
  title: string;
  benefit: string;
  benefitType: BenefitType;
  memberOnly: boolean;
  claimEndAt: string;
  validUntil: string;
  validDays: number | null;
  remaining: number | null;
  perUserLimit: number;
  claimState: ClaimState;
  myClaims: number;
  merchant: MerchantCard;
  terms?: string;
  outlets?: Outlet[];
}

export type VoucherStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'VOID';

export interface MyVoucher {
  code: string;
  status: VoucherStatus;
  claimedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedOutlet: string | null;
  title: string;
  terms: string;
  benefit: string;
  memberOnly: boolean;
  campaignSlug: string;
  merchant: { name: string; slug: string; phone: string | null };
  outlets?: Outlet[];
}

export interface Redemption {
  id: string;
  at: string;
  code: string;
  title: string;
  member: { name: string; email?: string };
  staff: string;
  outlet: string;
  merchant?: string;
  reversedAt: string | null;
  reverseReason: string | null;
}

export const campaignStatusLabel: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Waiting for approval',
  APPROVED: 'Live',
  REJECTED: 'Not approved',
  PAUSED: 'Paused',
  ENDED: 'Ended',
};
export const campaignStatusTone: Record<CampaignStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  PAUSED: 'warning',
  ENDED: 'neutral',
};

export const voucherStatusLabel: Record<VoucherStatus, string> = { ACTIVE: 'Ready to use', REDEEMED: 'Used', EXPIRED: 'Expired', VOID: 'Cancelled' };

/** "2026-12-31" → the end of that day in Malaysia time, as an ISO string. */
export const endOfDayMYT = (ymd: string) => new Date(`${ymd}T23:59:59+08:00`).toISOString();
/** "2026-12-31" → the start of that day in Malaysia time. */
export const startOfDayMYT = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toISOString();
/** ISO → "YYYY-MM-DD" in Malaysia time, for date inputs. */
export const toDateInput = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10) : '');

export const claimStateText: Record<ClaimState, string> = {
  OPEN: 'Claim voucher',
  NOT_STARTED: 'Not open yet',
  CLOSED: 'Claiming has ended',
  SOLD_OUT: 'All claimed',
  UNAVAILABLE: 'Not available',
};
