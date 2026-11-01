import { describe, expect, it } from 'vitest';
import { formatRM, parseRM, percentOf, sumSen } from './money.js';

describe('money', () => {
  it('parses ringgit strings into sen', () => {
    expect(parseRM('399')).toBe(39900);
    expect(parseRM('RM 1,234.5')).toBe(123450);
    expect(parseRM('0.01')).toBe(1);
    expect(parseRM('-49.00')).toBe(-4900);
  });

  it('rejects invalid amounts', () => {
    expect(() => parseRM('12.345')).toThrow();
    expect(() => parseRM('abc')).toThrow();
  });

  it('formats sen as RM', () => {
    expect(formatRM(39900)).toBe('RM 399.00');
    expect(formatRM(123450)).toBe('RM 1,234.50');
    expect(formatRM(5)).toBe('RM 0.05');
    expect(formatRM(-4900)).toBe('-RM 49.00');
  });

  it('sums without float drift', () => {
    expect(sumSen(10, 20)).toBe(30);
    expect(sumSen(10000, 5000, 4900)).toBe(19900);
  });

  it('refuses fractional sen', () => {
    expect(() => formatRM(0.1 + 0.2)).toThrow();
  });

  it('computes percentages in basis points with half-up rounding', () => {
    expect(percentOf(39900, 600)).toBe(2394);
    expect(percentOf(150, 3333)).toBe(50);
  });
});

import { describeBenefit, formatVoucherCode, normalizeVoucherCode } from './vouchers.js';
describe('voucher codes', () => {
  it('normalises typed and scanned codes', () => {
    expect(normalizeVoucherCode(' abcde-fgh23 ')).toBe('ABCDEFGH23');
    expect(formatVoucherCode('ABCDEFGH23')).toBe('ABCDE-FGH23');
    expect(describeBenefit('FIXED_OFF', 2000)).toBe('RM 20.00 off');
    expect(describeBenefit('PERCENT_OFF', 15)).toBe('15% off');
    expect(describeBenefit('FREE_ITEM', null)).toBe('Free');
  });
});
