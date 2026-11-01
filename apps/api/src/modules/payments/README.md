# payments

Gateway-agnostic payment layer. Providers implement `PaymentProvider` (`providers/types.ts`).

- `billplz`: Billplz API v3. Bills are created in sen; callbacks and redirects are checked with X Signature (HMAC-SHA256).
- `fake`: local test gateway with a checkout page at `/api/v1/payments/fake/checkout/:ref`. Refused in production.

## Rules
- A payment becomes PAID only from a verified callback (`POST /payments/webhook/:provider`) or a server-side
  status query (redirect handler, `reconcile-payments` job, admin re-check). The browser redirect alone never marks anything paid.
- `applyPaymentResult` locks the payment row (`SELECT … FOR UPDATE`) and is idempotent: repeated or concurrent callbacks fulfil once.
- The paid amount must equal the order total, otherwise `AMOUNT_MISMATCH` is logged and nothing is fulfilled.
- A late payment on an EXPIRED order is still honoured.
- Every webhook call is stored in `PaymentWebhookLog`, valid or not.
