import { rateLimit } from 'express-rate-limit';

// In-memory store: resets when Hostinger restarts the app, which is acceptable for brute-force protection.
const common = { standardHeaders: 'draft-8' as const, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' };
const message = { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' } };

/** Login, register, password reset: 10 requests per 15 minutes per IP. */
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 10, message });

/** Uploads: 60 files per 15 minutes per IP. */
export const uploadLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 60, message });
