# membership

Annual membership (default plan RM399 for 12 months, created at startup by `ensureDefaultPlan`).

- `activateFromOrder` runs inside the payment transaction. `Membership.sourceOrderId` is unique, so one order activates at most one term.
- Terms are computed in Malaysia time (`dates.ts`, clamped to month end).
- Business rules still waiting on Andy are admin settings, defaulting to the safe choice:
  - `membership.renewalStartsFrom` (OPEN-02): unset means members with an active term cannot buy another.
  - `membership.reminderDays` (OPEN-03): empty means no reminder emails.
- Jobs: `expire-memberships`, `membership-reminders` (never sends the same reminder twice; skips members who already renewed).
- Offline payments: `POST /admin/users/:publicId/membership/manual-payment` (`memberships.manage`, Super Admin and Finance)
  records a cash or bank-transfer payment at the plan price as a PAID order with provider `manual`, then activates through
  the same `activateFromOrder`. The reference must be unique per manual payment. Used while the online gateway is off.
