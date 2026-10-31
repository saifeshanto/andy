# PROJECT_PLAN.md — Andy Automotive Marketplace, Membership, Merchant & Affiliate Platform

**Status:** Phase 1 — Planning draft for review. Nothing in this plan is approved yet.
**Prepared for:** Saife (on behalf of client, Andy)
**Date:** 31 October 2026
**Currency:** MYR (RM) throughout

> **How to read this plan.** Anything marked **[OPEN-xx]** is a business rule that has *not* been given to us. The plan leaves a slot for it rather than guessing. The full list is in §12. Development of the affected module cannot finish until each related question is answered.

---

## Table of contents

1. Goals and scope
2. User roles and permissions
3. Detailed features by module (1–24)
4. Sitemap and dashboard structure
5. System architecture
6. Folder structure
7. Database schema
8. API endpoints
9. Core workflows (membership, affiliate, commission, wallet, withdrawal, payment, voucher)
10. UI/UX strategy
11. Development phases, milestones and timeline
12. Missing business requirements (open questions)
13. Security
14. Testing strategy
15. Deployment, environments, backups
16. Hostinger Business Web Hosting: constraints and how we design around them
17. Dependencies (planned, not installed)
18. Risks and mitigations
19. Maintenance plan
20. Approval checklist

---

## 1. Goals and scope

Build a single web platform where:

- The **public** browses an automotive marketplace (products, services, merchants, vouchers).
- **Members** pay an annual membership (RM399/year), get member-only vouchers/prices, refer others, and earn 3-level commissions into a wallet they can withdraw.
- **Merchants** (workshops, detailers, parts sellers, etc.) register, are approved, list products/services/vouchers, and redeem member vouchers at their counter by QR or code, with multiple staff accounts.
- **Admins** approve merchants/products/vouchers, manage members, payouts, banners, announcements and reports.

**Out of scope for v1 unless confirmed:** native mobile apps, multi-language (see OPEN-40), multi-currency, merchant self-payouts/marketplace settlement (see OPEN-20), delivery/logistics integration, live chat.

---

## 2. User roles and permissions

| Role | Who | Key abilities |
|---|---|---|
| **Guest** | Not logged in | Browse marketplace, view merchants/products/public vouchers, register, use a referral link |
| **Registered user (non-member)** | Signed up, not paid / expired | Profile, cart & checkout for non-member items (if allowed — OPEN-11), buy membership |
| **Member** | Active RM399/year | Member pricing & vouchers, wallet, referral link & downline view, withdrawal requests, renewals |
| **Merchant Owner** | Business account holder | Merchant profile, products/services/vouchers (submitted for approval), staff management, redemption, merchant reports |
| **Merchant Manager** | Staff with elevated rights | Same as owner except billing/ownership transfer and deleting the merchant (exact split — OPEN-17) |
| **Merchant Staff (Cashier)** | Counter staff | Scan/enter voucher codes, view own redemption history only |
| **Admin – Super Admin** | Andy / platform owner | Everything, including role management, settings, commission rates, payouts approval |
| **Admin – Operations** | Back-office staff | Approvals (merchant/product/voucher), member support, banners, announcements |
| **Admin – Finance** | Finance staff | Wallet ledger, withdrawals review/approval, payout batches, financial reports, refunds |
| **Admin – Support (read-mostly)** | Customer support | View members/orders, resend emails, no money actions |

A user can hold more than one role (e.g. a Member who is also a Merchant Owner). Permissions are granted to roles as **named permissions** (e.g. `withdrawal.approve`), not hard-coded role checks, so Andy can adjust admin roles later without code changes.

**Role questions:** Can a merchant owner also be a member and earn commissions? (OPEN-16). Do admin actions on money need two-person approval (maker-checker)? (OPEN-23)

---

## 3. Detailed features by module

Each module below becomes one backend module and one frontend feature folder (see §6).

### M1. Website setup and configuration
- Site settings: name, logo, favicon, contact details, social links, SEO defaults, footer content, legal pages (Terms, Privacy, Refund, Affiliate T&C).
- Configurable values stored in DB (not hard-coded): membership price, membership duration, commission amounts per level, withdrawal minimum/fee, renewal reminder days, voucher defaults.
- Every change to a money-related setting is versioned and audit-logged (who, when, old → new), and takes effect only for transactions created after the change.
- Maintenance-mode toggle.

### M2. Public automotive marketplace
- Home page: hero banner carousel, featured merchants, featured products/services, featured vouchers, categories, membership CTA.
- Browse/search/filter by category, location (state/city), price range, merchant, product vs service, member-only.
- Product/service detail, merchant public profile page, voucher detail page.
- SEO: server-friendly URLs (`/merchants/:slug`, `/products/:slug`), meta tags, sitemap.xml, Open Graph. (SPA SEO limits — see §18 R7.)

### M3. Member registration and profiles
- Sign up with email + password (+ phone). Optional referral code captured from link (`?ref=CODE`) or typed manually.
- Email verification. Phone OTP — OPEN-07.
- Profile: name, IC/passport (OPEN-08 — needed for payouts/KYC?), phone, address, vehicle(s) (make/model/year/plate — optional), bank details for payouts.
- Password reset, change email, account deletion request (PDPA).

### M4. Annual membership (RM399/year)
- Purchase membership via payment gateway.
- Membership states: `PENDING_PAYMENT → ACTIVE → GRACE (optional, OPEN-03) → EXPIRED`, plus `CANCELLED`, `REFUNDED`.
- Start date = payment confirmation date; end date = start + 12 months (OPEN-02 for exact rule).
- Membership card page with member number + QR (for merchant identification, if needed).

### M5. Member dashboard
- Overview: membership status & expiry, wallet balance (available / pending / withdrawn), recent commissions, referral link with copy/share buttons.
- My vouchers (claimed / redeemed / expired), my orders, my referrals (level 1/2/3 counts and list, privacy rules OPEN-14), wallet & transactions, withdrawals, profile & bank details, notifications/announcements.

### M6. Merchant registration and management
- Merchant application form: business name, SSM registration no., business type, address, operating hours, contact, logo, photos, bank details (if merchants get paid — OPEN-20), documents upload.
- Statuses: `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED (with reason) → SUSPENDED`.
- Merchant fees/subscription? OPEN-18.

### M7. Merchant portal with multiple staff accounts
- Owner invites staff by email; staff accept invite and set password.
- Staff roles: Manager, Cashier (permission sets per §2).
- Multiple outlets/branches per merchant? OPEN-19. The schema supports outlets so we can enable it without a rewrite.
- Staff deactivation; all redemptions record which staff member performed them.

### M8. Automotive products and services
- Merchants create listings: type (product/service), category, title, description, images, normal price, member price, stock (products only), duration (services), availability.
- Listings require admin approval before going public; edits to approved listings re-enter approval (or only some fields — OPEN-21).
- Categories managed by admin (e.g. Servicing, Tyres, Car Wash & Detailing, Accessories, Insurance, Towing).

### M9. Coupon and voucher management
Two different things, kept separate:
- **Coupons** = discount codes applied at online checkout (e.g. `RAYA10`), created by admin (and merchants? OPEN-26).
- **Vouchers** = entitlements a member claims/buys and redeems at a merchant (e.g. "Free car wash at X").
- Voucher definition: merchant, title, terms, value/type (free item, fixed RM off, % off), price to obtain (free for members / paid — OPEN-24), total quantity, per-member limit, validity window, member-only flag, outlets where valid.
- Each claim creates a unique **voucher instance** with its own code + QR.

### M10. QR/code voucher redemption
- Member shows QR (or alphanumeric code) from dashboard.
- Merchant staff scans with phone camera in the merchant portal (browser camera, no app needed) or types code.
- Server validates: belongs to this merchant (and outlet), not used, not expired, member's membership active (if required — OPEN-25), then marks redeemed in a DB transaction (prevents double redemption).
- Partial redemption (stored-value vouchers)? OPEN-27.

