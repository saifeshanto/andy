import { RegisterSchema } from '@andy/shared';
import { Link, useNavigate } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { AuthCard } from './AuthCard';
import { useAuth } from './AuthProvider';
import { useApiForm } from './useApiForm';

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const { form, formError, submit } = useApiForm(RegisterSchema);
  const { errors, isSubmitting } = form.formState;

  return (
    <AuthCard
      title="Create account"
      subtitle="It takes less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-white underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          await signUp(values);
          navigate('/account', { replace: true });
        })}
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Full name" autoComplete="name" error={errors.fullName?.message} {...form.register('fullName')} />
        <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <Field label="Phone (optional)" type="tel" autoComplete="tel" placeholder="012-345 6789" error={errors.phone?.message} {...form.register('phone')} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters, with a letter and a number."
          error={errors.password?.message}
          {...form.register('password')}
        />
        <p className="text-xs text-ink-500">
          By creating an account you agree to our Terms and Privacy Policy.
        </p>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
