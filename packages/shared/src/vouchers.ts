import { formatRM } from './money.js';

/**
 * Voucher codes: 10 characters from an alphabet without look-alikes (no 0, O, 1, I or L),
 * shown as XXXXX-XXXXX. 31^10 ≈ 8 × 10^14 possible codes, so they cannot be guessed.
 * The QR code holds the same text, so a cashier can scan it or type it.
 */
export const VOUCHER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const VOUCHER_CODE_LENGTH = 10;

/** Accepts what a cashier types or a scanner reads: any case, with spaces or dashes. */
export function normalizeVoucherCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

export function formatVoucherCode(code: string): string {
  return code.length === VOUCHER_CODE_LENGTH ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export type VoucherBenefitType = 'FREE_ITEM' | 'FIXED_OFF' | 'PERCENT_OFF';

/** A short line describing the benefit, e.g. "RM 20.00 off" or "15% off". */
export function describeBenefit(type: VoucherBenefitType, value: number | null): string {
  if (type === 'FIXED_OFF' && value) return `${formatRM(value)} off`;
  if (type === 'PERCENT_OFF' && value) return `${value}% off`;
  return 'Free';
}