### M11. Three-level affiliate referral system
- Every member gets a unique referral code/link.
- Sponsor (upline) is fixed at registration. Changing sponsor after registration — admin-only, audit-logged (OPEN-13).
- Tree stored as: `sponsorId` on each user plus a precomputed **closure table** for fast level-1/2/3 queries.
- Rules needed: can a non-paying registered user be a sponsor? (OPEN-12) What happens to a downline if the sponsor's membership expires? (OPEN-05)

### M12. Three-level commission system (RM100 / RM50 / RM49)
- When a membership payment is confirmed, commissions are created for up to 3 uplines: L1 = RM100, L2 = RM50, L3 = RM49 (configurable values).
- Amounts are stored on each commission row at the time of creation, so later rate changes do not alter history.
- Commission status: `PENDING → AVAILABLE → (WITHDRAWN via withdrawal)`, or `REVERSED` (clawback).
- Undecided: does it apply to renewals too, or first purchase only? (OPEN-04) What if an upline is not an active member — skip, hold, or roll up to the company? (OPEN-05) Holding period before available? (OPEN-06) Clawback on refund/chargeback? (OPEN-09)
- **Legal note:** RM199 of RM399 (≈50%) paid out for recruitment needs Malaysian legal review before launch — see §18 R1.

### M13. Member wallet and transaction history
- Double-entry style **append-only ledger**: every money movement is a `wallet_transaction` row (credit/debit, type, reference, balance after). Balances are derived from and reconciled against the ledger; never edited directly.
- Buckets: Pending, Available, Locked (in withdrawal), Withdrawn.
- Can wallet balance be used to pay for renewals/products? (OPEN-29) If yes, it adds a payment method at checkout.
- Statement view with filters and CSV export.

### M14. Commission withdrawal and payouts
- Member requests withdrawal from Available balance → amount moves to Locked.
- Requires verified bank details (and KYC? OPEN-08).
- Finance admin reviews → Approve / Reject (funds return to Available) → mark Paid with bank reference (manual bank transfer in v1) → member notified.
- Payout batches export (CSV for bank bulk-upload; bank format OPEN-31).
- Minimum amount, fee, frequency limits, processing days: OPEN-30.
- Automated payout via gateway API is a later option (§11 Phase 7).

### M15. Shopping cart and checkout
- Cart holds products/services/paid vouchers, possibly from multiple merchants (OPEN-11 whether marketplace items are sold online at all, or only listed).
- Checkout: price summary, member price applied when active, coupon, SST line (OPEN-35), payment.
- Order states: `PENDING_PAYMENT → PAID → FULFILLED/COMPLETED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`.
- Fulfilment of physical products (shipping vs pickup) — OPEN-22.

### M16. Payment gateway integration
- Gateway not chosen yet (OPEN-01). Candidates for Malaysia: Billplz, ToyyibPay, iPay88, Stripe (MY), SenangPay, Razer/MOLPay, HitPay.
- Built behind a `PaymentProvider` interface (create payment, verify callback signature, query status, refund) so the gateway can be changed without touching orders/membership code.
- Payment is confirmed **only** by the server-side callback/webhook (signature verified) or a server-side status query — never by the browser redirect.
- Idempotent callback handling (same callback twice = processed once).
- Daily reconciliation job (cron) queries the gateway for any payment stuck in `PENDING`.

### M17. Admin dashboard and user management
- KPIs: active members, new members, renewals due, revenue (membership vs marketplace), commissions owed/paid, pending approvals, pending withdrawals.
- Users: search, view, edit, suspend, reset password, view referral tree and wallet, manual adjustment (Finance + reason required, audit-logged).
- Admin staff and role/permission management.

### M18. Membership renewals
- Renew before or after expiry. Early renewal extends from current end date (OPEN-02).
- Reminders at configurable days before expiry (e.g. 30/14/7/1 days) and after expiry.
- Auto-renew / recurring card billing — OPEN-10 (depends on gateway support).

### M19. Merchant, product and voucher approvals
- Single approval queue with tabs: Merchants, Products/Services, Vouchers, (Edits).
- Approve / Reject with reason / Request changes. Notification to merchant. Full history.

### M20. Announcements and banners
- Banners: image (desktop + mobile), link, placement (home hero, marketplace top, dashboard), schedule start/end, order, audience (all / members / merchants).
- Announcements: title, body, audience, publish date, pin; shown in dashboards and optionally emailed.

### M21. Reports and analytics
- Membership: new, renewed, expired, churn, by month.
- Affiliate: top referrers, commissions by level, by period.
- Finance: revenue, refunds, commissions created/reversed/paid, wallet liability (total owed to members), withdrawals.
- Merchant: listings, voucher claims vs redemptions, redemptions by staff/outlet.
- CSV export on every report. Heavy reports computed via cron into summary tables (§16).

### M22. Email notifications and reminders
- Transactional: verification, password reset, payment receipt, membership activated, renewal reminders, commission earned, withdrawal status, merchant application status, approval results, staff invite.
- Templates editable by admin with placeholders.
- Sent through an **outbox table** + cron sender (no persistent queue worker). Provider: Hostinger SMTP vs transactional service (OPEN-36).

### M23. Security, roles and permissions
See §13.

### M24. Testing, deployment and documentation
See §14, §15, §19. API docs via OpenAPI.

---

## 4. Sitemap and dashboard structure

### 4.1 Public site
```
/                         Home
/marketplace              All listings (filters)
/marketplace/category/:slug
/products/:slug           Product/service detail
/merchants                Merchant directory
/merchants/:slug          Merchant profile (listings, vouchers, location)
/vouchers                 Public/member vouchers
/vouchers/:slug
/membership               Benefits, price RM399/year, FAQ, Join
/affiliate                How referral works (wording subject to legal review)
/about, /contact, /faq
/legal/terms, /legal/privacy, /legal/refund, /legal/affiliate-terms
/cart, /checkout, /checkout/result
/register  (?ref=CODE),  /login,  /forgot-password,  /reset-password,  /verify-email
/merchant/apply           Merchant application
```

### 4.2 Member dashboard (`/account`)
```
/account                  Overview
/account/membership       Status, card/QR, renew, history
/account/vouchers         My vouchers (active / used / expired) → voucher QR view
/account/orders           Orders & receipts
/account/referrals        Referral link, L1/L2/L3 downline
/account/wallet           Balances + ledger
/account/withdrawals      Request & history
/account/profile          Personal, vehicles, bank details, security
/account/notifications    Announcements & alerts
```

### 4.3 Merchant portal (`/merchant`)
```
/merchant                 Overview (today's redemptions, pending approvals)
/merchant/redeem          Scan QR / enter code   ← Cashier lands here
/merchant/redemptions     History (filter by staff/outlet/date)
/merchant/listings        Products & services (+ status)
/merchant/vouchers        Voucher campaigns (+ status, claims, redemptions)
/merchant/orders          Orders containing this merchant's items (if online sales)
/merchant/outlets         Branches (if enabled)
/merchant/staff           Invite, roles, deactivate
/merchant/profile         Business profile, documents, bank
/merchant/reports
```

### 4.4 Admin (`/admin`)
```
/admin                    KPI dashboard
/admin/users              Members & users (detail: profile, membership, tree, wallet, orders)
/admin/memberships        List, manual extend/cancel (audit)
/admin/merchants          List, detail, suspend
/admin/approvals          Merchants | Listings | Vouchers | Edits
/admin/catalog/categories
/admin/coupons
/admin/vouchers
/admin/orders, /admin/payments, /admin/refunds
/admin/commissions        List, reverse (audit)
/admin/wallets            Ledger explorer, manual adjustments
/admin/withdrawals        Queue, approve/reject, mark paid, payout batches
/admin/content/banners, /admin/content/announcements, /admin/content/pages
/admin/emails/templates, /admin/emails/log
/admin/reports/*
/admin/settings           Site, membership, commission, withdrawal, payment, email
/admin/staff              Admin users & roles/permissions
/admin/audit-log
/admin/system             Cron status, health, backups info
```

