# merchant-portal

Everything under `/merchant/:merchantId/...`. `merchantAccess(req, action)` checks the caller's staff seat against
`MERCHANT_ROLE_ACTIONS` in `@andy/shared` (OPEN-17 proposed split). Non-staff get 404. Suspended merchants are read-only.

- Staff invitations: random token emailed, only its SHA-256 stored, single use, 7-day expiry, must be accepted by an account with the invited email.
- Managers manage cashiers; only the owner manages managers; nobody changes the owner or their own seat here.
