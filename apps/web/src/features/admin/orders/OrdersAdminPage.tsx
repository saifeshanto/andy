import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { orderLabel, orderTone } from '@/features/account/OrdersPage';
import type { OrderView } from '@/features/membership/api';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '../types';

type Row = OrderView & {
  user: { id?: string; email?: string };
  payments: { id: string; provider: string; providerRef: string | null; status: string; failureCode: string | null }[];
};

export function OrdersAdminPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const q = useQuery({ queryKey: ['admin', 'orders', params.toString()], queryFn: () => api<Paged<Row>>(`/admin/orders?${params}`), placeholderData: keepPreviousData });
  const requery = useMutation({
    mutationFn: (id: string) => api<{ data: { outcome: string } }>(`/admin/payments/${id}/requery`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }),
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Orders" description="Payments are confirmed only by the gateway, never by the customer's browser." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input type="search" defaultValue={params.get('q') ?? ''} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} placeholder="Order no., name or email, then Enter" aria-label="Search" className="min-h-11 flex-1 rounded-xl border border-ink-100 bg-white px-3.5" />
        <select value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Status" className="min-h-11 rounded-xl border border-ink-100 bg-white px-3">
          <option value="">All</option>
          {Object.entries(orderLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {requery.isError && <div className="mb-4"><Alert tone="danger">{requery.error instanceof ApiError ? requery.error.message : 'Re-check failed'}</Alert></div>}
      {requery.isSuccess && <div className="mb-4"><Alert tone="info">Gateway says: {requery.data.data.outcome.replace('_', ' ').toLowerCase()}</Alert></div>}
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load orders.</Alert>}
      {q.data && q.data.data.length === 0 && <EmptyState title="No orders" />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(o) => o.orderNo}
            columns={[
              { key: 'no', header: 'Order', cell: (o) => <span className="font-medium">{o.orderNo}</span> },
              { key: 'who', header: 'Customer', cell: (o) => o.user.email },
              { key: 'total', header: 'Total', cell: (o) => <MoneyRM sen={o.totalSen} /> },
              { key: 'status', header: 'Status', cell: (o) => <Badge tone={orderTone[o.status]}>{orderLabel[o.status]}</Badge> },
              { key: 'gw', header: 'Payment ref', cell: (o) => <span className="text-xs">{o.payments[0]?.provider === 'manual' ? 'Offline: ' : ''}{o.payments[0]?.providerRef ?? '—'}{o.payments[0]?.failureCode ? ` (${o.payments[0].failureCode})` : ''}</span> },
              { key: 'date', header: 'Created', cell: (o) => formatDateTime(o.createdAt) },
              {
                key: 'act',
                header: '',
                cell: (o) =>
                  o.status === 'PENDING_PAYMENT' && o.payments[0]?.providerRef && can('payments.manage') ? (
                    <Button variant="secondary" disabled={requery.isPending} onClick={() => requery.mutate(o.payments[0]!.id)}>
                      Re-check
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </>
  );
}
