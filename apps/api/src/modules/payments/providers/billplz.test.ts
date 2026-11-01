import { describe, expect, it } from 'vitest';
import { billplzSign, billplzSignatureSource, createBillplzProvider } from './billplz.js';

// Worked example from https://support.billplz.com/api (X Signature, redirect).
const KEY = 'S-s7b4yWpp9h7rrkNM1i3Z_g';

describe('Billplz X Signature', () => {
  it('matches the documented redirect example', () => {
    const fields = { billplzid: 'zq0tm2wc', billplzpaid: 'true', billplzpaid_at: '2018-09-27 15:15:09 +0800' };
    expect(billplzSignatureSource(fields)).toBe('billplzidzq0tm2wc|billplzpaid_at2018-09-27 15:15:09 +0800|billplzpaidtrue');
    expect(billplzSign(fields, KEY)).toBe('4aab095fe5a39b1d534500988f9a0cb085cd1b6d5bbb55dd4e02ea6fa102b47b');
  });

  const provider = createBillplzProvider({ apiKey: 'k', xSignatureKey: KEY, collectionId: 'c', sandbox: true });

  it('verifies a redirect and rejects tampering', () => {
    const billplz = { id: 'zq0tm2wc', paid: 'true', paid_at: '2018-09-27 15:15:09 +0800', x_signature: '4aab095fe5a39b1d534500988f9a0cb085cd1b6d5bbb55dd4e02ea6fa102b47b' };
    const ok = provider.verifyRedirect({ billplz });
    expect(ok).toMatchObject({ providerRef: 'zq0tm2wc', paid: true });
    expect(ok?.paidAt?.toISOString()).toBe('2018-09-27T07:15:09.000Z');
    expect(provider.verifyRedirect({ billplz: { ...billplz, paid: 'false' } })).toBeNull();
    expect(provider.verifyRedirect({ billplz: { ...billplz, x_signature: 'nope' } })).toBeNull();
  });

  it('verifies a callback, including empty fields, and rejects a changed amount', () => {
    const body: Record<string, string> = {
      id: 'zq0tm2wc', collection_id: 'yhx5t1pp', paid: 'true', state: 'paid', amount: '39900', paid_amount: '39900',
      due_at: '2026-10-31', email: 'a@example.com', mobile: '', name: 'ALI', url: 'https://www.billplz-sandbox.com/bills/zq0tm2wc',
      paid_at: '2026-10-31 10:00:00 +0800',
    };
    body.x_signature = billplzSign(body, KEY);
    expect(provider.verifyCallback(body)).toMatchObject({ paid: true, amountSen: 39900 });
    expect(provider.verifyCallback({ ...body, paid_amount: '100' })).toBeNull();
  });

  it('creates a bill with basic auth and form fields', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const p = createBillplzProvider({
      apiKey: 'secret', xSignatureKey: KEY, collectionId: 'col1', sandbox: true,
      fetchFn: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(JSON.stringify({ id: 'b1', url: 'https://www.billplz-sandbox.com/bills/b1' }), { status: 200 });
      }) as typeof fetch,
    });
    const res = await p.createPayment({
      orderNo: 'ORD1', amountSen: 39900, description: 'Membership', customer: { name: 'Ali', email: 'ali@example.com' },
      callbackUrl: 'https://x.test/cb', redirectUrl: 'https://x.test/rd',
    });
    expect(res).toEqual({ providerRef: 'b1', checkoutUrl: 'https://www.billplz-sandbox.com/bills/b1' });
    expect(seen?.url).toBe('https://www.billplz-sandbox.com/api/v3/bills');
    expect((seen?.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('secret:').toString('base64')}`);
    const form = new URLSearchParams(String(seen?.init.body));
    expect(form.get('amount')).toBe('39900');
    expect(form.get('collection_id')).toBe('col1');
    expect(form.get('reference_1')).toBe('ORD1');
  });
});