---

## 5. System architecture

### 5.1 Overview
```
Browser (React SPA, Vite build)
   │  HTTPS, JSON, JWT access token in memory + httpOnly refresh cookie
   ▼
Node.js app on Hostinger (single Express process)
   ├─ /api/v1/*   REST API (modular monolith)
   └─ /*          serves built React static files (SPA fallback)
   │
   ├─ Prisma ORM ──► Hostinger MariaDB
   ├─ PaymentProvider adapter ──► Gateway (callbacks to /api/v1/payments/webhook/:provider)
   ├─ Mailer (SMTP / API) ◄── email_outbox table
   └─ File storage (uploads dir on hosting, or object storage — OPEN-37)

Hostinger cron (hPanel) ──► `node scripts/cron.js <job>`  (or HTTPS call to a secret-protected /internal/cron/:job)
   jobs: send-emails, expire-memberships, renewal-reminders, release-pending-commissions,
         reconcile-payments, expire-vouchers, build-report-summaries, cleanup-tokens
```

### 5.2 Modular monolith rules
- One deployable backend; code split into **modules** (`auth`, `members`, `membership`, `merchants`, `catalog`, `vouchers`, `coupons`, `cart`, `orders`, `payments`, `affiliate`, `commissions`, `wallet`, `withdrawals`, `content`, `notifications`, `reports`, `settings`, `admin`, `audit`).
- Each module owns: routes, controller, service, repository (Prisma queries), validation schemas, tests, docs.
- Modules talk to each other only through the other module's **public service interface** (`index.js` exports) or **domain events** (in-process event bus: e.g. `payment.succeeded` → membership activates → affiliate creates commissions). No reaching into another module's tables directly.
- Shared kernel: errors, logger, money helpers, auth middleware, pagination, validation, DB client, transaction helper.

### 5.3 Key technical decisions
| Decision | Choice | Why |
|---|---|---|
| Language | JavaScript with JSDoc, or TypeScript | **Recommend TypeScript** for money logic safety; confirm (OPEN-41) |
| Validation | Zod schemas shared by API and forms | One source of truth for input rules |
| Money | Store as integer **sen** (`INT`/`BIGINT`), never floats | RM399.00 = 39900 |
| Time | Store UTC, display `Asia/Kuala_Lumpur` | Expiry and reports correct |
| IDs | Internal auto-increment BIGINT + public random IDs/codes where exposed | No guessable IDs in URLs/vouchers |
| Concurrency | DB transactions with row locks (`SELECT … FOR UPDATE`) on wallet, voucher, stock rows | Prevent double spend / double redemption |
| Idempotency | Idempotency keys on payment callbacks, withdrawal requests | Retries are safe |
| Background work | Cron + DB tables (outbox, job runs); no Redis/queues | Hostinger constraint |
| API docs | OpenAPI 3 file generated from Zod/route definitions | Documented APIs |

---

## 6. Folder structure

```
andy-platform/
├── AGENTS.md
├── PROJECT_PLAN.md
├── README.md
├── .github/workflows/ci.yml          lint, typecheck, test, build
├── .env.example                      no real secrets ever committed
├── package.json                      npm workspaces: apps/*, packages/*
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed/                 roles, permissions, settings, categories, demo data (dev only)
│   │   ├── src/
│   │   │   ├── app.ts                express app (middleware, routes, static SPA)
│   │   │   ├── server.ts             entry point Hostinger runs
│   │   │   ├── config/               env loading & validation
│   │   │   ├── core/                 db, logger, errors, auth, rbac, events, money, mailer, storage, http
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.repository.ts
│   │   │   │   │   ├── auth.schemas.ts
│   │   │   │   │   ├── auth.events.ts
│   │   │   │   │   ├── index.ts      public interface of the module
│   │   │   │   │   ├── README.md     module doc: purpose, rules, endpoints
│   │   │   │   │   └── __tests__/
│   │   │   │   ├── members/  membership/  merchants/  catalog/  vouchers/  coupons/
│   │   │   │   ├── cart/  orders/  payments/ (providers/billplz.ts …)  affiliate/
│   │   │   │   ├── commissions/  wallet/  withdrawals/  content/  notifications/
│   │   │   │   └── reports/  settings/  admin/  audit/
│   │   │   ├── jobs/                 cron job handlers (one file per job)
│   │   │   └── routes.ts             mounts module routers under /api/v1
│   │   ├── scripts/cron.ts           CLI entry: node dist/scripts/cron.js <job>
│   │   └── tests/                    integration tests (test DB)
│   └── web/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       └── src/
│           ├── main.tsx, App.tsx
│           ├── app/                  router, providers, layouts (Public, Account, Merchant, Admin)
│           ├── components/ui/        design-system primitives (Button, Input, Card, Modal, Table, Badge…)
│           ├── components/common/    shared composites (PriceTag, MoneyRM, StatusBadge, QRCode, EmptyState)
│           ├── features/             one folder per module, mirroring backend
│           │   ├── auth/ { pages/, components/, api.ts, hooks.ts, schemas.ts }
│           │   ├── marketplace/  membership/  account/  referrals/  wallet/  withdrawals/
│           │   ├── merchant-portal/  redemption/  vouchers/  cart/  checkout/
│           │   └── admin/ { users/, approvals/, finance/, content/, reports/, settings/ }
│           ├── lib/                  api client, auth store, formatters (RM, dates), guards
│           └── styles/
├── packages/
│   └── shared/                       Zod schemas, enums, permission names, money utils shared by api & web
└── docs/
    ├── api/openapi.yaml
    ├── adr/                          architecture decision records
    ├── runbooks/                     deploy, rollback, backup-restore, cron setup, incident
    └── business-rules.md             confirmed answers to OPEN-xx, with dates
```

---

## 7. Database schema

MariaDB (InnoDB, `utf8mb4`). Prisma `provider = "mysql"`. All money columns are integer sen. All tables have `createdAt`, `updatedAt`; soft delete (`deletedAt`) where records must be kept.

### 7.1 Entity summary

**Identity & access**
- `User` (id, publicId, email unique, phone, passwordHash, status [ACTIVE/SUSPENDED/PENDING_VERIFICATION], emailVerifiedAt, lastLoginAt)
- `Role` (id, key, name, scope [PLATFORM/MERCHANT])
- `Permission` (id, key e.g. `withdrawal.approve`)
- `RolePermission` (roleId, permissionId)
- `UserRole` (userId, roleId) — platform roles
- `RefreshToken` (id, userId, tokenHash, expiresAt, revokedAt, userAgent, ip)
- `VerificationToken` (userId, type [EMAIL/RESET/INVITE], tokenHash, expiresAt, usedAt)

**Members**
- `MemberProfile` (userId PK/FK, fullName, icNumber encrypted?, dob, address fields, state, city, postcode)
- `Vehicle` (id, userId, make, model, year, plateNo)
- `BankAccount` (id, userId, bankName, accountName, accountNumber encrypted, verifiedAt, isDefault)

**Membership**
- `MembershipPlan` (id, name, priceSen, durationMonths, isActive) — keeps price history
- `Membership` (id, userId, planId, status, startAt, endAt, sourceOrderId, renewedFromId)
- `MembershipEvent` (membershipId, type [ACTIVATED/RENEWED/EXPIRED/CANCELLED/REFUNDED/EXTENDED_BY_ADMIN], actorId, note)

**Affiliate**
- `ReferralCode` (userId unique, code unique)
- `Referral` (userId unique, sponsorId, createdAt, changedById, changedReason) — direct sponsor
- `ReferralClosure` (ancestorId, descendantId, depth 1..3) — indexed for downline/upline queries
- `CommissionRule` (id, level 1..3, amountSen, triggerType [MEMBERSHIP_NEW/MEMBERSHIP_RENEWAL], effectiveFrom, effectiveTo)
- `Commission` (id, beneficiaryId, sourceUserId, sourceOrderId, level, amountSen, status [PENDING/AVAILABLE/REVERSED/VOID], availableAt, reversedAt, reason, ruleId) — unique (sourceOrderId, level)

