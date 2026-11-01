import { Router, type Request, type Response } from 'express';
import { ForgotPasswordSchema, LoginSchema, RegisterSchema, ResetPasswordSchema, VerifyEmailSchema } from '@andy/shared';
import { env } from '../../config/env.js';
import { currentUser, requireAuth } from '../../core/auth.js';
import { AppError } from '../../core/errors.js';
import { authLimiter } from '../../core/rate-limit.js';
import * as auth from './auth.service.js';

export const REFRESH_COOKIE = 'andy_rt';
const COOKIE_PATH = '/api/v1/auth';

const meta = (req: Request): auth.ClientMeta => ({ ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null });

function setRefreshCookie(res: Response, session: auth.Session) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: env().NODE_ENV === 'production' || env().NODE_ENV === 'staging',
    sameSite: 'strict',
    path: COOKIE_PATH,
    expires: session.refreshExpiresAt,
  });
}

const sessionBody = (s: auth.Session) => ({ data: { accessToken: s.accessToken, user: s.user } });

/** Cookie-authenticated endpoints also need this header, which cross-site forms cannot send (CSRF defence). */
function requireAppHeader(req: Request) {
  if (req.header('x-requested-with') !== 'andy-web') throw new AppError('FORBIDDEN', 403, 'Missing request header');
}

export const authRouter = Router();

authRouter.post('/auth/register', authLimiter, async (req, res) => {
  const session = await auth.register(RegisterSchema.parse(req.body), meta(req));
  setRefreshCookie(res, session);
  res.status(201).json(sessionBody(session));
});

authRouter.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = LoginSchema.parse(req.body);
  const session = await auth.login(email, password, meta(req));
  setRefreshCookie(res, session);
  res.json(sessionBody(session));
});

authRouter.post('/auth/refresh', async (req, res) => {
  requireAppHeader(req);
  try {
    const session = await auth.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
    setRefreshCookie(res, session);
    res.json(sessionBody(session));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    throw err;
  }
});

authRouter.post('/auth/logout', async (req, res) => {
  requireAppHeader(req);
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  res.status(204).end();
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  res.json({ data: await auth.getAuthUser(currentUser(req).id) });
});

authRouter.post('/auth/verify-email', authLimiter, async (req, res) => {
  await auth.verifyEmail(VerifyEmailSchema.parse(req.body).token);
  res.json({ data: { verified: true } });
});

authRouter.post('/auth/resend-verification', authLimiter, requireAuth, async (req, res) => {
  await auth.resendVerification(currentUser(req).id);
  res.json({ data: { sent: true } });
});

authRouter.post('/auth/forgot-password', authLimiter, async (req, res) => {
  await auth.forgotPassword(ForgotPasswordSchema.parse(req.body).email);
  res.json({ data: { sent: true } });
});

authRouter.post('/auth/reset-password', authLimiter, async (req, res) => {
  const { token, password } = ResetPasswordSchema.parse(req.body);
  await auth.resetPassword(token, password, meta(req));
  res.json({ data: { reset: true } });
});
