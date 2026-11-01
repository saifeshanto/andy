# vouchers

Merchant voucher offers (e.g. "Free car wash"), claimed by members and redeemed at the counter by QR code or typed code.
Open questions and their current defaults are in the project's `PHASE6_QUESTIONS.md`.

- **Offers (`VoucherCampaign`):** `DRAFT → PENDING → APPROVED / REJECTED`, then `PAUSED` or `ENDED`. Created by merchant owners and
  managers (`vouchers.manage`), approved by admins (`vouchers.review`). A draft needs one open outlet and a future claim end date.
- **Live offers keep their terms:** once approved only the quantity (never below the number claimed) and outlets can change, because
  members claimed it under those terms. Pausing or ending stops new claims only; vouchers already held still work until they expire.
- **Claiming:** free only for now (OPEN-24). Quantity and per-member limits are enforced by one conditional `UPDATE` on the offer row,
  which also serialises concurrent claims. Members-only offers need an active membership.
- **Codes:** 10 random characters without look-alikes, shown `XXXXX-XXXXX`. The QR code holds the same text. Lookups are
  rate-limited per staff member, and a code belonging to another merchant looks exactly like an unknown code.
- **Expiry:** `validUntil`, or `validDays` after claiming if sooner. Screens compare against the clock; the `expire-vouchers` cron job
  tidies stored statuses and ends offers past their claim date.
- **Redemption:** lookup (no change), then confirm. The voucher moves `ACTIVE → REDEEMED` in one conditional update, so a double scan
  cannot redeem twice. Members-only vouchers need the membership active on the day of use (OPEN-25). Staff tied to one outlet can only
  redeem there. Every redemption records staff, outlet, IP and device, and the member is emailed.
- **Undo (OPEN-28 default):** admins with `vouchers.manage`, within 24 hours, with a reason. The redemption row is kept and marked reversed.
- **Cashiers** see only their own redemptions; owners and managers see all.
- **Not built:** paid vouchers and checkout coupons, which need online payment (deferred to last).
