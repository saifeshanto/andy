# ADR 0001: Bundled single-file deploy and Prisma driver adapter for Hostinger

**Date:** 2026-10-31 · **Status:** Accepted for Phase 0 test

## Context
Hostinger Business Web Hosting is managed shared hosting: no root, no persistent workers, limited build tooling,
and releases are uploaded manually. Prisma's classic Rust query engine has caused OpenSSL/platform mismatches on shared hosts.

## Decision
- Use Prisma 7 with `@prisma/adapter-mariadb` (pure JavaScript driver, no native engine binary).
- Bundle the API and cron entry with esbuild into `server.js` and `cron.js` that include all npm dependencies,
  so the host needs no `npm install` or TypeScript.
- Ship SQL migrations alongside, importable through phpMyAdmin, in case `prisma migrate deploy` cannot run on the host.
- Scheduled work runs via hPanel cron (`node cron.js <job>`, or an HTTP call with `x-cron-secret` as fallback),
  tracked in the `JobRun` table.

## Consequences
- The bundle is about 7 MB; fine for upload. Source maps are not shipped.
- If the Phase 0 test fails, the fallback is a Hostinger VPS (see PROJECT_PLAN.md section 16).
