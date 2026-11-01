import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '../types';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { email: string | null; name: string | null } | null;
}

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => api<Paged<AuditRow>>(`/admin/audit-log?page=${page}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="Audit log" description="Every admin action and sensitive change, newest first." />
      {q.isError && <Alert tone="danger">Could not load the audit log.</Alert>}
      {q.isLoading && <Spinner />}
      {q.data && q.data.data.length === 0 && <EmptyState title="Nothing recorded yet" />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: 'When', cell: (r) => formatDateTime(r.createdAt) },
              { key: 'who', header: 'By', cell: (r) => r.actor?.email ?? 'System' },
              { key: 'action', header: 'Action', cell: (r) => <code className="text-xs">{r.action}</code> },
              { key: 'entity', header: 'Record', cell: (r) => `${r.entityType}${r.entityId ? ` #${r.entityId}` : ''}` },
              { key: 'change', header: 'Change', cell: (r) => <span className="text-xs text-ink-500">{show(r.before)} → {show(r.after)}</span> },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={setPage} />
        </>
      )}
    </>
  );
}
