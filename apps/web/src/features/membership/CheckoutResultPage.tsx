import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const POLL_MS = 3000;
const POLL_FOR_MS = 2 * 60 * 1000;
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { OrderView } from './api';

/**
 * Shows the order's real status from our server. The gateway callback may arrive a few seconds after
 * the customer, so we poll for up to 2 minutes while the order is still pending.
 */
export function CheckoutResultPage() {
  const [params] = useSearchParams();
  const orderNo = params.get('order') ?? '';
  const qc = useQueryClient();
  const [startedAt] = useState(() => Date.now());
  const [, setTimedOut] = useState(false);
  const stillPolling = () => Date.now() - startedAt < POLL_FOR_MS;
  useEffect(() => {
    // Re-render once polling stops so the message switches to the "still waiting" wording.
    const t = setTimeout(() => setTimedOut(true), POLL_FOR_MS);
    return () => clearTimeout(t);
  }, []);
  const q = useQuery({
    queryKey: ['me', 'order', orderNo],
    queryFn: () => api<{ data: OrderView }>(`/me/orders/${encodeURIComponent(orderNo)}`).then((r) => r.data),
    enabled: !!orderNo,
    refetchInterval: (query) => (query.state.data?.status === 'PENDING_PAYMENT' && stillPolling() ? POLL_MS : false),
  });
  useEffect(() => {
    if (q.data?.status === 'PAID') void qc.invalidateQueries({ queryKey: ['me', 'membership'] });
  }, [q.data?.status, qc]);

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Card>
        {!orderNo && <Alert tone="danger">We could not find your order. If you were charged, contact us with your bank reference.</Alert>}
        {q.isLoading && <Spinner label="Checking your payment" />}
        {q.isError && <Alert tone="danger">We could not load this order.</Alert>}
        {q.data && (
          <>
            {q.data.status === 'PAID' && (
              <>
                <p className="text-sm font-semibold uppercase tracking-wide text-success-500">Payment successful</p>
                <h1 className="mt-1 font-display text-3xl font-bold uppercase">Thank you!</h1>
                <p className="mt-2 text-ink-500">A receipt has been sent to your email.</p>
              </>
            )}
            {q.data.status === 'PENDING_PAYMENT' && (
              <>
                <p className="text-sm font-semibold uppercase tracking-wide text-warning-500">Waiting for confirmation</p>
                <h1 className="mt-1 font-display text-3xl font-bold uppercase">Almost there</h1>
                <p className="mt-2 text-ink-500">
                  {stillPolling()
                    ? 'We are waiting for the bank to confirm your payment. This page updates by itself.'
                    : 'Your bank has not confirmed yet. If you paid, it will update within a few minutes and we will email you.'}
                </p>
              </>
            )}
            {(q.data.status === 'CANCELLED' || q.data.status === 'EXPIRED') && (
              <>
                <h1 className="font-display text-3xl font-bold uppercase">Payment not completed</h1>
                <p className="mt-2 text-ink-500">No money was taken. You can try again from your membership page.</p>
              </>
            )}
            <dl className="mt-6 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Order</dt><dd className="font-medium">{q.data.orderNo}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Item</dt><dd>{q.data.items.map((i) => i.title).join(', ')}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Amount</dt><dd><MoneyRM sen={q.data.totalSen} /></dd></div>
              {q.data.paidAt && <div className="flex justify-between"><dt className="text-ink-500">Paid</dt><dd>{formatDateTime(q.data.paidAt)}</dd></div>}
            </dl>
          </>
        )}
        <Link to="/account/membership" className="mt-6 block text-center font-semibold underline">
          Go to my membership
        </Link>
      </Card>
    </main>
  );
}
