// Applies Prisma migrations during the Hostinger build when RUN_MIGRATIONS=true.
// Handles databases set up by hand in phpMyAdmin (tables exist but Prisma's history table does not)
// by marking the first migration as already applied before deploying the rest.
import { execFileSync } from 'node:child_process';
import mariadb from 'mariadb';

if (process.env.RUN_MIGRATIONS !== 'true') {
  console.log('[migrate] RUN_MIGRATIONS is not "true"; skipping database migrations.');
  process.exit(0);
}
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

const url = new URL(raw);
const database = url.pathname.replace(/^\//, '');
const conn = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
});
const tables = new Set(
  (await conn.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database])).map((r) => r.t),
);
await conn.end();

const prisma = (...args) => execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });

if (!tables.has('_prisma_migrations') && tables.has('JobRun')) {
  console.log('[migrate] Tables were imported by hand; marking the first migration as applied.');
  prisma('migrate', 'resolve', '--applied', '20261031212652_system_init');
}
prisma('migrate', 'deploy');
console.log('[migrate] Done.');
