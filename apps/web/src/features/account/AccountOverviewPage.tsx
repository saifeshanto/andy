import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, ApiError } from '@/lib/api';

export function AccountOverviewPage() {
  const { user } = useAuth();
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  if (!user) return null;

  return (
    <>
      <PageHeader title={`Hi, ${user.fullName.split(' ')[0]}`} description="Your account overview." />
      {!user.emailVerified && (
        <div className="mb-6">
          <Alert tone="warning">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Please confirm your email address. We sent a link to {user.email}.</span>
              {resend === 'sent' ? (
                <span className="font-semibold">Sent. Check your inbox.</span>
              ) : (
                <Button
                  variant="secondary"
                  disabled={resend === 'sending'}
                  onClick={async () => {
                    setResend('sending');
                    try {
                      await api('/auth/resend-verification', { method: 'POST' });
                      setResend('sent');
                    } catch (err) {
                      setResend(err instanceof ApiError ? err.message : 'Could not send. Try again later.');
                    }
                  }}
                >
                  Resend link
                </Button>
              )}
            </div>
            {resend !== 'idle' && resend !== 'sending' && resend !== 'sent' && <p className="mt-2">{resend}</p>}
          </Alert>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-ink-500">Membership</p>
          <p className="mt-2 font-display text-2xl font-bold uppercase">Not a member yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Annual membership <MoneyRM sen={39900} /> per year. Joining opens soon.
          </p>
        </Card>
        <Card>
          <p className="text-sm text-ink-500">Wallet</p>
          <p className="mt-2 font-display text-2xl font-bold uppercase">Coming soon</p>
          <p className="mt-1 text-sm text-ink-500">Your balance and transactions will appear here.</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-500">Account status</p>
          <div className="mt-3">
            <Badge tone={user.status === 'ACTIVE' ? 'success' : 'warning'}>{user.status === 'ACTIVE' ? 'Active' : 'Email not confirmed'}</Badge>
          </div>
        </Card>
      </div>
    </>
  );
}