**Wallet**
- `Wallet` (userId PK, availableSen, pendingSen, lockedSen, version) — cached balances, reconciled from ledger
- `WalletTransaction` (id, walletUserId, type [COMMISSION_PENDING/COMMISSION_RELEASED/COMMISSION_REVERSED/WITHDRAWAL_LOCK/WITHDRAWAL_RELEASE/WITHDRAWAL_PAID/ADJUSTMENT/PURCHASE], bucket, direction [CREDIT/DEBIT], amountSen, balanceAfterSen, refType, refId, actorId, note, idempotencyKey unique) — append-only

**Withdrawals**
- `Withdrawal` (id, userId, amountSen, feeSen, netSen, bankAccountSnapshot JSON, status [REQUESTED/APPROVED/REJECTED/PAID/FAILED/CANCELLED], reviewedById, reviewedAt, paidAt, bankReference, payoutBatchId, rejectReason)
- `PayoutBatch` (id, createdById, status, exportedAt, totalSen, count)

**Merchants**
- `Merchant` (id, publicId, slug, name, ssmNo, type, description, logoUrl, status, approvedById, approvedAt, rejectReason, contact fields)
- `MerchantOutlet` (id, merchantId, name, address, state, city, lat, lng, hours JSON)
- `MerchantMember` (id, merchantId, userId, role [OWNER/MANAGER/CASHIER], outletId nullable, status, invitedById) — staff accounts
- `MerchantDocument` (id, merchantId, type, fileUrl, uploadedAt)

**Catalog**
- `Category` (id, parentId, name, slug, sort, isActive)
- `Listing` (id, merchantId, categoryId, type [PRODUCT/SERVICE], slug, title, description, priceSen, memberPriceSen, stockQty nullable, status [DRAFT/PENDING/APPROVED/REJECTED/ARCHIVED], approvedById, publishedAt)
- `ListingImage` (id, listingId, url, sort)
- `ListingRevision` (id, listingId, data JSON, status) — pending edits to already-approved listings

**Vouchers & coupons**
- `VoucherCampaign` (id, merchantId, title, terms, benefitType [FREE_ITEM/FIXED/PERCENT], benefitValue, priceSen (0 = free claim), memberOnly, totalQty, perUserLimit, claimStartAt, claimEndAt, validDays or validUntil, status, approvedById)
- `VoucherCampaignOutlet` (campaignId, outletId)
- `Voucher` (id, campaignId, userId, code unique (random, non-sequential), status [ACTIVE/REDEEMED/EXPIRED/VOID], claimedAt, expiresAt, redeemedAt, redeemedByMerchantMemberId, redeemedOutletId, orderItemId nullable)
- `VoucherRedemption` (id, voucherId unique, merchantMemberId, outletId, at, ip, deviceInfo) — one row per redemption; unique constraint blocks doubles
- `Coupon` (id, code unique, type, value, minSpendSen, maxDiscountSen, usageLimit, perUserLimit, startAt, endAt, appliesTo JSON, ownerMerchantId nullable)
- `CouponUsage` (couponId, userId, orderId)

**Commerce**
- `Cart` (id, userId), `CartItem` (cartId, itemType [LISTING/VOUCHER/MEMBERSHIP], refId, qty, unitPriceSenSnapshot)
- `Order` (id, publicNo, userId, type [MEMBERSHIP/MARKETPLACE], status, subtotalSen, discountSen, taxSen, totalSen, couponId, paidAt, idempotencyKey)
- `OrderItem` (id, orderId, itemType, refId, merchantId, titleSnapshot, unitPriceSen, qty, lineTotalSen, fulfilmentStatus)
- `Payment` (id, orderId, provider, providerRef unique, amountSen, status [CREATED/PENDING/PAID/FAILED/EXPIRED/REFUNDED], rawCallback JSON, verifiedAt)
- `PaymentWebhookLog` (id, provider, payload, signatureValid, processedAt, error) — for debugging & replay safety
- `Refund` (id, paymentId, amountSen, reason, status, requestedById, approvedById)

**Content & notifications**
- `Banner` (id, title, imageDesktopUrl, imageMobileUrl, linkUrl, placement, audience, startAt, endAt, sort, isActive)
- `Announcement` (id, title, body, audience, publishAt, pinned, emailSent)
- `Page` (slug, title, body) — legal/about pages
- `EmailTemplate` (key, subject, bodyHtml, bodyText, updatedById)
- `EmailOutbox` (id, to, templateKey, payload JSON, status [QUEUED/SENT/FAILED], attempts, lastError, sendAfter, sentAt)
- `Notification` (id, userId, type, title, body, readAt)

**System**
- `Setting` (key, value JSON, updatedById) + `SettingHistory`
- `AuditLog` (id, actorId, action, entityType, entityId, before JSON, after JSON, ip, at) — append-only
- `JobRun` (id, job, startedAt, finishedAt, status, processed, error) — cron visibility and lock
- `ReportDailySummary` (date, metric, dimension, valueSen/valueCount) — precomputed for dashboards

### 7.2 Key relationships (text ER)
```
User 1─1 MemberProfile        User 1─* Membership ─* MembershipEvent
User 1─1 Referral (sponsor → User)    ReferralClosure(ancestor User, descendant User, depth)
Order 1─* Commission(level 1..3) *─1 User(beneficiary)
User 1─1 Wallet 1─* WalletTransaction
User 1─* Withdrawal *─1 PayoutBatch
Merchant 1─* MerchantOutlet   Merchant 1─* MerchantMember *─1 User
Merchant 1─* Listing 1─* ListingImage
Merchant 1─* VoucherCampaign 1─* Voucher 1─0..1 VoucherRedemption
Order 1─* OrderItem   Order 1─* Payment 1─* Refund
```

### 7.3 Integrity rules enforced in the DB
- Unique: `Commission(sourceOrderId, level)`, `VoucherRedemption(voucherId)`, `Payment(provider, providerRef)`, `WalletTransaction(idempotencyKey)`, `Voucher(code)`.
- Wallet balances non-negative (checked in service + CHECK constraint where MariaDB supports it).
- Foreign keys with `RESTRICT` on money tables (no cascading deletes of financial history).

---

## 8. API endpoints (REST, `/api/v1`)

Conventions: JSON; `Authorization: Bearer <access>`; errors as `{ error: { code, message, details } }`; pagination `?page=&pageSize=`; filters as query params; all money as integer sen plus formatted string where useful. Full spec will live in `docs/api/openapi.yaml`.

