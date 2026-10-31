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
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated environment. Fails fast at startup with a readable message. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
