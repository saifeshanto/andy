import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface Item { kind: 'NEW' | 'CHANGES'; listingId: string; revisionId: string | null; title: string; merchant: string; at: string }

export function ListingApprovalsPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['admin', 'listing-approvals'], queryFn: () => api<{ data: Item[] }>('/admin/listing-approvals').then((r) => r.data) });
  return (
    <>
      <PageHeader title="Listing approvals" description="New listings and changes to live listings, oldest first." />
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load the queue.</Alert>}
      {q.data?.length === 0 && <EmptyState title="Nothing to review" />}
      {q.data && q.data.length > 0 && (
        <DataTable
          rows={q.data}
          rowKey={(r) => `${r.kind}-${r.revisionId ?? r.listingId}`}
          onRowClick={(r) => navigate(`/admin/listings/${r.listingId}`)}
          columns={[
            { key: 'kind', header: 'Type', cell: (r) => <Badge tone={r.kind === 'NEW' ? 'warning' : 'neutral'}>{r.kind === 'NEW' ? 'New listing' : 'Changes'}</Badge> },
            { key: 'title', header: 'Listing', cell: (r) => <span className="font-medium">{r.title}</span> },
            { key: 'merchant', header: 'Merchant', cell: (r) => r.merchant },
            { key: 'at', header: 'Sent', cell: (r) => formatDateTime(r.at) },
          ]}
        />
      )}
    </>
  );
}
