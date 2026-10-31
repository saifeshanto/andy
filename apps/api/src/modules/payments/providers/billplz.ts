import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CreatePaymentInput, CreatedPayment, PaymentProvider, PaymentResult } from './types.js';

/**
 * Billplz API v3 (https://support.billplz.com/api).
 * Auth: Basic with the API secret key as username. Amounts are in sen.
 * Callbacks and redirects are verified with X Signature (HMAC-SHA256).
 */
export interface BillplzConfig {
  apiKey: string;
  xSignatureKey: string;
  collectionId: string;
  sandbox: boolean;
  fetchFn?: typeof fetch;
}

/** Builds the X Signature source string: key+value pairs, sorted case-insensitively, joined with "|". */
export function billplzSignatureSource(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([k]) => k !== 'x_signature')
    .map(([k, v]) => `${k}${v ?? ''}`)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .join('|');
}

export function billplzSign(fields: Record<string, unknown>, key: string): string {
  return createHmac('sha256', key).update(billplzSignatureSource(fields)).digest('hex');
}

function signatureValid(fields: Record<string, unknown>, given: unknown, key: string): boolean {
  if (typeof given !== 'string' || !/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = Buffer.from(billplzSign(fields, key), 'hex');
  const actual = Buffer.from(given, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** "2018-09-27 15:15:09 +0800" → Date */
function parsePaidAt(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(v.trim());
  const d = m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function createBillplzProvider(cfg: BillplzConfig): PaymentProvider {
  const base = cfg.sandbox ? 'https://www.billplz-sandbox.com/api/v3' : 'https://www.billplz.com/api/v3';
  const doFetch = cfg.fetchFn ?? fetch;
  const auth = `Basic ${Buffer.from(`${cfg.apiKey}:`).toString('base64')}`;

  async function call(path: string, init: RequestInit = {}) {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: { authorization: auth, accept: 'application/json', ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = body.error as { type?: string; message?: unknown } | undefined;
      throw new Error(`Billplz ${res.status}: ${err?.type ?? ''} ${JSON.stringify(err?.message ?? body)}`.trim());
    }
    return body;
  }

  const toResult = (b: Record<string, unknown>): PaymentResult => ({
    providerRef: str(b.id),
    paid: b.paid === true || b.paid === 'true',
    amountSen: Number(b.paid_amount ?? b.amount ?? 0),
    paidAt: parsePaidAt(b.paid_at),
    state: str(b.state),
    raw: b,
  });

  return {
    name: 'billplz',

    async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
      const form = new URLSearchParams({
        collection_id: cfg.collectionId,
        email: input.customer.email,
        name: input.customer.name.slice(0, 255),
        amount: String(input.amountSen),
        description: input.description.slice(0, 200),
        callback_url: input.callbackUrl,
        redirect_url: input.redirectUrl,
        reference_1_label: 'Order',
        reference_1: input.orderNo,
      });
      const bill = await call('/bills', {
        method: 'POST',
        body: form,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      if (typeof bill.id !== 'string' || typeof bill.url !== 'string') throw new Error('Billplz returned no bill id/url');
      return { providerRef: bill.id, checkoutUrl: bill.url };
    },

    verifyCallback(body) {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) if (k !== 'x_signature') fields[k] = v;
      if (!signatureValid(fields, body.x_signature, cfg.xSignatureKey)) return null;
      return toResult(body);
    },

    verifyRedirect(query) {
      // Express parses billplz[id]=... into { billplz: { id, paid, paid_at, x_signature } }.
      const b = (query.billplz ?? {}) as Record<string, unknown>;
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) if (k !== 'x_signature') fields[`billplz${k}`] = v;
      if (!signatureValid(fields, b.x_signature, cfg.xSignatureKey)) return null;
      // A redirect carries no amount; the caller must not trust it for amounts.
      return { providerRef: str(b.id), paid: b.paid === 'true', amountSen: -1, paidAt: parsePaidAt(b.paid_at), state: b.paid === 'true' ? 'paid' : 'due', raw: b };
    },

    async queryStatus(providerRef) {
      return toResult(await call(`/bills/${encodeURIComponent(providerRef)}`));
    },
  };
}
