import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Redemption } from '@/features/vouchers/types';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '../types';

const UNDO_HOURS = 24;

export function RedemptionsAdminPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const [undoing, setUndoing] = useState<Redemption | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'redemptions', params.toString()], queryFn: () => api<Paged<Redemption>>(`/admin/redemptions?${params}`), placeholderData: keepPreviousData });
  const undo = useMutation({
    mutationFn: () => api(`/admin/redemptions/${undoing!.id}/reverse`, { method: 'POST', json: { reason } }),
    onSuccess: async () => {
      setUndoing(null);
      setReason('');
      await qc.invalidateQueries({ queryKey: ['admin', 'redemptions'] });
    },
  });
  const canUndo = (r: Redemption) => can('vouchers.manage') && !r.reversedAt && Date.now() - new Date(r.at).getTime() < UNDO_HOURS * 3600_000;

  return (
    <>
      <PageHeader title="Redemptions" description={`Vouchers used at merchants. A redemption made by mistake can be undone within ${UNDO_HOURS} hours.`} />
      <form
        className="mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          const code = new FormData(e.currentTarget).get('code')?.toString().trim() ?? '';
          setParams(code ? { code } : {});
        }}
      >
        <input name="code" type="search" defaultValue={params.get('code') ?? ''} placeholder="Voucher code, then Enter" aria-label="Voucher code" className="min-h-11 w-full rounded-xl border border-ink-100 bg-white px-3.5 sm:max-w-sm" />
      </form>
      {undoing && (
        <Card className="mb-4">
          <h2 className="font-semibold">Undo redemption of {undoing.code}?</h2>
          <p className="mt-1 text-sm text-ink-500">{undoing.title} at {undoing.merchant} ({undoing.outlet}), {formatDateTime(undoing.at)}. The member gets the voucher back if it has not expired.</p>
          <Field className="mt-3" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cashier scanned the wrong phone" />
          {undo.error && <div className="mt-3"><Alert tone="danger">{undo.error instanceof ApiError ? undo.error.message : 'Could not undo'}</Alert></div>}
          <div className="mt-3 flex gap-2">
            <Button disabled={undo.isPending || reason.trim().length < 5} onClick={() => undo.mutate()}>Undo redemption</Button>
            <Button variant="ghost" onClick={() => setUndoing(null)}>Cancel</Button>
          </div>
        </Card>
      )}
      {q.isLoading && <Spinner />}
      {q.isError && <Alert tone="danger">Could not load redemptions.</Alert>}
      {q.data?.data.length === 0 && <EmptyState title="No redemptions" />}
      {q.data && q.data.data.length > 0 && (
        <>
          <DataTable
            rows={q.data.data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'at', header: 'When', cell: (r) => formatDateTime(r.at) },
              { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
              { key: 'title', header: 'Voucher', cell: (r) => <span className="font-medium">{r.title}</span> },
              { key: 'merchant', header: 'Merchant', cell: (r) => `${r.merchant} · ${r.outlet}` },
              { key: 'member', header: 'Member', cell: (r) => r.member.email ?? r.member.name },
              { key: 'staff', header: 'Staff', cell: (r) => r.staff },
              {
                key: 'act',
                header: '',
                cell: (r) => (r.reversedAt ? <Badge tone="warning">Undone</Badge> : canUndo(r) ? <Button variant="secondary" onClick={() => setUndoing(r)}>Undo</Button> : null),
              },
            ]}
          />
          <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => setParams({ ...Object.fromEntries(params), page: String(p) })} />
        </>
      )}
    </>
  );
}
