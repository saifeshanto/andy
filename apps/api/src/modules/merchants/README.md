# merchants

Merchant applications and admin review. Portal features (staff, outlets, profile) live in `merchant-portal`.

- `DRAFT → SUBMITTED → APPROVED / CHANGES_REQUESTED / REJECTED`, then `APPROVED ⇄ SUSPENDED`.
- Applicant must have a confirmed email; one open application per user. Submit needs SSM no., phone, full address and an SSM certificate upload.
- Transitions are a single conditional UPDATE, so two admins acting at once cannot both win. Every decision is audited and emailed.
- On approval the public slug is set from the name, and the business address becomes the first outlet.
- Documents are private files: only the uploader, the merchant's owner/managers and staff with `merchants.read` can download them.
