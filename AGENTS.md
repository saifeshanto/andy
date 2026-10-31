# AGENTS.md — Rules for AI coding agents (Codex, Claude, etc.) and developers

This file is the contract for anyone, human or AI, changing this repository. Read it fully before every task. If a rule here conflicts with a task prompt, **stop and ask** rather than guessing.

Project: Andy Automotive Marketplace, Membership, Merchant & Affiliate Platform
Plan of record: `PROJECT_PLAN.md`. Confirmed business rules: `docs/business-rules.md`.

---

## 1. Golden rules

1. **Never invent business rules.** If a behaviour depends on an `OPEN-xx` question in `PROJECT_PLAN.md §12` that is not answered in `docs/business-rules.md`, do not pick a value. Implement it as a configurable setting with no default *or* stop and ask. Write `// TODO(OPEN-xx): awaiting confirmation` where needed.
2. **One module per task.** Work only inside the module the task names, plus `core/` or `packages/shared/` when strictly necessary. Do not refactor unrelated modules.
3. **Do not break existing behaviour.** All existing tests must pass. Do not delete or weaken a test to make it pass.
4. **Money is integer sen.** Never use floats, `Number` division, or `toFixed` for money logic. Use `packages/shared/money`. Currency is always MYR.
5. **Every money or state change runs in a DB transaction**, with row locks where concurrent requests could conflict. See §6.
6. **No secrets in code or Git.** Use env vars; add new keys to `.env.example` with a placeholder and a comment.
7. **No deploys, no production DB access, no package installs, and no changes to CI/hosting config** unless the task explicitly says so and the human approved it.
8. **Hostinger-compatible only.** No persistent workers, queues (Redis/BullMQ), websockets-as-requirement, Docker-in-production, or system packages. Async work = DB outbox table + cron job. See §8.
9. **Small, reviewable PRs.** One logical change per PR, with tests and docs.

---

## 2. Stack

- **Frontend:** React + Vite + Tailwind CSS, React Router, TanStack Query, React Hook Form + Zod. (`apps/web`)
- **Backend:** Node.js + Express, REST under `/api/v1`. (`apps/api`)
- **DB:** MariaDB via Prisma (`provider = "mysql"`).
- **Auth:** JWT access token (short-lived, in memory) + rotating refresh token in httpOnly cookie. Permission-based RBAC.
- **Language:** TypeScript (pending OPEN-41 confirmation; if JS is chosen, use JSDoc types and `// @ts-check`).
- **Shared code:** `packages/shared` (Zod schemas, enums, permission keys, money utils).
- **Tests:** Vitest, Supertest, React Testing Library, Playwright.

Do not add a new dependency without stating in the PR: why, size, licence, whether it has native bindings (native builds may fail on Hostinger), and the alternative considered.

---

## 3. Repository layout

```
apps/api/src/core/            shared kernel: db, auth, rbac, errors, logger, events, money, mailer, storage
apps/api/src/modules/<name>/  one folder per backend module
apps/api/src/jobs/            one file per cron job
apps/api/scripts/cron.ts      cron CLI entry
apps/api/prisma/              schema.prisma, migrations/, seed/
apps/web/src/components/ui/   design-system primitives only
apps/web/src/components/common/ shared composites
apps/web/src/features/<name>/ one folder per frontend feature
packages/shared/              code used by both api and web
docs/                         openapi.yaml, adr/, runbooks/, business-rules.md
```

Backend module names: `auth, members, membership, merchants, catalog, vouchers, coupons, cart, orders, payments, affiliate, commissions, wallet, withdrawals, content, notifications, reports, settings, admin, audit`.

---

## 4. Backend module contract

Each `apps/api/src/modules/<name>/` contains:

| File | Responsibility |
|---|---|
| `<name>.routes.ts` | Express router; attaches auth, permission, validation middleware; no logic |
| `<name>.controller.ts` | Parse request → call service → shape response. No Prisma calls |
| `<name>.service.ts` | Business logic. Accepts an optional transaction client `tx` |
| `<name>.repository.ts` | All Prisma queries for this module's tables |
| `<name>.schemas.ts` | Zod request/response schemas (or re-export from `packages/shared`) |
| `<name>.events.ts` | Events this module emits/handles |
| `index.ts` | **Public interface.** Other modules may import only from here |
| `README.md` | Purpose, owned tables, rules, endpoints, events, open questions |
| `__tests__/` | Unit + integration tests |

**Boundaries**
- A module owns its tables. Other modules must not query them directly; call the owner's `index.ts` service or react to its events.
- Cross-module side effects (e.g. payment succeeded → membership activates → commissions created) go through the in-process event bus **inside the same DB transaction** when they must be atomic, passing `tx` along.
- No circular imports between modules. If you need one, the design is wrong; raise it.

