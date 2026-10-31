# Andy Automotive Platform

Automotive marketplace, membership, merchant and affiliate platform. Modular monolith:
React + Vite + Tailwind (`apps/web`), Express + Prisma on MariaDB (`apps/api`), shared code in `packages/shared`.

- Plan: [`PROJECT_PLAN.md`](PROJECT_PLAN.md)
- Rules for developers and AI agents: [`AGENTS.md`](AGENTS.md)
- Hostinger test deploy: [`docs/runbooks/hostinger-phase0-test.md`](docs/runbooks/hostinger-phase0-test.md)

**Status:** Phase 0 (foundations and Hostinger test). No business features yet.

## Local setup

Requires Node 20.19+ and a MariaDB 10.6+ server.

```bash
npm install
cp .env.example apps/api/.env      # set DATABASE_URL and CRON_SECRET
npm run db:migrate -w @andy/api    # create tables
npm run build -w @andy/shared
npm run dev                        # API on :3000, web on :5173 (proxies /api)
```

## Commands

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript checks in all workspaces |
| `npm test` | Unit tests + API integration tests (needs MariaDB) |
| `npm run build` | Builds shared, web and API |
| `npm run bundle:hostinger` | Builds `andy-hostinger.zip` for manual upload |
| `npm run cron -w @andy/api -- heartbeat` | Runs a cron job locally |
