import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { UserStatusBadge } from '../StatusBadge';
import type { AdminUser, Paged } from '../types';

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') ?? '');
  const page = Number(params.get('page') ?? 1);
  const status = params.get('status') ?? '';

  const query = useQuery({
    queryKey: ['admin', 'users', params.toString()],
    queryFn: () => api<Paged<AdminUser>>(`/admin/users?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Users" description="Everyone with an account." />
      <form
        className="mb-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q });
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email or phone"
          aria-label="Search users"
          className="min-h-11 flex-1 rounded-xl border border-ink-100 bg-white px-3.5"
        />
        <select value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Filter by status" className="min-h-11 rounded-xl border border-ink-100 bg-white px-3">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_VERIFICATION">Unverified</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </form>
      {query.isError && <Alert tone="danger">Could not load users.</Alert>}
      {query.isLoading && <Spinner />}
      {query.data && query.data.data.length === 0 && <EmptyState title="No users found">Try a different search.</EmptyState>}
      {query.data && query.data.data.length > 0 && (
        <>
          <DataTable
            rows={query.data.data}
            rowKey={(u) => u.id}
            onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
            columns={[
              { key: 'name', header: 'Name', cell: (u) => <span className="font-medium">{u.fullName}</span> },
              { key: 'email', header: 'Email', cell: (u) => u.email },
              { key: 'status', header: 'Status', cell: (u) => <UserStatusBadge status={u.status} /> },
              { key: 'roles', header: 'Roles', cell: (u) => (u.roles.length ? u.roles.join(', ') : '—') },
              { key: 'joined', header: 'Joined', cell: (u) => formatDate(u.createdAt) },
            ]}
          />
          <Pager page={page} totalPages={query.data.meta.totalPages} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </>
  );
}
