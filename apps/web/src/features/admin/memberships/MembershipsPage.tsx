import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Paged } from '../types';

interface Row {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  plan: string;
  user: { id?: string; email?: string; fullName?: string };
}

export function MembershipsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const q = useQuery({ queryKey: ['admin', 'memberships', params.toString()], queryFn: () => api<Paged<Row>>(`/admin/memberships?${params}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <>
      <PageHeader title="Memberships" description="Every membership term, newest first." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input type="search" defaultValue={params.get('q') ?? ''} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} placeholder="Search member name or email, then Enter" aria-label="Search" className="min-h-11 flex-1 rounded-xl border border-ink-100 bg-white px-3.5" />
        <select value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Status" className="min-h-11 rounded-xl border border-ink-100 bg-white px-3">
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load memberships.</Alert>}
      {q.data && q.data.data.length === 0 && <EmptyState title="No memberships yet" />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'member', header: 'Member', cell: (r) => (r.user.id ? <Link className="font-medium underline" to={`/admin/users/${r.user.id}`}>{r.user.fullName}</Link> : '—') },
              { key: 'email', header: 'Email', cell: (r) => r.user.email },
              { key: 'status', header: 'Status', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status.toLowerCase()}</Badge> },
              { key: 'start', header: 'Start', cell: (r) => formatDate(r.startAt) },
              { key: 'end', header: 'End', cell: (r) => formatDate(r.endAt) },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </>
  );
}
