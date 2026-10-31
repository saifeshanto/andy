import { env } from '../../../config/env.js';
import { AppError } from '../../../core/errors.js';
import { createBillplzProvider } from './billplz.js';
import { fakeProvider } from './fake.js';
import type { PaymentProvider } from './types.js';

let billplz: PaymentProvider | undefined;
let override: PaymentProvider | undefined;

/** Tests can swap in a provider. */
export function setProviderForTests(p: PaymentProvider | undefined) {
  override = p;
}

export function activeProviderName(): string {
  return override?.name ?? env().PAYMENT_PROVIDER ?? 'none';
}

/** The configured gateway, or a clear error if payments are not set up yet. */
export function getProvider(name = activeProviderName()): PaymentProvider {
  if (override && override.name === name) return override;
  if (name === 'fake' && env().PAYMENT_PROVIDER === 'fake') return fakeProvider;
  if (name === 'billplz') {
    const cfg = env();
    if (!cfg.BILLPLZ_API_KEY || !cfg.BILLPLZ_X_SIGNATURE_KEY || !cfg.BILLPLZ_COLLECTION_ID) {
      throw new AppError('PAYMENTS_NOT_CONFIGURED', 503, 'Online payment is not available yet');
    }
    billplz ??= createBillplzProvider({
      apiKey: cfg.BILLPLZ_API_KEY,
      xSignatureKey: cfg.BILLPLZ_X_SIGNATURE_KEY,
      collectionId: cfg.BILLPLZ_COLLECTION_ID,
      sandbox: cfg.BILLPLZ_SANDBOX,
    });
    return billplz;
  }
  throw new AppError('PAYMENTS_NOT_CONFIGURED', 503, 'Online payment is not available yet');
}

export type { PaymentProvider, PaymentResult } from './types.js';
