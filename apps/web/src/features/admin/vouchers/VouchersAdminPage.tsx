import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { campaignStatusLabel, campaignStatusTone, type CampaignStatus, type CampaignView } from '@/features/vouchers/types';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Paged } from '../types';

const TABS: { value: CampaignStatus | ''; label: string }[] = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Live' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: 'ENDED', label: 'Ended' },
  { value: '', label: 'All' },
];

export function VouchersAdminPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Reviewers land on the queue; read-only staff land on everything.
  const status = params.get('status') ?? (can('vouchers.review') ? 'PENDING' : '');
  const page = Number(params.get('page') ?? 1);
  const qs = new URLSearchParams({ ...(status ? { status } : {}), page: String(page) });
  const q = useQuery({ queryKey: ['admin', 'vouchers', qs.toString()], queryFn: () => api<Paged<CampaignView & { merchant: string }>>(`/admin/vouchers?${qs}`), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Vouchers" description="Merchant voucher offers. New offers wait here for approval, oldest first." />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setParams({ status: t.value })} aria-pressed={status === t.value} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${status === t.value ? 'bg-ink-950 text-white' : 'bg-white shadow-card hover:bg-ink-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load vouchers.</Alert>}
      {q.data?.data.length === 0 && <EmptyState title={status === 'PENDING' ? 'Nothing to review' : 'No vouchers'} />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/admin/vouchers/${c.id}`)}
            columns={[
              { key: 'title', header: 'Voucher', cell: (c) => <span className="font-medium">{c.title}</span> },
              { key: 'benefit', header: 'Benefit', cell: (c) => c.benefit },
              { key: 'merchant', header: 'Merchant', cell: (c) => c.merchant },
              { key: 'status', header: 'Status', cell: (c) => <Badge tone={campaignStatusTone[c.status]}>{campaignStatusLabel[c.status]}</Badge> },
              { key: 'claimed', header: 'Claimed / used', cell: (c) => `${c.claimedCount}${c.totalQty != null ? `/${c.totalQty}` : ''} · ${c.redeemedCount}` },
              { key: 'when', header: status === 'PENDING' ? 'Sent' : 'Claim by', cell: (c) => (status === 'PENDING' ? formatDateTime(c.submittedAt) : formatDate(c.claimEndAt)) },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => setParams({ status, page: String(p) })} />
        </>
      )}
    </>
  );
}
