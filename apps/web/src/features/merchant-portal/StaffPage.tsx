import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useOutlets } from './OutletsPage';
import { portalKey, usePortal } from './PortalContext';

interface Member { id: string; role: 'OWNER' | 'MANAGER' | 'CASHIER'; status: 'ACTIVE' | 'DISABLED'; outletId: string | null; fullName?: string; email?: string; isMe: boolean }
interface Invite { id: string; email: string; role: string; outletId: string | null; expiresAt: string }

const ROLE_HELP = {
  MANAGER: 'Manages listings, outlets and cashiers.',
  CASHIER: 'Redeems member vouchers at the counter.',
};

export function StaffPage() {
  const { id, can, merchant } = usePortal();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['merchant-portal', id, 'staff'], queryFn: () => api<{ data: { members: Member[]; invites: Invite[] } }>(`/merchant/${id}/staff`).then((r) => r.data) });
  const outlets = useOutlets(id);
  const outletName = (oid: string | null) => (oid ? outlets.data?.find((o) => o.id === oid)?.name ?? '—' : 'All outlets');
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['merchant-portal', id, 'staff'] });
    await qc.invalidateQueries({ queryKey: portalKey(id) });
  };
  const writable = merchant.status === 'APPROVED';
  const roles = can('staff.manageManagers') ? (['CASHIER', 'MANAGER'] as const) : (['CASHIER'] as const);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'CASHIER'>('CASHIER');
  const [outletId, setOutletId] = useState('');
  const invite = useMutation({
    mutationFn: () => api(`/merchant/${id}/staff/invites`, { method: 'POST', json: { email, role, outletId: outletId || null } }),
    onSuccess: async () => {
      setEmail('');
      await refresh();
    },
  });
  const change = useMutation({
    mutationFn: ({ memberId, body }: { memberId: string; body: object }) => api(`/merchant/${id}/staff/${memberId}`, { method: 'PATCH', json: body }),
    onSuccess: refresh,
  });
  const revoke = useMutation({ mutationFn: (inviteId: string) => api(`/merchant/${id}/staff/invites/${inviteId}`, { method: 'DELETE' }), onSuccess: refresh });
  const canTouch = (m: Member) => writable && !m.isMe && m.role !== 'OWNER' && (m.role === 'CASHIER' || can('staff.manageManagers'));
  const error = invite.error ?? change.error ?? revoke.error;

  return (
    <>
      <PageHeader title="Staff" description="Everyone who can use this portal. Each person signs in with their own account." />
      {error && <div className="mb-4"><Alert tone="danger">{error instanceof ApiError ? error.message : 'Something went wrong'}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {q.isLoading && <Spinner />}
          <Card flush className="divide-y divide-ink-100">
            {q.data?.members.map((m) => (
              <div key={m.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{m.fullName}{m.isMe ? ' (you)' : ''}</p>
                  <p className="truncate text-sm text-ink-500">{m.email}</p>
                  <p className="mt-1 text-sm text-ink-500">{m.role === 'OWNER' ? 'Owner' : `${m.role === 'MANAGER' ? 'Manager' : 'Cashier'} · ${outletName(m.outletId)}`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.status === 'DISABLED' && <Badge tone="danger">Disabled</Badge>}
                  {canTouch(m) && (
                    <Button variant="secondary" disabled={change.isPending} onClick={() => change.mutate({ memberId: m.id, body: { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } })}>
                      {m.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
          {q.data && q.data.invites.length > 0 && (
            <Card>
              <h2 className="font-semibold">Waiting to accept</h2>
              <ul className="mt-3 divide-y divide-ink-100">
                {q.data.invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{i.email}</span><span className="text-ink-500">{i.role.toLowerCase()} · expires {formatDate(i.expiresAt)}</span></span>
                    {writable && <Button variant="secondary" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>Cancel invite</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        {writable && (
          <Card>
            <h2 className="font-semibold">Invite someone</h2>
            <p className="mt-1 text-sm text-ink-500">We email them a link. They join with an account using this email address.</p>
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate();
              }}
            >
              <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <SelectField label="Role" options={roles.map((r) => ({ value: r, label: r === 'MANAGER' ? 'Manager' : 'Cashier' }))} value={role} onChange={(e) => setRole(e.target.value as 'MANAGER' | 'CASHIER')} hint={ROLE_HELP[role]} />
              <SelectField label="Outlet" options={[{ value: '', label: 'All outlets' }, ...(outlets.data ?? []).filter((o) => o.isActive).map((o) => ({ value: o.id, label: o.name }))]} value={outletId} onChange={(e) => setOutletId(e.target.value)} />
              {invite.isSuccess && <Alert tone="success">Invitation sent.</Alert>}
              <Button type="submit" disabled={invite.isPending || !email}>{invite.isPending ? 'Sending…' : 'Send invitation'}</Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
