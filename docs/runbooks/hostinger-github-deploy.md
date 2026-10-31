# Deploying from GitHub on Hostinger

Hostinger builds the app straight from the GitHub branch.

## Build settings

| Field | Value |
|---|---|
| Framework preset | Other |
| Branch | `main` (or the branch being tested on staging) |
| Node version | 22.x |
| Root directory | `./` |
| Build command | `npm run build` (installs build tools itself, then builds; runs migrations when `RUN_MIGRATIONS=true`) |
| Package manager | npm |
| Output directory | empty |
| Entry file | `apps/api/dist/server.js` |

## Environment variables

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `mysql://USER:PASSWORD@localhost:3306/DBNAME` (URL-encode symbols in the password) |
| `RUN_MIGRATIONS` | `true` |
| `APP_URL` | `https://<site domain>` (no trailing slash) |
| `CRON_SECRET` | random, 32+ characters |
| `JWT_SECRET` | random, 32+ characters, different from `CRON_SECRET` |
| `BOOTSTRAP_ADMIN_EMAIL` | the email that should become the first Super Admin |
| `MAIL_TRANSPORT` | `smtp` once a mailbox exists, otherwise `log` |
| `MAIL_FROM` | e.g. `Andy Auto Club <no-reply@yourdomain.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | `smtp.hostinger.com` / `465` / `true` |
| `SMTP_USER` / `SMTP_PASSWORD` | the mailbox address and its password |
| `PAYMENT_PROVIDER` | `billplz` (leave unset or `none` to keep checkout switched off) |
| `BILLPLZ_SANDBOX` | `true` for testing with a sandbox account, `false` for real money |
| `BILLPLZ_API_KEY` | Billplz dashboard → Settings → Keys & Integration → API Secret Key |
| `BILLPLZ_X_SIGNATURE_KEY` | same page → X Signature Key (X Signature must be **enabled**) |
| `BILLPLZ_COLLECTION_ID` | Billplz dashboard → Billing → the collection to use (e.g. `inbmmepb`) |

Do not set `PORT`; Hostinger provides it.

## Cron (hPanel → Advanced → Cron Jobs, every 5 minutes)

`curl -fsS -X POST -H "x-cron-secret: <CRON_SECRET>" https://<site domain>/api/v1/internal/cron/tick`

## Billplz

- Sandbox and live accounts are separate, each with its own keys and collection. Use the sandbox on staging.
- Turn on **X Signature** in Billplz (Settings → Keys & Integration). Payments are refused without a valid signature.
- Nothing needs entering in Billplz for the callback: the app sends these URLs with each bill:
  - callback (server to server): `https://<site domain>/api/v1/payments/webhook/billplz`
  - redirect (customer's browser): `https://<site domain>/api/v1/payments/return/billplz`
- A payment is only marked paid from a signed callback or from asking Billplz directly. The cron `tick`
  re-checks bills still pending after 10 minutes, so a missed callback is picked up automatically.
- Admin → Orders has a **Re-check** button (asks Billplz for the bill's real status) for a single order.

## First Super Admin

1. Set `BOOTSTRAP_ADMIN_EMAIL` and deploy.
2. Register on the site with that email, then click the confirmation link in the email.
   If email is not set up yet (`MAIL_TRANSPORT=log`), the link is printed in the app's logs in hPanel.
3. Sign in again. The **Admin** link appears in the header.

## Database migrations

With `RUN_MIGRATIONS=true`, each build applies any new migrations before the app restarts.
A database first set up by importing SQL in phpMyAdmin is detected and handled automatically.
Always take a database backup (phpMyAdmin → Export) before deploying a release that adds migrations.
