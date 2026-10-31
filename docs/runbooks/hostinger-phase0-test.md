# Phase 0: Hostinger test deploy (manual upload)

The aim is to prove four things on Andy's Hostinger Business plan before feature work starts:
the Node.js app runs, the React site is served, Prisma talks to MariaDB, and cron works.

The upload is self-contained: `server.js` and `cron.js` already include every npm package,
so Hostinger does not need to run `npm install` or a build step.

## What is in the zip

| File | Purpose |
|---|---|
| `server.js` | The app (API + website). Entry file / start command: `node server.js` |
| `cron.js` | Cron runner: `node cron.js heartbeat` |
| `public/` | Built React website |
| `database/*.sql` | Creates the database tables. Import in phpMyAdmin. (The database itself is created in hPanel, so there is no database file to upload.) |
| `package.json` | `npm start` runs `node server.js` |

## Steps

1. **Database.** hPanel → Databases → MySQL/MariaDB → create a database and user (e.g. `u123_andy_staging`).
   Open phpMyAdmin for it → Import → upload each file in `database/` in name order.
2. **Node.js app.** Do **not** use the normal "upload website files" / migrate option: that one only accepts
   PHP or static HTML sites and shows "Your website couldn't be recognized".
   Instead: hPanel → Websites → Add website → **Node.js Apps** → upload the zip.
   On the build settings screen: framework **Express** (or Other), Node version 20 or 22,
   entry file `server.js`, start command `npm start`, build command empty (or `npm run build`, which does nothing),
   output directory empty / root.
3. **Environment variables** (hPanel → the Node.js app → Environment variables):
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = `mysql://USER:PASSWORD@localhost:3306/DBNAME` (URL-encode special characters in the password)
   - `CRON_SECRET` = a random string of at least 32 characters
   - `PORT` only if hPanel asks for it (Hostinger usually sets it)
4. **Start/restart** the app, then open `https://<staging-domain>/status`.
   Website, API and Database should show **OK**. Cron shows "No heartbeat yet" until step 5.
5. **Cron.** hPanel → Advanced → Cron Jobs → every 5 minutes. Try option A; if hPanel only allows URLs or A fails, use B.
   - A (command): `cd /home/<user>/domains/<domain>/nodejs && node cron.js tick` (the real app folder path is shown in hPanel / File Manager; for a GitHub deploy use `node apps/api/dist/cron.js tick`)
   - B (HTTP): `curl -fsS -X POST -H "x-cron-secret: <CRON_SECRET>" https://<staging-domain>/api/v1/internal/cron/tick`

   `tick` runs every scheduled job (heartbeat, sending queued emails, cleaning old tokens).

   After 5 to 10 minutes, `/status` should show Cron **OK** with a recent heartbeat.

## Report back

- a screenshot of `/status`,
- which cron option worked (A or B) and the exact app folder path,
- the Node version and MariaDB version shown,
- any error text from hPanel's app logs if something failed.

## If something fails

| Symptom | Likely cause |
|---|---|
| App won't start, log says "Invalid environment configuration" | Missing or short env var; the log lists which one |
| `/status` shows Database: Problem | Wrong `DATABASE_URL` or tables not imported |
| Website 404 but `/api/v1/system/health` works | `public/` folder missing from upload |
| Cron never updates | Wrong folder path in option A, or wrong secret in option B |
