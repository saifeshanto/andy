import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import type { Redemption } from '@/features/vouchers/types';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '@/features/admin/types';
import { usePortal } from './PortalContext';

export function RedemptionsPage() {
  const { id, can } = usePortal();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const q = useQuery({ queryKey: ['merchant-portal', id, 'redemptions', page], queryFn: () => api<Paged<Redemption>>(`/merchant/${id}/redemptions?page=${page}`), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Redemptions" description={can('redemptions.readAll') ? 'Every voucher used at your business.' : 'Vouchers you have redeemed.'} />
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load redemptions.</Alert>}
      {q.data?.data.length === 0 && <EmptyState title="No redemptions yet" />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'at', header: 'When', cell: (r) => formatDateTime(r.at) },
              { key: 'title', header: 'Voucher', cell: (r) => <span className="font-medium">{r.title}</span> },
              { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
              { key: 'member', header: 'Member', cell: (r) => r.member.name },
              { key: 'outlet', header: 'Outlet', cell: (r) => r.outlet },
              { key: 'staff', header: 'Staff', cell: (r) => r.staff },
              { key: 'state', header: '', cell: (r) => (r.reversedAt ? <Badge tone="warning">Undone</Badge> : null) },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => setParams({ page: String(p) })} />
        </>
      )}
    </>
  );
}
