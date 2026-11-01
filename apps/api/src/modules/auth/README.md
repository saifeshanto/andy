# auth module

**Purpose:** registration, sign-in, sessions, email confirmation and password reset (plan M3/M23).

**Tables owned:** `User` (identity fields), `RefreshToken`, `VerificationToken`.

**Sessions**
- Access token: JWT (HS256, `JWT_SECRET`), 15 minutes, kept in browser memory only.
- Refresh token: random, stored as SHA-256 hash, sent as `andy_rt` httpOnly `SameSite=Strict` cookie scoped to `/api/v1/auth`.
  Rotated on every refresh. Reusing an old token (after a 10-second grace for parallel tabs) revokes the whole session family.
- Cookie endpoints (`/auth/refresh`, `/auth/logout`) also require header `x-requested-with: andy-web` (CSRF defence).

**Rules**
- Unverified users can sign in; features that need a confirmed email will check `emailVerified`.
- Login errors are identical for unknown email and wrong password; timing is equalised with a dummy hash.
- Forgot-password always returns success. Only the newest reset/confirmation link works. Reset links last 1 hour, confirmation links 24 hours.
- Password reset signs out every session and emails the user.
- `BOOTSTRAP_ADMIN_EMAIL`: on confirming that email, the account becomes Super Admin, only if no Super Admin exists.
- Rate limit: 10 requests / 15 minutes / IP on register, login, verify, resend, forgot and reset.

**Endpoints:** `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`,
`/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`.

**Open questions:** OPEN-07 (phone OTP), OPEN-08 (IC / KYC) are not implemented.
