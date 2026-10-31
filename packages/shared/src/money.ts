/**
 * Money helpers. All money is stored and calculated as integer sen (1 RM = 100 sen).
 * Never use floating point for money logic. See AGENTS.md section 6.
 */

export type Sen = number;

export const CURRENCY = 'MYR' as const;

/** Throws unless the value is a safe, whole number of sen. */
export function assertSen(value: number, label = 'amount'): asserts value is Sen {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a whole number of sen, got ${value}`);
  }
}

/** Parse a ringgit string such as "399", "399.5" or "1,234.50" into sen without floats. */
export function parseRM(input: string): Sen {
  const cleaned = input.replace(/^\s*RM\s*/i, '').replace(/,/g, '').trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new TypeError(`Invalid ringgit amount: "${input}"`);
  const [, sign, whole, frac = ''] = match;
  const sen = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  const result = sign ? -sen : sen;
  assertSen(result);
  return result;
}

/** Format sen as "RM 1,234.50". */
export function formatRM(sen: Sen): string {
  assertSen(sen);
  const negative = sen < 0;
  const abs = Math.abs(sen);
  const whole = Math.floor(abs / 100).toLocaleString('en-MY');
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}RM ${whole}.${frac}`;
}

/** Add any number of sen amounts, checking each one. */
export function sumSen(...amounts: Sen[]): Sen {
  let total = 0;
  for (const a of amounts) {
    assertSen(a);
    total += a;
  }
  assertSen(total, 'total');
  return total;
}

/**
 * Percentage of an amount in basis points (1% = 100 bps), rounded half up to the nearest sen.
 * Example: percentOf(39900, 600) = 2394 (6% of RM399).
 */
export function percentOf(sen: Sen, basisPoints: number): Sen {
  assertSen(sen);
  assertSen(basisPoints, 'basisPoints');
  const raw = sen * basisPoints;
  const result = Math.sign(raw) * Math.floor((Math.abs(raw) + 5000) / 10000);
  assertSen(result);
  return result;
}
