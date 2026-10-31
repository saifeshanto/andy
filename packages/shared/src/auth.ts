import { z } from 'zod';

/** Shared by the API and the web forms so validation rules match exactly. */
export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const EmailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(191);

export const RegisterSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(150),
  email: EmailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{8,20}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  password: PasswordSchema,
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const ForgotPasswordSchema = z.object({ email: EmailSchema });

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});

export const VerifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

/** Shape of GET /auth/me and the user object returned on login. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  emailVerified: boolean;
  roles: string[];
  permissions: string[];
}
