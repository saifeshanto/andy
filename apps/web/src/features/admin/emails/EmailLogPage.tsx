import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '../types';

interface EmailRow {
  id: string;
  toEmail: string;
  subject: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

const tone = { QUEUED: 'neutral', SENDING: 'neutral', SENT: 'success', FAILED: 'danger' } as const;

export function EmailLogPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const q = useQuery({
    queryKey: ['admin', 'emails', params.toString()],
    queryFn: () => api<Paged<EmailRow>>(`/admin/emails?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/admin/emails/${id}/retry`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'emails'] }),
  });

  return (
    <>
      <PageHeader title="Email log" description="Emails are sent by the scheduled job every few minutes." />
      <select
        value={status}
        onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}
        aria-label="Filter by status"
        className="mb-4 min-h-11 rounded-xl border border-ink-100 bg-white px-3"
      >
        <option value="">All</option>
        <option value="QUEUED">Queued</option>
        <option value="SENT">Sent</option>
        <option value="FAILED">Failed</option>
      </select>
      {q.isError && <Alert tone="danger">Could not load emails.</Alert>}
      {q.isLoading && <Spinner />}
      {q.data && q.data.data.length === 0 && <EmptyState title="No emails" />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'created', header: 'Queued', cell: (r) => formatDateTime(r.createdAt) },
              { key: 'to', header: 'To', cell: (r) => r.toEmail },
              { key: 'subject', header: 'Subject', cell: (r) => r.subject },
              {
                key: 'status',
                header: 'Status',
                cell: (r) => (
                  <span title={r.lastError ?? undefined}>
                    <Badge tone={tone[r.status]}>{r.status.toLowerCase()}</Badge>
                  </span>
                ),
              },
              {
                key: 'action',
                header: '',
                cell: (r) =>
                  r.status === 'FAILED' && can('emails.manage') ? (
                    <Button variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(r.id)}>
                      Retry
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => setParams({ ...(status ? { status } : {}), page: String(p) })} />
        </>
      )}
    </>
  );
}
