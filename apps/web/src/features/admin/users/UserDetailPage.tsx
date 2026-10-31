import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { UserStatusBadge } from '../StatusBadge';
import type { AdminUser, RoleInfo } from '../types';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const user = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<{ data: AdminUser }>(`/admin/users/${id}`).then((r) => r.data) });
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api<{ data: { roles: RoleInfo[] } }>('/admin/roles').then((r) => r.data.roles),
    enabled: can('roles.read'),
  });

  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected(user.data?.roles ?? []), [user.data]);

  const onDone = (data: AdminUser) => {
    qc.setQueryData(['admin', 'user', id], data);
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  };
  const statusChange = useMutation({
    mutationFn: (action: 'suspend' | 'unsuspend') => api<{ data: AdminUser }>(`/admin/users/${id}/${action}`, { method: 'POST', json: { reason } }).then((r) => r.data),
    onSuccess: (data) => {
      setReason('');
      onDone(data);
    },
  });
  const saveRoles = useMutation({
    mutationFn: () => api<{ data: AdminUser }>(`/admin/users/${id}/roles`, { method: 'PUT', json: { roles: selected } }).then((r) => r.data),
    onSuccess: onDone,
  });

  if (user.isLoading) return <Spinner />;
  if (user.isError || !user.data) return <Alert tone="danger">User not found.</Alert>;
  const u = user.data;
  const isSelf = me?.id === u.id;
  const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

  return (
    <>
      <Link to="/admin/users" className="text-sm text-ink-500 underline">
        ← All users
      </Link>
      <PageHeader title={u.fullName} description={u.email} actions={<UserStatusBadge status={u.status} />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card flush className="divide-y divide-ink-100">
          {(
            [
              ['Phone', u.phone ?? '—'],
              ['Email confirmed', u.emailVerified ? 'Yes' : 'No'],
              ['Joined', formatDateTime(u.createdAt)],
              ['Last sign-in', formatDateTime(u.lastLoginAt)],
              ['User ID', u.id],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-6 py-3.5 text-sm">
              <span className="text-ink-500">{k}</span>
              <span className="text-right break-all">{v}</span>
            </div>
          ))}
        </Card>

        {can('users.manage') && !isSelf && (
          <Card>
            <h2 className="font-semibold">{u.status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account'}</h2>
            <p className="mt-1 text-sm text-ink-500">
              {u.status === 'SUSPENDED' ? 'The user will be able to sign in again.' : 'Signs the user out everywhere and blocks sign-in.'} The reason is saved in the audit log.
            </p>
            <label className="mt-4 block text-sm font-medium" htmlFor="reason">
              Reason
            </label>
            <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-ink-100 px-3.5 py-2.5" />
            {statusChange.isError && <div className="mt-3"><Alert tone="danger">{errorText(statusChange.error)}</Alert></div>}
            <Button
              className="mt-3"
              variant={u.status === 'SUSPENDED' ? 'primary' : 'danger'}
              disabled={reason.trim().length < 3 || statusChange.isPending}
              onClick={() => statusChange.mutate(u.status === 'SUSPENDED' ? 'unsuspend' : 'suspend')}
            >
              {u.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
            </Button>
          </Card>
        )}

        {can('roles.assign') && roles.data && (
          <Card>
            <h2 className="font-semibold">Admin roles</h2>
            <p className="mt-1 text-sm text-ink-500">Leave all unticked for a normal user.</p>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Roles</legend>
              {roles.data.map((r) => (
                <label key={r.key} className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-ink-50">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-accent-500"
                    checked={selected.includes(r.key)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.key] : s.filter((k) => k !== r.key)))}
                  />
                  <span>
                    <span className="block text-sm font-medium">{r.name}</span>
                    <span className="block text-xs text-ink-500">{r.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {saveRoles.isError && <div className="mt-3"><Alert tone="danger">{errorText(saveRoles.error)}</Alert></div>}
            {saveRoles.isSuccess && <div className="mt-3"><Alert tone="success">Roles saved.</Alert></div>}
            <Button className="mt-3" disabled={saveRoles.isPending} onClick={() => saveRoles.mutate()}>
              Save roles
            </Button>
          </Card>
        )}
      </div>
    </>
  );
}
