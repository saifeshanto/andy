/**
 * Every gateway implements this. No gateway-specific code outside its provider file (AGENTS.md section 6).
 */
export interface CreatePaymentInput {
  orderNo: string;
  amountSen: number;
  description: string;
  customer: { name: string; email: string };
  callbackUrl: string; // server-to-server notification
  redirectUrl: string; // where the customer's browser returns
}

export interface CreatedPayment {
  providerRef: string;
  checkoutUrl: string;
}

/** A gateway's verified view of a payment. */
export interface PaymentResult {
  providerRef: string;
  paid: boolean;
  amountSen: number;
  paidAt: Date | null;
  state: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Verifies a server callback. Returns null when the signature is invalid. */
  verifyCallback(body: Record<string, unknown>): PaymentResult | null;
  /** Verifies the browser redirect query. Returns null when the signature is invalid. */
  verifyRedirect(query: Record<string, unknown>): PaymentResult | null;
  /** Asks the gateway directly (used by the reconcile job). */
  queryStatus(providerRef: string): Promise<PaymentResult>;
}