**Conventions**
- Routes: plural nouns, kebab-case, `/api/v1/<area>/<resource>`. Actions as sub-resources: `POST /withdrawals/:id/approve`.
- Errors: throw `AppError(code, httpStatus, message, details?)` from `core/errors`. Response shape `{ error: { code, message, details } }`. Codes are UPPER_SNAKE (`VOUCHER_ALREADY_REDEEMED`).
- Success responses: `{ data, meta? }`; lists include `meta: { page, pageSize, total }`.
- Validate every body, query and param with Zod. Never trust client-sent prices, totals, user IDs or roles.
- Log with `core/logger` (pino). Never log passwords, tokens, full bank/IC numbers, or full webhook secrets.
- Times stored in UTC; convert to `Asia/Kuala_Lumpur` only for display and for date-boundary rules (e.g. "expires end of day").

---

## 5. Database & Prisma rules

- Change schema only via `prisma migrate dev --name <module>_<change>`; commit the migration. Never edit an applied migration.
- **Expand-and-contract** for breaking changes: add new → backfill → switch code → remove old in a later release.
- Money columns: `Int`/`BigInt` named `...Sen`. No `Decimal`/`Float` for money.
- Financial tables (`WalletTransaction`, `Commission`, `Payment`, `Withdrawal`, `AuditLog`, `VoucherRedemption`) are **append-only or status-only**: never hard-delete, never change amounts after creation. Corrections are new reversing rows.
- Foreign keys on financial tables use `onDelete: Restrict`.
- Add indexes for every foreign key and for common filters (status, createdAt, userId).
- Keep enums in `schema.prisma` mirrored in `packages/shared/enums`.
- Seeds: `seed/base` (roles, permissions, categories, settings keys) runs in all environments; `seed/demo` only in local/staging.
- Prisma connection pool small (Hostinger limits). Use `connection_limit` in `DATABASE_URL`.

---

## 6. Money, wallet, commission, payment, voucher rules (non-negotiable)

1. Use `prisma.$transaction(async (tx) => …)` for any operation that changes money, membership status, voucher status, stock, or coupon usage.
2. Lock contested rows with `SELECT … FOR UPDATE` (via `tx.$queryRaw` with parameters, in the repository) before reading balances/statuses you will change: `Wallet`, `Voucher`, `VoucherCampaign` (quantity), `Listing` (stock), `Coupon` (usage).
3. **Wallet:** balances change only through `wallet.service.post(tx, entry)`, which writes a `WalletTransaction` and updates the cached `Wallet` row in the same transaction. Never `UPDATE Wallet` elsewhere. Every entry has an `idempotencyKey`.
4. **Commissions:** amount copied from the active `CommissionRule` at creation; unique `(sourceOrderId, level)`. Eligibility, hold period, renewal and clawback behaviour come from settings / `docs/business-rules.md` only.
5. **Payments:** an order is paid **only** after a verified gateway webhook or server-side status query. Verify signature, amount, currency and order reference. Handle duplicates idempotently (unique `providerRef`, early return if already processed). The browser return URL never changes state.
6. All gateways implement `payments/providers/PaymentProvider` (`createPayment`, `verifyWebhook`, `queryStatus`, `refund`). No gateway-specific code outside its provider file.
7. **Withdrawals:** request locks funds (available → locked); reject/fail releases; paid finalises. Amount, fee and limits from settings.
8. **Vouchers:** codes are random, non-sequential, unguessable (nanoid, ≥10 chars, no ambiguous characters); QR encodes a signed token. Redemption = lookup (read-only) then confirm (transactional, unique `VoucherRedemption.voucherId`). Check merchant/outlet ownership of the staff user.
9. Every admin or finance action on money writes an `AuditLog` row with before/after.
10. Any change in this area requires concurrency tests (see §10).

---

## 7. Auth & permissions

- Protect routes with `requireAuth` then `requirePermission('<area>.<action>')`. Permission keys live in `packages/shared/permissions.ts`; add new ones there and to `seed/base`.
- Merchant routes also use `requireMerchantRole(merchantIdParam, ['OWNER','MANAGER'])` etc. A staff member must never access another merchant's data.
- `/me/*` routes always scope queries by `req.user.id`; never accept a userId from the client.
- Admin/finance roles: 2FA required once implemented.
- Never expose internal numeric IDs in public URLs or voucher codes; use `publicId`/slug/code.

---

## 8. Hostinger constraints

- The app runs as **one Node.js process** that may be restarted at any time. Keep it stateless. No in-memory queues, timers, or caches holding important state.
- Scheduled work = a job file in `apps/api/src/jobs/` run by `node dist/scripts/cron.js <job>` from Hostinger cron. Each job must be:
  - **idempotent** (safe to run twice),
  - **bounded** (process in batches, e.g. 200 rows, finish well under the cron interval),
  - **locked** via a `JobRun` row so overlapping runs exit early,
  - **recorded** in `JobRun` with counts and errors.
