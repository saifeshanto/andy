import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '@/features/admin/types';
import type { OrderView } from '@/features/membership/api';

export const orderTone = { PAID: 'success', PENDING_PAYMENT: 'warning', CANCELLED: 'neutral', EXPIRED: 'neutral', REFUNDED: 'danger' } as const;
export const orderLabel = { PAID: 'Paid', PENDING_PAYMENT: 'Awaiting payment', CANCELLED: 'Cancelled', EXPIRED: 'Expired', REFUNDED: 'Refunded' } as const;

export function OrdersPage() {
  const q = useQuery({ queryKey: ['me', 'orders'], queryFn: () => api<Paged<OrderView>>('/me/orders') });
  return (
    <>
      <PageHeader title="Orders" description="Your payments and receipts." />
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load your orders.</Alert>}
      {q.data && q.data.data.length === 0 && <EmptyState title="No orders yet" />}
      {q.data && q.data.data.length > 0 && (
        <DataTable
          rows={q.data.data}
          rowKey={(o) => o.orderNo}
          columns={[
            { key: 'no', header: 'Order', cell: (o) => <span className="font-medium">{o.orderNo}</span> },
            { key: 'item', header: 'Item', cell: (o) => o.items.map((i) => i.title).join(', ') },
            { key: 'total', header: 'Total', cell: (o) => <MoneyRM sen={o.totalSen} /> },
            { key: 'status', header: 'Status', cell: (o) => <Badge tone={orderTone[o.status]}>{orderLabel[o.status]}</Badge> },
            { key: 'date', header: 'Date', cell: (o) => formatDateTime(o.paidAt ?? o.createdAt) },
          ]}
        />
      )}
    </>
  );
}
