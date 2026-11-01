import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomToken } from '../../../core/crypto.js';
import type { PaymentProvider, PaymentResult } from './types.js';

/**
 * Local test gateway for development and automated tests. Refused in production (see config/env.ts).
 * Its checkout page lets you choose "pay" or "fail"; it then sends a signed callback like a real gateway.
 */
const KEY = 'fake-gateway-signing-key';
const bills = new Map<string, { amountSen: number; paid: boolean; paidAt: Date | null; callbackUrl: string; redirectUrl: string }>();

export const fakeSign = (ref: string, paid: boolean, amountSen: number) =>
  createHmac('sha256', KEY).update(`${ref}|${paid}|${amountSen}`).digest('hex');

export function fakeBill(ref: string) {
  return bills.get(ref);
}

export function fakeMarkPaid(ref: string, paid: boolean) {
  const bill = bills.get(ref);
  if (bill) Object.assign(bill, { paid, paidAt: paid ? new Date() : null });
  return bill;
}

function verify(ref: unknown, paid: unknown, amount: unknown, sig: unknown): PaymentResult | null {
  if (typeof ref !== 'string' || typeof sig !== 'string') return null;
  const isPaid = paid === true || paid === 'true';
  const amountSen = Number(amount);
  const expected = Buffer.from(fakeSign(ref, isPaid, amountSen));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { providerRef: ref, paid: isPaid, amountSen, paidAt: isPaid ? new Date() : null, state: isPaid ? 'paid' : 'due', raw: { ref, paid, amount } };
}

export const fakeProvider: PaymentProvider = {
  name: 'fake',
  async createPayment(input) {
    const ref = `fake_${randomToken(9)}`;
    bills.set(ref, { amountSen: input.amountSen, paid: false, paidAt: null, callbackUrl: input.callbackUrl, redirectUrl: input.redirectUrl });
    const base = new URL(input.callbackUrl).origin;
    return { providerRef: ref, checkoutUrl: `${base}/api/v1/payments/fake/checkout/${ref}` };
  },
  verifyCallback: (b) => verify(b.ref, b.paid, b.amount, b.signature),
  verifyRedirect: (q) => verify(q.ref, q.paid, q.amount, q.signature),
  async queryStatus(ref) {
    const bill = bills.get(ref);
    if (!bill) throw new Error('Unknown fake bill');
    return { providerRef: ref, paid: bill.paid, amountSen: bill.amountSen, paidAt: bill.paidAt, state: bill.paid ? 'paid' : 'due', raw: {} };
  },
};
