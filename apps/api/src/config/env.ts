import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  WEB_DIST: z.string().optional(),

  /** Signs access tokens. At least 32 random characters. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Encrypts sensitive columns later (bank/IC). Optional until those modules exist. */
  DATA_ENCRYPTION_KEY: z.string().optional(),

  /** The first account with this email to verify its address becomes Super Admin, if none exists yet. */
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),

  /** "smtp" sends real email; "log" writes emails to the app log (development, or before SMTP is set up). */
  MAIL_TRANSPORT: z.enum(['smtp', 'log']).default('log'),
  MAIL_FROM: z.string().default('Andy Auto Club <no-reply@example.com>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  /**
   * "billplz" for real (or sandbox) payments; "fake" is a local test gateway and is refused in production.
   * Unset: "fake" in development/test, payments switched off in production.
   */
  PAYMENT_PROVIDER: z.enum(['billplz', 'fake', 'none']).optional(),
  /** Public base URL of this API for gateway callbacks. Defaults to APP_URL (same host on Hostinger). */
  PUBLIC_API_URL: z.string().url().optional(),
  BILLPLZ_SANDBOX: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  BILLPLZ_API_KEY: z.string().optional(),
  BILLPLZ_X_SIGNATURE_KEY: z.string().optional(),
  BILLPLZ_COLLECTION_ID: z.string().optional(),

  /**
   * Folder for uploaded files (merchant documents, logos, listing photos). Must be OUTSIDE the app folder
   * on Hostinger, because a GitHub redeploy replaces the app folder. Defaults to ./storage/uploads for local dev.
   */
  UPLOAD_DIR: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/**
 * Hosting panels (Hostinger included) often save a variable left blank as an empty string.
 * Treat blank as "not set" so optional settings fall back to their defaults instead of failing validation.
 */
export function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) if (v !== undefined && v.trim() !== '') out[k] = v;
  return out;
}

/** Test hook: forget the cached config so the next env() call re-reads process.env. */
export function resetEnvForTests(): void {
  cached = undefined;
}

/** Validated environment. Fails fast at startup with a readable message. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(withoutBlanks(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const data = parsed.data;
  const isProd = data.NODE_ENV === 'production' || data.NODE_ENV === 'staging';
  if (isProd && data.PAYMENT_PROVIDER === 'fake') {
    throw new Error('Invalid environment configuration:\n  - PAYMENT_PROVIDER: "fake" is not allowed in production');
  }
  data.PAYMENT_PROVIDER ??= isProd ? 'none' : 'fake';
  cached = data;
  return cached;
}
