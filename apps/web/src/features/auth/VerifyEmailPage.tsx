import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { AuthCard } from './AuthCard';
import { useAuth } from './AuthProvider';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, reload } = useAuth();
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState('This link is incomplete. Please use the link from your email.');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // StrictMode runs effects twice; the token is single-use.
    api('/auth/verify-email', { method: 'POST', json: { token } })
      .then(() => setState('done'))
      .catch((err) => {
        setMessage(err instanceof ApiError ? err.message : 'Something went wrong.');
        setState('error');
      });
  }, [token]);

  useEffect(() => {
    if (state === 'done' && status === 'signed-in') void reload();
  }, [state, status, reload]);

  return (
    <AuthCard title="Confirm email">
      {state === 'working' && <Spinner label="Confirming" />}
      {state === 'done' && (
        <div className="space-y-4">
          <Alert tone="success">Thanks, your email is confirmed.</Alert>
          <Link to={status === 'signed-in' ? '/account' : '/login'} className="block text-center font-semibold underline">
            {status === 'signed-in' ? 'Go to my account' : 'Sign in'}
          </Link>
        </div>
      )}
      {state === 'error' && <Alert tone="danger">{message}</Alert>}
    </AuthCard>
  );
}
