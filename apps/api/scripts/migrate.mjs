// Applies Prisma migrations during the Hostinger build when RUN_MIGRATIONS=true.
//
// Copes with databases where some tables were created by hand (SQL imported in phpMyAdmin):
// a migration whose tables all exist already is marked as applied instead of being run again,
// and a migration that failed half-way on an earlier deploy is cleared so it can be retried.
// Each migration in this repo only creates new tables, which is what makes these checks safe.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const log = (msg) => console.log(`[migrate] ${msg}`);
const fail = (msg) => {
  console.error(`[migrate] ERROR: ${msg}`);
  process.exit(1);
};

if (process.env.RUN_MIGRATIONS !== 'true') {
  log('RUN_MIGRATIONS is not "true"; skipping database migrations.');
  process.exit(0);
}
const raw = process.env.DATABASE_URL;
if (!raw) fail('DATABASE_URL is not set');

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
const migrations = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((name) => ({ name, tables: [...readFileSync(path.join(dir, name, 'migration.sql'), 'utf8').matchAll(/CREATE TABLE `([^`]+)`/g)].map((m) => m[1]) }));

const url = new URL(raw);
const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
let conn;
try {
  conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  });
} catch (err) {
  fail(`cannot connect to the database (${err.code ?? err.message}). Check DATABASE_URL.`);
}
const tables = new Set((await conn.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database])).map((r) => r.t));
const history = tables.has('_prisma_migrations')
  ? await conn.query('SELECT migration_name AS name, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM _prisma_migrations')
  : [];
await conn.end();

const applied = new Set(history.filter((h) => h.finishedAt && !h.rolledBackAt).map((h) => h.name));
const failed = new Set(history.filter((h) => !h.finishedAt && !h.rolledBackAt).map((h) => h.name));
const prisma = (...args) => execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });

for (const m of migrations) {
  if (applied.has(m.name)) continue;
  const present = m.tables.filter((t) => tables.has(t));
  if (m.tables.length && present.length === m.tables.length) {
    log(`${m.name}: its tables already exist (created by hand?); marking it as applied.`);
    if (failed.has(m.name)) prisma('migrate', 'resolve', '--rolled-back', m.name);
    prisma('migrate', 'resolve', '--applied', m.name);
  } else if (present.length) {
    fail(
      `${m.name} is only partly in the database. These tables exist: ${present.join(', ')}; these are missing: ${m.tables.filter((t) => !tables.has(t)).join(', ')}. ` +
        'Drop the listed existing tables in phpMyAdmin (if they hold no real data yet) and deploy again, or ask your developer.',
    );
  } else if (failed.has(m.name)) {
    log(`${m.name}: failed on an earlier deploy and none of its tables exist; clearing it so it runs again.`);
    prisma('migrate', 'resolve', '--rolled-back', m.name);
  }
}

prisma('migrate', 'deploy');
log('Done.');
