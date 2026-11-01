import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { merchantStatusLabel, merchantStatusTone, type MerchantView } from '@/features/merchants/types';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '../types';

const TABS = [
  { value: 'SUBMITTED', label: 'To review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'CHANGES_REQUESTED', label: 'Waiting on applicant' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: '', label: 'All' },
];

export function MerchantsAdminPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // No status in the URL means the review queue; an empty status means "All".
  const status = params.get('status') ?? 'SUBMITTED';
  const page = Number(params.get('page') ?? 1);
  const query = new URLSearchParams(params);
  if (status) query.set('status', status);
  else query.delete('status');
  const q = useQuery({ queryKey: ['admin', 'merchants', query.toString()], queryFn: () => api<Paged<MerchantView>>(`/admin/merchants?${query}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Merchants" description="Review applications and manage approved merchants." />
      <div role="tablist" aria-label="Merchant status" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={status === t.value}
            onClick={() => set('status', t.value)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${status === t.value ? 'bg-ink-950 text-white' : 'bg-white text-ink-700 shadow-card hover:bg-ink-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input type="search" defaultValue={params.get('q') ?? ''} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} placeholder="Search name, SSM no. or email, then Enter" aria-label="Search" className="mb-4 min-h-11 w-full rounded-xl border border-ink-100 bg-white px-3.5" />
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load merchants.</Alert>}
      {q.data && q.data.data.length === 0 && <EmptyState title={status === 'SUBMITTED' ? 'Nothing to review' : 'No merchants here'} />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(m) => m.id}
            onRowClick={(m) => navigate(`/admin/merchants/${m.id}`)}
            columns={[
              { key: 'name', header: 'Business', cell: (m) => <span className="font-medium">{m.name}</span> },
              { key: 'type', header: 'Type', cell: (m) => m.businessType },
              { key: 'where', header: 'Location', cell: (m) => [m.city, m.state].filter(Boolean).join(', ') || '—' },
              { key: 'status', header: 'Status', cell: (m) => <Badge tone={merchantStatusTone[m.status]}>{merchantStatusLabel[m.status]}</Badge> },
              { key: 'sub', header: 'Submitted', cell: (m) => formatDateTime(m.submittedAt) },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </>
  );
}
