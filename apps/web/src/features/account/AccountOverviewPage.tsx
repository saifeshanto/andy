import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMembership } from '@/features/membership/api';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Link } from 'react-router';

export function AccountOverviewPage() {
  const { user } = useAuth();
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const membership = useMembership();
  if (!user) return null;
  const m = membership.data;

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
        <Link to="/account/membership">
          <Card className="h-full transition-shadow hover:shadow-lg">
            <p className="text-sm text-ink-500">Membership</p>
            {m?.current ? (
              <>
                <p className="mt-2 font-display text-2xl font-bold uppercase">Active</p>
                <p className="mt-1 text-sm text-ink-500">Valid until {formatDate(m.paidUntil ?? m.current.endAt)}</p>
              </>
            ) : (
              <>
                <p className="mt-2 font-display text-2xl font-bold uppercase">Not a member yet</p>
                <p className="mt-1 text-sm text-ink-500">
                  Join for <MoneyRM sen={m?.plan?.priceSen ?? 39900} /> a year →
                </p>
              </>
            )}
          </Card>
        </Link>
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