**Auth**
`POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/verify-email` · `POST /auth/resend-verification` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET /auth/me`

**Public catalog**
`GET /public/home` (banners, featured) · `GET /public/categories` · `GET /public/listings` · `GET /public/listings/:slug` · `GET /public/merchants` · `GET /public/merchants/:slug` · `GET /public/vouchers` · `GET /public/vouchers/:id` · `GET /public/pages/:slug` · `GET /public/referral/:code` (validate code, show sponsor display name — OPEN-14)

**Member (self)**
`GET/PATCH /me/profile` · `GET/POST/PATCH/DELETE /me/vehicles` · `GET/POST/PATCH /me/bank-accounts` · `GET /me/membership` · `GET /me/membership/history` · `POST /me/membership/purchase` (creates order) · `POST /me/membership/renew`
`GET /me/referrals/summary` · `GET /me/referrals?level=1|2|3` · `GET /me/referral-link`
`GET /me/commissions` · `GET /me/wallet` · `GET /me/wallet/transactions` · `GET /me/wallet/transactions.csv`
`POST /me/withdrawals` (Idempotency-Key header) · `GET /me/withdrawals` · `POST /me/withdrawals/:id/cancel`
`POST /me/vouchers/claim` · `GET /me/vouchers` · `GET /me/vouchers/:id` (with QR payload)
`GET /me/orders` · `GET /me/orders/:id` · `GET /me/notifications` · `POST /me/notifications/:id/read`

**Cart & checkout**
`GET /cart` · `POST /cart/items` · `PATCH /cart/items/:id` · `DELETE /cart/items/:id` · `POST /cart/coupon` · `DELETE /cart/coupon` · `POST /checkout` (→ order + payment URL) · `GET /orders/:publicNo/status`

**Payments**
`POST /payments/webhook/:provider` (public, signature-verified, idempotent) · `GET /payments/return/:provider` (browser redirect → shows status only)

**Merchant application**
`POST /merchant-applications` · `GET /merchant-applications/mine` · `PATCH /merchant-applications/:id` · `POST /merchant-applications/:id/submit` · `POST /merchant-applications/:id/documents`

**Merchant portal** (`/merchant/:merchantId/...`, permission-checked per staff role)
`GET /dashboard` · `GET/PATCH /profile` · `GET/POST/PATCH /outlets` · `GET /staff` · `POST /staff/invite` · `PATCH /staff/:id` · `DELETE /staff/:id`
`GET/POST /listings` · `GET/PATCH /listings/:id` · `POST /listings/:id/submit` · `POST /listings/:id/archive` · `POST /listings/:id/images`
`GET/POST /voucher-campaigns` · `GET/PATCH /voucher-campaigns/:id` · `POST /voucher-campaigns/:id/submit`
`POST /redemptions/lookup` (code → preview, no state change) · `POST /redemptions` (confirm redeem, transactional) · `GET /redemptions`
`GET /orders` · `GET /reports/*`
`POST /staff-invites/:token/accept` (public w/ token)

**Admin** (`/admin/...`, each route requires a named permission)
Users: `GET /users` · `GET /users/:id` · `PATCH /users/:id` · `POST /users/:id/suspend` · `POST /users/:id/unsuspend` · `GET /users/:id/referral-tree` · `POST /users/:id/change-sponsor`
Memberships: `GET /memberships` · `POST /memberships/:id/extend` · `POST /memberships/:id/cancel` · `GET/POST/PATCH /membership-plans`
Merchants: `GET /merchants` · `GET /merchants/:id` · `POST /merchants/:id/suspend`
Approvals: `GET /approvals?type=` · `POST /approvals/:type/:id/approve` · `POST /approvals/:type/:id/reject` · `POST /approvals/:type/:id/request-changes`
Catalog: `CRUD /categories` · `CRUD /coupons` · `GET /voucher-campaigns` · `GET /vouchers` · `POST /vouchers/:id/void`
Commerce: `GET /orders` · `GET /orders/:id` · `GET /payments` · `POST /payments/:id/requery` · `POST /refunds` · `POST /refunds/:id/approve`
Affiliate/finance: `GET /commissions` · `POST /commissions/:id/reverse` · `GET /commission-rules` · `POST /commission-rules` (new version) · `GET /wallets/:userId` · `GET /wallets/:userId/transactions` · `POST /wallets/:userId/adjustments`
Withdrawals: `GET /withdrawals` · `POST /withdrawals/:id/approve` · `POST /withdrawals/:id/reject` · `POST /withdrawals/:id/mark-paid` · `POST /payout-batches` · `GET /payout-batches/:id/export.csv`
Content: `CRUD /banners` · `CRUD /announcements` · `CRUD /pages` · `GET/PUT /email-templates/:key` · `GET /email-log` · `POST /email-log/:id/resend`
Reports: `GET /reports/{membership|affiliate|finance|merchants|vouchers}` (+ `.csv`)
System: `GET/PUT /settings/:group` · `GET /audit-log` · `CRUD /admin-staff` · `CRUD /roles` · `GET /system/jobs` · `GET /system/health`

**Internal cron** (only if Hostinger cron must call over HTTP rather than run a CLI script)
`POST /internal/cron/:job` — secret header + IP allow-list, rate-limited.

---

## 9. Core workflows

All money/state changes below run inside **one database transaction**; where two requests could race, the relevant rows are locked with `SELECT … FOR UPDATE`.

### 9.1 Registration with referral
1. Visitor opens `/register?ref=ABC123` → code saved in a first-party cookie/localStorage for N days (OPEN-15: attribution window, last-click vs first-click).
2. Submit form → validate code → create `User`, `MemberProfile`, `ReferralCode`, `Referral(sponsorId)`, `ReferralClosure` rows (self depth 0 + sponsor's ancestors up to depth 3).
3. No referral code → sponsor = none, or default company account? (OPEN-12)
4. Send verification email via outbox.

### 9.2 Membership purchase → activation → commissions
```
Member clicks "Join RM399"
 → POST /me/membership/purchase  ⇒ Order(type=MEMBERSHIP, PENDING_PAYMENT) + Payment(CREATED)
 → redirect to gateway
Gateway → POST /payments/webhook/:provider
 → verify signature, look up Payment by providerRef, check amount & currency match
 → if already PAID: return 200 (idempotent), stop
 → BEGIN TRANSACTION
     Payment = PAID; Order = PAID
     Membership: create ACTIVE (start=now, end=+12m) or extend existing (renewal rule OPEN-02)
     MembershipEvent(ACTIVATED|RENEWED)
     For level in 1..3: find ancestor at depth=level
        if ancestor exists AND eligible (rule OPEN-05):
           Commission(level, amount from active CommissionRule, status=PENDING, availableAt = now + hold OPEN-06)
           WalletTransaction(COMMISSION_PENDING, CREDIT, pending bucket)
           Wallet.pendingSen += amount
        else: record skipped/roll-up per OPEN-05
     Enqueue emails: receipt, membership activated, "you earned a commission" ×N
   COMMIT
Browser return URL only displays status by polling GET /orders/:no/status.
Cron reconcile-payments: requery gateway for PENDING payments older than X minutes.
```
Whether renewals also pay commissions → OPEN-04 (`CommissionRule.triggerType` supports both).

### 9.3 Commission release (cron: release-pending-commissions)
For each `Commission` with `status=PENDING AND availableAt <= now` (and source order still PAID, not refunded): in a transaction set `AVAILABLE`, move amount pending → available with two ledger rows. If the hold period is 0 (OPEN-06), this happens immediately at activation.

### 9.4 Refund / chargeback → clawback (pending OPEN-09)
On membership refund approval: Order = REFUNDED, Membership = REFUNDED. For each related Commission:
- if PENDING → REVERSED, debit pending.
- if AVAILABLE → REVERSED, debit available (may go negative? — needs rule; options: allow negative balance offset against future earnings, or company absorbs).
- if already WITHDRAWN → recovery rule required.
All audit-logged.

### 9.5 Withdrawal
```
Member: POST /me/withdrawals {amountSen} + Idempotency-Key
 → check membership active? (OPEN-30), bank verified, amount ≥ min, ≤ available, frequency limit
 → TX: lock Wallet row; available -= amount; locked += amount; ledger WITHDRAWAL_LOCK; Withdrawal(REQUESTED, fee & net per OPEN-30)
Finance: approve → status APPROVED (2nd approver if OPEN-23)
        reject  → TX: locked -= amount; available += amount; ledger WITHDRAWAL_RELEASE; REJECTED + reason
Finance: add to PayoutBatch → export CSV → pay via bank → mark-paid with bank ref
        → TX: locked -= amount; ledger WITHDRAWAL_PAID; status PAID; email member
Failed transfer → FAILED → funds returned to available.
```

### 9.6 Voucher claim and redemption
```
Claim: POST /me/vouchers/claim {campaignId}
 → TX: lock campaign row; check approved, within claim window, qty remaining, per-user limit,
       memberOnly ⇒ active membership; if priceSen>0 ⇒ goes through cart/checkout instead
 → Voucher(code = random 10–12 chars, non-sequential; QR encodes a signed token, not just the code)
Redeem (merchant staff):
 1. POST /merchant/:id/redemptions/lookup {code|qrToken} → shows voucher, member name (masked), terms. No change.
 2. Staff taps "Confirm redeem" → POST /merchant/:id/redemptions
    → TX: lock Voucher row; check status=ACTIVE, not expired, campaign.merchantId matches staff's merchant,
          outlet allowed, (membership active if OPEN-25)
    → Voucher=REDEEMED; VoucherRedemption row (unique voucherId) → member notified
 Undo redemption: admin-only within X hours? (OPEN-28)
Cron expire-vouchers: ACTIVE vouchers past expiresAt → EXPIRED.
```

### 9.7 Marketplace checkout (if online sales confirmed — OPEN-11)
Cart → re-price server-side (member price only if membership active at checkout time) → apply coupon (validate limits under lock) → SST (OPEN-35) → Order + Payment → webhook as 9.2 → decrement stock under lock → OrderItems fulfilment per merchant → paid vouchers in cart become Voucher instances.
Who receives the money for merchant items and how merchants are settled (platform collects and pays merchants minus commission? or listing-only?) → OPEN-20. This is the biggest scope question after legal.

### 9.8 Renewal reminders & expiry (cron daily)
- `renewal-reminders`: memberships with endAt in {30,14,7,1} days (configurable, OPEN-03) and no reminder sent for that offset → enqueue email.
- `expire-memberships`: ACTIVE with endAt < now → GRACE or EXPIRED (OPEN-03) → event + email.

---

## 10. UI/UX strategy

**Brand feel:** premium, modern automotive. Proposed (needs Andy's brand assets — OPEN-38): dark charcoal/graphite base with one strong accent (e.g. racing red or electric blue), clean neutral light theme for dashboards, high-quality car imagery, generous spacing, bold headline type (e.g. a geometric sans such as "Inter" + a display face like "Rajdhani" or "Barlow Condensed" for headings).

**Principles**
- **Mobile first.** Most members and all cashiers will use phones. Merchant `/merchant/redeem` is designed for one-hand use: big scan button, big confirm, clear success/fail screens with colour + icon + sound/vibration.
- **Design system first.** Build Tailwind tokens (colours, type scale, radius, shadows, spacing) and `components/ui` primitives in Milestone 1; every page reuses them.
- **Money is always clear:** `RM 1,234.50` format via one formatter; status badges (Pending, Available, Paid) with consistent colours; explain "pending" with a tooltip.
- **Trust signals** on membership & affiliate pages: clear T&C, refund policy, no income guarantees (legal).
- **Dashboards:** sidebar on desktop, bottom nav or hamburger on mobile; overview cards → detail tables; tables collapse into cards on mobile; filters + CSV export.
- **Accessibility:** WCAG 2.1 AA contrast, keyboard navigable, form labels and errors, focus states, `prefers-reduced-motion`.
- **Performance:** route-based code splitting (public, account, merchant, admin bundles), image sizes + lazy loading (WebP), skeleton loaders; target LCP < 2.5s on 4G.
- **States designed for every screen:** loading, empty, error, success, no permission.
- **Deliverables before build:** low-fi wireframes for key flows (home, listing, join membership, dashboard overview, wallet, withdraw, redeem, approval queue) for Saife/Andy sign-off, then high-fi for home + dashboard to lock the look.

---

## 11. Development phases, milestones and timeline

Assumes **one senior full-stack developer (with AI assistance)**, a responsive client (approvals within 2–3 working days), and open questions answered before each phase starts. Estimates are working weeks; **realistic range given**, not a promise. A second developer shortens it by roughly 30–35%, not 50%.

| Phase | Milestone | Modules | Est. weeks |
|---|---|---|---|
| 0 | **Foundations & spikes** — repo, CI, environments, Hostinger Node.js + Prisma + MariaDB deploy spike, cron spike, gateway sandbox spike, design tokens, wireframes | M1 (partial), M23 base, M24 base | 2–3 |
| 1 | **Identity & admin shell** — auth, JWT/refresh, RBAC, admin staff/roles, settings, audit log, email outbox + templates | M1, M3 (basic), M17 (shell), M22 (infra), M23 | 2–3 |
| 2 | **Membership & payments** — gateway adapter, orders/payments for membership, activation, member dashboard v1, renewals, reminders, expiry | M4, M5, M16, M18 | 3–4 |
| 3 | **Affiliate, commissions, wallet** — referral codes, closure tree, commission rules, ledger, release cron, clawback, member referral/wallet pages | M11, M12, M13 | 3–4 |
| 4 | **Withdrawals & payouts** — requests, finance queue, payout batches CSV, notifications | M14 | 1.5–2 |
| 5 | **Merchants & catalog** — application, approvals, merchant portal, staff, outlets, listings, categories, public marketplace | M2, M6, M7, M8, M19 | 4–5 |
| 6 | **Vouchers, coupons, redemption** — campaigns, claim, QR, scan/redeem, coupons | M9, M10 | 2.5–3 |
| 7 | **Cart & marketplace checkout** — only if OPEN-11/20 say online sales; merchant settlement | M15 | 2–4 |
| 8 | **Content, reports, polish** — banners, announcements, reports, summary cron, SEO, performance, accessibility pass | M20, M21 | 2–3 |
| 9 | **Hardening & launch** — security review, load test, UAT with Andy, data migration (if any), go-live runbook, training docs | M24 | 2 |
| | **Total** | | **~24–33 weeks (≈6–8 months)** |

Each phase ends with: demo on staging, tests green, docs updated, Saife sign-off before next phase. A reduced **MVP launch** is possible after Phase 4 (membership + affiliate + wallet + withdrawals + admin) at **~13–18 weeks**, with marketplace and vouchers following — but only after legal review (§18 R1), because launching the affiliate first makes the scheme look recruitment-driven.

---

## 12. Missing business requirements (open questions)

**Payments & money**
- **OPEN-01** Which payment gateway? (Billplz, ToyyibPay, iPay88, Stripe MY, SenangPay, Razer, HitPay.) Need: FPX + cards? e-wallets (TNG, GrabPay, Boost)? recurring billing? refund API? Who holds the merchant account (Andy's company SSM)?
- **OPEN-35** Is Andy's company SST-registered? Is RM399 inclusive or exclusive of tax? Tax on marketplace items?
- **OPEN-39** e-Invoicing (LHDN MyInvois) obligations for Andy's company and timeline?
- **OPEN-29** Can wallet balance be spent on renewals/products, or only withdrawn?
- **OPEN-30** Withdrawal rules: minimum amount, fee (fixed/%), max per period, processing days, must member be active to withdraw, KYC needed?
- **OPEN-31** Which bank for payouts and what bulk-payment file format? Or payouts via gateway/DuitNow API later?
- **OPEN-32** Refund policy for membership (cooling-off period? pro-rata? none?) and for marketplace items.
- **OPEN-23** Do money actions (withdrawal approval, manual adjustments, refunds) need two-person approval?

**Membership**
- **OPEN-02** Exact term: 12 months from payment? Early renewal stacks on current end date? Late renewal starts from payment date?
- **OPEN-03** Grace period after expiry? Reminder schedule (days before/after)?
- **OPEN-10** Auto-renew with saved card, or manual renewal only?
- **OPEN-42** Is renewal price also RM399? Any promo/early-bird pricing?
- **OPEN-43** What exactly are the member benefits (shown on membership page)?

**Affiliate & commission**
- **OPEN-04** Are commissions paid on renewals, or only on first-time membership? Same amounts?
- **OPEN-05** If an upline is not currently an active member: skip that level, hold until they renew, or pass up / to company?
- **OPEN-06** Holding period before commission becomes withdrawable (e.g. 7/14/30 days)?
- **OPEN-09** Clawback rules on refund/chargeback, including when commission was already withdrawn.
- **OPEN-12** Can a non-paying registered user refer and earn? Members without a sponsor — attach to a company root account?
- **OPEN-13** Can sponsor be changed after registration? By whom, until when?
- **OPEN-14** What can a member see about their downline (full name, masked name, phone)? Can they see level 2/3 individuals or only counts? (PDPA)
- **OPEN-15** Referral attribution window and rule (cookie days; first vs last referrer).
- **OPEN-44** Do marketplace purchases also generate commissions, or only memberships?
- **OPEN-45** Any rank, bonus, target or cap rules? (None assumed.)

**Merchants & marketplace**
- **OPEN-11** Are products/services *sold and paid online* through the platform, or only *listed* (customer pays at the merchant)? This decides whether M15 is needed in v1.
- **OPEN-20** If sold online: does the platform collect payment and settle to merchants? Platform commission %? Settlement schedule? Merchant bank details & payout flow?
- **OPEN-16** Can a merchant owner/staff also be a member/affiliate?
- **OPEN-17** Exact permissions for Manager vs Cashier.
- **OPEN-18** Do merchants pay a fee/subscription to join?
- **OPEN-19** Multiple outlets per merchant in v1?
- **OPEN-21** Which listing edits need re-approval?
- **OPEN-22** Physical product fulfilment: shipping (who ships, rates) or pickup only?
- **OPEN-46** Required merchant documents (SSM, IC, bank statement)?

**Vouchers & coupons**
- **OPEN-24** Are vouchers free for members, paid, or both?
- **OPEN-25** Must membership be active at redemption time, or only at claim?
- **OPEN-26** Can merchants create their own checkout coupons, or admin only? Who funds the discount?
- **OPEN-27** Single-use only, or stored-value/partial redemption?
- **OPEN-28** Can a redemption be reversed (mistake at counter)? By whom, within what time?

**Accounts, content, compliance, ops**
- **OPEN-07** Phone OTP verification required? (SMS cost + provider.)
- **OPEN-08** Is IC number required? KYC before withdrawal?
- **OPEN-33** Legal review: has Andy obtained advice/licence under the Direct Sales and Anti-Pyramid Scheme Act 1993 (KPDN)? Is a direct-sales licence required?
- **OPEN-34** Privacy notice & PDPA: who is data controller, data retention period, cross-border data (email/payment providers)?
- **OPEN-36** Email: Hostinger SMTP acceptable, or a transactional provider (Brevo, Mailgun, Amazon SES, Postmark)? Expected volume?
- **OPEN-37** File uploads: store on Hostinger disk, or object storage (Cloudflare R2/S3)? Expected image volume?
- **OPEN-38** Brand: logo, colours, fonts, domain name, photography?
- **OPEN-40** Languages: English only, or also Bahasa Malaysia / Chinese?
- **OPEN-41** TypeScript OK for the codebase? (Recommended.)
- **OPEN-47** Any existing members/data to migrate?
- **OPEN-48** Expected scale at launch and year 1 (members, merchants, peak concurrent users)?
- **OPEN-49** Who owns the GitHub repo, Hostinger account, gateway account and domain? Who gets admin access?
- **OPEN-50** Budget/deadline constraints that should change scope or phase order?

---

## 13. Security

- **Auth:** bcrypt/argon2 password hashing; short-lived JWT access token (≈15 min) held in memory; refresh token in `httpOnly`, `Secure`, `SameSite=Strict` cookie, rotated on each use, stored hashed, revocable; logout revokes. Login rate-limit + lockout; optional 2FA (TOTP) **mandatory for admin and finance roles** (recommend).
- **RBAC:** permission-based middleware `requirePermission('withdrawal.approve')`; merchant routes additionally check the user is staff of *that* merchant with sufficient role (prevents cross-merchant access / IDOR). Ownership checks on every `/me` resource.
- **Input:** Zod validation on every request; Prisma parameterised queries (no raw SQL with string concatenation); output encoding in React; sanitise any admin-entered HTML (announcements, templates) with an allow-list sanitiser.
- **Transport & headers:** HTTPS only, HSTS, Helmet (CSP, frame-ancestors, no-sniff), strict CORS (own domain only).
- **CSRF:** refresh endpoint protected by SameSite cookie + custom header check.
- **Money safety:** transactions + row locks; idempotency keys; unique constraints (§7.3); amounts always recomputed server-side; webhook signature + amount verification; ledger append-only; daily reconciliation report (wallet cached balance vs ledger sum) with alert on mismatch.
- **Files:** type/size limits, re-encode images, random filenames, stored outside executable paths, no SVG uploads from users.
- **Secrets:** env vars only (Hostinger panel), never in Git; `.env.example` documents keys; rotate on staff change.
- **Sensitive data:** encrypt bank account numbers and IC numbers at application level (AES-256-GCM, key in env); mask in UI and logs; no card data ever touches our server (gateway-hosted page).
- **Audit:** all admin actions and all money state changes written to `AuditLog`.
- **Abuse:** rate limits on auth, referral lookup, voucher lookup/redeem, withdrawal; detect self-referral patterns (same IP/device/bank across accounts) as flags for admin review.
- **Compliance:** PDPA 2010 (as amended 2024) — consent, privacy notice, access/correction/deletion requests, breach notification process.
- **Dependency hygiene:** `npm audit` in CI, Dependabot on the GitHub repo, lockfile committed.

---

## 14. Testing strategy

| Layer | Tool (proposed) | What |
|---|---|---|
| Unit | Vitest | services, money utils, commission calculation, validation schemas |
| Integration | Vitest + Supertest against a real MariaDB test DB (Docker locally / CI service) | each endpoint, permissions, transactions |
| Concurrency | scripted parallel requests | double redemption, double withdrawal, duplicate webhook, coupon limit races |
| Frontend | Vitest + React Testing Library | components, forms, guards |
| End-to-end | Playwright | critical journeys: register w/ referral → pay (gateway sandbox) → commission appears; withdraw → admin approve → paid; merchant apply → approve → voucher → member claim → staff redeem |
| Accessibility | axe (Playwright) | key pages |
| Performance | k6 or autocannon (light) | marketplace browse, login, webhook burst — within Hostinger limits |
| Manual UAT | Checklist per phase | Andy/Saife sign-off on staging |

**Rules:** every bug fix gets a regression test; money workflows require ≥90% branch coverage in their services; CI must pass before merge to `main`.

---

## 15. Deployment, environments, backups

**Branches & environments**
- `main` = production; `staging` = staging; feature branches `feat/<module>-<short>` → PR → review → CI → merge to `staging` → UAT → PR `staging → main`.
- Environments: **Local** (Docker MariaDB), **Staging** (separate Hostinger Node.js app + separate DB + subdomain `staging.<domain>`, gateway sandbox, emails to test inbox only), **Production**.
- Hostinger Business plan app/database limits need checking to confirm staging fits on the same plan (§16).

**Deploy procedure (per release)**
1. CI green on the release PR (lint, typecheck, tests, build).
2. Backup production DB (manual export + Hostinger automatic backup confirmed).
3. Deploy: Hostinger Node.js app pulls from GitHub branch (or upload build) → `npm ci --omit=dev` → `prisma migrate deploy` → restart app.
4. Smoke test: `/api/v1/system/health`, login, a test payment in sandbox on staging.
5. Tag release `vX.Y.Z`, changelog entry.

**Migrations:** Prisma migrations only (no manual schema changes on servers); **expand-and-contract** pattern for breaking changes (add new column → backfill → switch code → drop old in a later release) so rollback is always possible.

**Rollback:** redeploy previous tag; migrations are backward-compatible by rule, so DB is not rolled back except from backup in a true emergency (runbook).

**Backups:** Hostinger automated backups (confirm frequency/retention on Business plan) **plus** our own daily logical dump via cron → stored off-host (e.g. encrypted to object storage) with 30-day retention; monthly restore test on staging. Uploaded files backed up too.

**Monitoring:** health endpoint + external uptime monitor (e.g. UptimeRobot / Better Stack free tier); error tracking (Sentry free tier — confirm OK); `JobRun` table shows cron success/failure in admin; alert email on failed jobs or ledger mismatch.

---

## 16. Hostinger Business Web Hosting: constraints and how we design around them

**Honest status:** Hostinger has added Node.js web-app support to its Business (and Cloud) web hosting plans, with deploy from GitHub or upload in hPanel. It is a **managed shared-hosting** environment, not a VPS. The details below must be **verified in Phase 0 on Andy's actual account** before we commit; plan limits change.

| Constraint (to verify) | Impact | Design response |
|---|---|---|
| Node.js app support limited to supported Node versions and a framework/preset detection; limited number of Node apps per plan | Our monorepo layout and build commands must match what hPanel accepts | Phase 0 spike: deploy a hello-world Express + Vite build + Prisma query. Adjust layout (e.g. deploy a pre-built `dist/` bundle) if needed |
| No root/sudo; limited or no SSH on some setups | Can't install system packages, Redis, Docker, PM2 daemons | Pure-Node dependencies only; no native modules that need compiling where avoidable |
| **No persistent background workers / queues** | No BullMQ, no long-running schedulers, no websockets reliance | DB-backed **outbox + cron** pattern; all async work is idempotent and resumable; webhooks processed synchronously |
| App process may be restarted/idled by the platform | In-memory state is lost | Stateless API; no in-memory sessions, caches or timers holding important state |
| **Cron jobs** via hPanel (minimum interval and command format to confirm) | Scheduled tasks granularity | `node dist/scripts/cron.js <job>` per job, or one "tick" every 5–15 min that runs due jobs; `JobRun` row lock prevents overlap |
| CPU / RAM / process / entry-process limits on shared plan | Heavy reports or bursts can be throttled | Precomputed report summaries, pagination everywhere, indexes, gzip, CDN for static assets/images |
| **Prisma on shared hosting:** Prisma's engine binaries and `prisma migrate` need to run on the host's OS/Node | Possible engine/OpenSSL mismatch, migrate permissions | Spike in Phase 0; use correct `binaryTargets` or Prisma's newer engine-less/driver-adapter mode (`@prisma/adapter-mariadb`); if migrate cannot run on host, run `migrate deploy` from CI against the DB via remote MySQL access |
| MariaDB version, max connections, remote access | Connection pool exhaustion; CI access to DB | Small Prisma pool (e.g. 5); enable remote MySQL only for CI IPs if needed |
| Disk space & inodes | Image uploads can fill quota | Image compression; consider object storage (OPEN-37) |
| Outbound SMTP limits on Hostinger email | Reminder blasts may be throttled | Outbox sender batches with rate limit; transactional email provider if volume is high (OPEN-36) |
| Webhooks must reach the app over HTTPS | Gateway callbacks | Free SSL on domain; webhook route excluded from auth but signature-verified |

**If the spike fails** (e.g. Prisma or Node app hosting proves unreliable), fallback options for Saife to decide: Hostinger **VPS** (KVM 1/2, full control, PM2, ~similar cost range), or Hostinger **Cloud** hosting. This would be raised before Phase 1, not discovered at launch.

---

## 17. Dependencies (planned — not installed)

**Backend:** express, @prisma/client + prisma (+ @prisma/adapter-mariadb if using driver adapter), zod, jsonwebtoken (or jose), argon2 or bcrypt (bcryptjs if native build is a problem on host), helmet, cors, express-rate-limit, cookie-parser, multer (uploads), sharp (image processing — native; fallback if host can't build), nodemailer, pino (logging), qrcode, dayjs/date-fns-tz, csv-stringify, sanitize-html, uuid/nanoid.
**Frontend:** react, react-dom, react-router, @tanstack/react-query, react-hook-form + @hookform/resolvers, zod, tailwindcss, headless UI primitives (Radix UI or Headless UI), lucide-react (icons), recharts (charts), a QR scanner library (e.g. html5-qrcode / @zxing/browser), qrcode.react.
**Dev:** typescript, vite, vitest, supertest, @testing-library/react, playwright, eslint, prettier, husky + lint-staged, @axe-core/playwright, openapi tooling.
**External services:** payment gateway (OPEN-01), email provider (OPEN-36), object storage (OPEN-37, optional), Sentry/uptime monitor (optional), SMS OTP provider (OPEN-07, optional).

Exact versions are pinned at install time in Phase 0 after Saife approves.

---

## 18. Risks and mitigations

| # | Risk | Likelihood / Impact | Mitigation |
|---|---|---|---|
| **R1** | **Legal: 3-level commissions funded mainly by membership fees could be treated as a pyramid scheme** under Malaysia's Direct Sales and Anti-Pyramid Scheme Act 1993 (amended), enforced by KPDN. Paying RM199 of every RM399 to recruiters is a red flag if members' main benefit is recruiting rather than real products/services | Medium–High / **Critical** | **Andy obtains Malaysian legal advice before launch** (OPEN-33). Ensure real member value (vouchers, discounts), clear T&C, no income claims, refund/cooling-off policy. The system keeps commission rules configurable so the model can be changed without code rewrites |
| R2 | Hostinger shared hosting cannot run Prisma/Node reliably or hits resource limits | Medium / High | Phase 0 spike before any feature work; VPS fallback |
| R3 | Payment gateway onboarding delays (KYB of Andy's company can take 1–3 weeks) | High / Medium | Start gateway application now; build against sandbox |
| R4 | Wallet/commission bugs cause financial loss or disputes | Medium / Critical | Ledger design, transactions, unique constraints, concurrency tests, reconciliation report, maker-checker on payouts |
| R5 | Fraud: fake accounts/self-referral to harvest commissions; refund-after-commission | Medium / High | Holding period, clawback, KYC on withdrawal, duplicate-detection flags |
| R6 | Scope creep / unanswered open questions block phases | High / Medium | Phase gates; each phase starts only with its questions answered; change requests re-estimated |
| R7 | SPA SEO for public marketplace is weaker than server-rendered pages | Medium / Medium | Pre-render static public pages at build, server-injected meta tags for listing/merchant URLs, sitemap.xml; consider SSR later |
| R8 | Email deliverability (reminders landing in spam) | Medium / Medium | SPF/DKIM/DMARC on domain, transactional provider |
| R9 | PDPA non-compliance (downline data exposure, IC/bank data) | Medium / High | Masking, encryption, minimal data in downline views, privacy notice |
| R10 | Single developer bus factor | Medium / High | AGENTS.md, module READMEs, ADRs, runbooks, tests as documentation |
| R11 | AI-generated code (Codex) introduces inconsistent patterns or breaks other modules | Medium / Medium | AGENTS.md rules, CI gates, module boundaries, required tests, human review of every PR |

---

## 19. Maintenance plan

- **Monthly:** dependency updates (security first), restore-test a backup on staging, review error tracker and job failures, ledger reconciliation review.
- **Quarterly:** access review (admin and merchant staff), secret rotation, performance review, Hostinger plan resource check.
- **Per change:** ADR for any architectural change; update module README + OpenAPI; changelog.
- **Support model:** bug severity levels (P1 money/payment/login down → same day; P2 → 3 days; P3 → next release). SLA to be agreed with Andy.
- **Documentation kept current:** `README.md` (setup), `AGENTS.md` (AI/dev rules), `docs/runbooks/*`, `docs/business-rules.md` (every answered OPEN-xx with date and who confirmed).

---

## 20. Approval checklist (for Saife / Andy)

Please confirm or comment:

1. ☐ Roles in §2 are correct and complete.
2. ☐ Sitemap/dashboards in §4 match expectations.
3. ☐ Architecture (§5) and TypeScript recommendation (OPEN-41).
4. ☐ Phase order and timeline (§11), and whether to target the reduced MVP first.
5. ☐ Answers to the open questions in §12 — at minimum OPEN-01, 02, 04, 05, 06, 09, 11, 20, 30, 33 before Phase 2.
6. ☐ Legal review commitment for R1 (OPEN-33).
7. ☐ Approval to run the **Phase 0 Hostinger spike** (this would be the first time we install packages and deploy a test app — needs explicit go-ahead).
8. ☐ GitHub private repo created and shared, and Hostinger access arranged (OPEN-49).
