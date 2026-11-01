import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { startCheckout, useMembership } from './api';

export function MembershipPage() {
  const q = useMembership();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Could not load your membership.</Alert>;
  const { current, paidUntil, canPurchase, plan, history } = q.data;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await startCheckout());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Membership" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card tone={current ? 'dark' : 'light'}>
          {current ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-300">{current.plan}</p>
                <Badge tone="success">Active</Badge>
              </div>
              <p className="mt-6 font-display text-4xl font-bold uppercase">Member</p>
              <p className="mt-2 text-ink-300">
                Valid until <strong className="text-white">{formatDate(paidUntil ?? current.endAt)}</strong>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-500">{paidUntil ? 'Starting soon' : 'Not a member yet'}</p>
              <p className="mt-2 font-display text-3xl font-bold uppercase">{plan?.name ?? 'Membership'}</p>
              {plan && (
                <p className="mt-2 text-ink-500">
                  <MoneyRM sen={plan.priceSen} className="text-2xl font-bold text-ink-900" /> for {plan.durationMonths} months
                </p>
              )}
            </>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">{current ? 'Renew' : 'Join now'}</h2>
          {canPurchase && plan ? (
            <>
              <p className="mt-1 text-sm text-ink-500">
                Pay securely through our payment partner, Billplz (online banking and other methods they offer).
              </p>
              {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
              <Button className="mt-4 w-full" onClick={pay} disabled={busy}>
                {busy ? 'Opening payment…' : <>Pay <MoneyRM sen={plan.priceSen} /></>}
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-500">Renewing before your current membership ends is not available yet.</p>
          )}
        </Card>
      </div>
      {history.length > 0 && (
        <Card flush className="mt-4 pb-1">
          <h2 className="px-6 pt-5 font-semibold">History</h2>
          <ul className="divide-y divide-ink-100">
            {history.map((h) => (
              <li key={h.startAt} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5 text-sm">
                <span>
                  {formatDate(h.startAt)} – {formatDate(h.endAt)}
                </span>
                <Badge tone={h.status === 'ACTIVE' ? 'success' : 'neutral'}>{h.status.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
