# system module

**Purpose:** health check and cron entry points. Phase 0 uses it to prove Node.js, Prisma, MariaDB and cron work on Hostinger.

**Tables owned:** `Setting` (key `system.lastHeartbeatAt` only), `JobRun` (with `jobs/runner.ts`).

**Endpoints**
- `GET /api/v1/system/health` → `{ data: { status, database, cron, node, ... } }`, 503 when the DB is unreachable.
- `POST /api/v1/internal/cron/:job` → runs a registered job. Requires header `x-cron-secret` equal to `CRON_SECRET`.

**Cron:** `node cron.js <job>` (bundle) or `npm run cron -- <job>` (dev). Jobs live in `src/jobs/`.