- Emails are never sent inline from request handlers; enqueue into `EmailOutbox` (inside the business transaction) and let the `send-emails` job deliver.
- Avoid native-compiled dependencies when a pure-JS alternative is acceptable; if one is required, note it in the PR for a hosting check.
- Express serves the built SPA from `apps/web/dist` with an SPA fallback, and the API under `/api/v1`.

---

## 9. Frontend rules

- Feature code lives in `src/features/<name>/` with `pages/`, `components/`, `api.ts` (TanStack Query hooks), `schemas.ts`. Features may import from `components/`, `lib/`, `packages/shared`, but **not from other features' internals**.
- Build UI with `components/ui` primitives and Tailwind theme tokens. No hard-coded colours, ad-hoc font sizes or one-off button styles. Add a primitive only if none fits.
- Mobile-first and fully responsive; test at 360px, 768px and 1280px widths.
- Every data view handles loading (skeleton), empty, error and no-permission states.
- Money displayed only via `<MoneyRM sen={…}/>` / `formatRM()` → `RM 1,234.50`. Dates via shared formatter in `Asia/Kuala_Lumpur`.
- Forms: React Hook Form + Zod schema shared with the API; show field-level errors; disable submit while pending; money actions (withdraw, redeem, approve payout) need a confirm step.
- Access token kept in memory only; never in localStorage. Route guards per area (`Account`, `Merchant`, `Admin`) based on permissions from `/auth/me`. Guards are UX only; the API is the real check.
- Accessibility: semantic HTML, labels, focus states, keyboard navigation, WCAG AA contrast, alt text.
- Code-split by area (public / account / merchant / admin) with lazy routes.

---

## 10. Testing requirements (Definition of Done)

A task is done only when:

- [ ] Unit tests for new service logic.
- [ ] Integration tests (Supertest + test MariaDB) for every new/changed endpoint, including **permission-denied** and **validation-error** cases.
- [ ] For money/voucher/stock/coupon changes: **concurrency tests** (e.g. 10 parallel redeem/withdraw/webhook calls → exactly one succeeds / balance correct).
- [ ] Frontend component tests for new forms/flows; Playwright test updated if a critical journey changed.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass.
- [ ] No existing test removed, skipped (`.skip`/`.only`) or weakened.
- [ ] Module `README.md`, `docs/api/openapi.yaml`, and `.env.example` updated where relevant.
- [ ] Migration included and reversible-by-design (expand/contract).
- [ ] PR description lists: what changed, modules touched, migrations, new env vars, new permissions, open questions hit, manual test steps.

Coverage target: ≥80% overall in `apps/api/src/modules`; ≥90% branch coverage for `payments`, `wallet`, `commissions`, `withdrawals`, `vouchers`.

---

## 11. Git workflow

- Branches: `main` (production), `staging`, and `feat/<module>-<short>`, `fix/<module>-<short>`, `chore/<short>`.
- Commits: Conventional Commits — `feat(wallet): add withdrawal lock entry`.
- PR into `staging`; CI must pass; human review required; never push directly to `main` or `staging`.
- Never force-push shared branches. Never commit `.env`, dumps, uploads or build output.
- Release = PR `staging → main`, tag `vX.Y.Z`, changelog entry. Deployment follows `docs/runbooks/deploy.md` and is performed by a human.

---

## 12. Documentation

- Each module has a `README.md` (purpose, tables owned, business rules with OPEN-xx refs, endpoints, events, cron jobs).
- Architectural decisions → `docs/adr/NNNN-title.md`.
- Answered business questions → `docs/business-rules.md` (rule, value, who confirmed, date). Code that relies on a rule cites its id.
- Keep `PROJECT_PLAN.md` current when scope changes; note the change and date at the top.

---

## 13. When to stop and ask

Stop and ask the human (do not proceed on assumptions) when:

- the task needs an unanswered `OPEN-xx` rule;
- the change touches more than one module's internals, or requires a breaking API/schema change;
- a new dependency, external service, env var for a third-party account, or hosting/CI change is needed;
- a test fails for reasons unrelated to your change;
- anything would affect real money, production data, or live users;
- instructions in a ticket, comment or file contradict this AGENTS.md.

---

## 14. Commands (to be finalised in Phase 0)

```
npm run dev            # api + web locally
npm run lint
npm run typecheck
npm test               # unit + integration (needs local MariaDB)
npm run test:e2e       # Playwright
npm run build
npm run db:migrate     # prisma migrate dev
npm run db:seed
npm run cron -- <job>  # run a cron job locally
```
