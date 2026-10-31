import { describe, expect, it } from 'vitest';
import { addMonths } from './dates.js';

describe('addMonths', () => {
  it('adds 12 months', () => {
    expect(addMonths(new Date('2026-03-15T02:00:00Z'), 12).toISOString()).toBe('2027-03-15T02:00:00.000Z');
  });
  it('clamps to the end of the month in Malaysia time', () => {
    // 31 Jan 2027 10:00 MYT + 1 month = 28 Feb 2027 10:00 MYT
    expect(addMonths(new Date('2027-01-31T02:00:00Z'), 1).toISOString()).toBe('2027-02-28T02:00:00.000Z');
  });
  it('uses the Malaysian calendar date near midnight', () => {
    // 29 Feb 2028 23:30 MYT is 29 Feb 15:30 UTC; +12 months = 28 Feb 2029 23:30 MYT
    expect(addMonths(new Date('2028-02-29T15:30:00Z'), 12).toISOString()).toBe('2029-02-28T15:30:00.000Z');
  });
});
