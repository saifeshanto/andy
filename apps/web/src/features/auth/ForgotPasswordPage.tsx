import { ForgotPasswordSchema } from '@andy/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { AuthCard } from './AuthCard';
import { useApiForm } from './useApiForm';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { form, formError, submit } = useApiForm(ForgotPasswordSchema);
  const { errors, isSubmitting } = form.formState;

  return (
    <AuthCard title="Reset password" subtitle="We'll email you a link to choose a new password." footer={<Link to="/login" className="underline">Back to sign in</Link>}>
      {sent ? (
        <Alert tone="success">If an account exists for that email, a reset link is on its way. It expires in 1 hour.</Alert>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={submit(async (values) => {
            await api('/auth/forgot-password', { method: 'POST', json: values });
            setSent(true);
          })}
        >
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
