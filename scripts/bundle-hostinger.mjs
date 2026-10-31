// Builds deploy/ and andy-hostinger.zip: a self-contained app for manual upload to Hostinger.
// All npm dependencies are bundled into server.js and cron.js, so the host needs no npm install.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'deploy');
const api = path.join(root, 'apps/api');

rmSync(out, { recursive: true, force: true });
mkdirSync(out);

for (const f of ['server.js', 'cron.js']) cpSync(path.join(api, 'dist', f), path.join(out, f));
cpSync(path.join(root, 'apps/web/dist'), path.join(out, 'public'), { recursive: true });

// Prisma 7 may load wasm/engine files at runtime; copy any that esbuild left beside the bundle.
for (const f of readdirSync(path.join(api, 'dist'))) {
  if (/\.(wasm|node)$/.test(f)) cpSync(path.join(api, 'dist', f), path.join(out, f));
}

// SQL migrations, to import through phpMyAdmin if prisma migrate cannot run on the host.
mkdirSync(path.join(out, 'migrations'));
for (const dir of readdirSync(path.join(api, 'prisma/migrations'))) {
  const sql = path.join(api, 'prisma/migrations', dir, 'migration.sql');
  if (existsSync(sql)) cpSync(sql, path.join(out, 'migrations', `${dir}.sql`));
}

writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'andy-platform',
      private: true,
      type: 'module',
      engines: { node: '>=20.19' },
      scripts: { start: 'node server.js', cron: 'node cron.js' },
    },
    null,
    2,
  ) + '\n',
);

cpSync(path.join(root, 'docs/runbooks/hostinger-phase0-test.md'), path.join(out, 'README.md'));

const zip = path.join(root, 'andy-hostinger.zip');
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
console.log(`Bundle ready: ${path.relative(root, out)}/ and ${path.relative(root, zip)}`);
