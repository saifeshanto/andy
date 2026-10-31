import { PasswordSchema } from '@andy/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { AuthCard } from './AuthCard';
import { useApiForm } from './useApiForm';

const Schema = z
  .object({ password: PasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const { form, formError, submit } = useApiForm(Schema);
  const { errors, isSubmitting } = form.formState;

  return (
    <AuthCard title="Choose a new password">
      {!token ? (
        <Alert tone="danger">This link is incomplete. Please use the link from your email.</Alert>
      ) : done ? (
        <div className="space-y-4">
          <Alert tone="success">Your password has been changed. Please sign in with the new password.</Alert>
          <Link to="/login" className="block text-center font-semibold underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={submit(async ({ password }) => {
            await api('/auth/reset-password', { method: 'POST', json: { token, password } });
            setDone(true);
          })}
        >
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="New password" type="password" autoComplete="new-password" hint="At least 10 characters, with a letter and a number." error={errors.password?.message} {...form.register('password')} />
          <Field label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm?.message} {...form.register('confirm')} />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
