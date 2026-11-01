import { LoginSchema } from '@andy/shared';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { AuthCard } from './AuthCard';
import { useAuth } from './AuthProvider';
import { safeNext } from './guards';
import { useApiForm } from './useApiForm';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { form, formError, submit } = useApiForm(LoginSchema);
  const { errors, isSubmitting } = form.formState;

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-white underline">
            Create an account
          </Link>
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          await login(values);
          navigate(safeNext(params.get('next')), { replace: true });
        })}
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <Field label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...form.register('password')} />
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="text-ink-500 underline hover:text-ink-900">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
