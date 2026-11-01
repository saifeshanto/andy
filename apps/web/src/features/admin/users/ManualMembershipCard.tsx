import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

type Row = { status: string; startAt: string; endAt: string; user: { id?: string } };

/** Record a cash or bank-transfer membership payment for this user. The amount is always the plan price. */
export function ManualMembershipCard({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const plan = useQuery({
    queryKey: ['public', 'membership-plan'],
    queryFn: () => api<{ data: { name: string; priceSen: number; durationMonths: number } | null }>('/public/membership-plan').then((r) => r.data),
  });
  const terms = useQuery({
    queryKey: ['admin', 'memberships', 'user', userId],
    queryFn: () => api<{ data: Row[] }>(`/admin/memberships?q=${encodeURIComponent(email)}&pageSize=5`).then((r) => r.data.filter((m) => m.user.id === userId)),
  });
  const active = terms.data?.find((m) => m.status === 'ACTIVE' && new Date(m.endAt) > new Date());
  const record = useMutation({
    mutationFn: () =>
      api<{ data: { orderNo: string } }>(`/admin/users/${userId}/membership/manual-payment`, {
        method: 'POST',
        json: { reference, ...(note.trim() ? { note } : {}) },
      }).then((r) => r.data),
    onSuccess: () => {
      setReference('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['admin', 'memberships'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
  });

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Membership</h2>
        {active ? <Badge tone="success">Active until {formatDate(active.endAt)}</Badge> : <Badge>Not a member</Badge>}
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Record a membership paid by cash or bank transfer. This activates it straight away and emails the member a receipt.
        {plan.data && (
          <>
            {' '}Amount: <MoneyRM sen={plan.data.priceSen} /> for {plan.data.durationMonths} months.
          </>
        )}
      </p>
      <label className="mt-4 block text-sm font-medium" htmlFor="ref">
        Payment reference
      </label>
      <input
        id="ref"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="e.g. bank transfer ref or receipt no."
        className="mt-1.5 w-full rounded-xl border border-ink-100 px-3.5 py-2.5"
      />
      <label className="mt-3 block text-sm font-medium" htmlFor="note">
        Note <span className="font-normal text-ink-500">(optional)</span>
      </label>
      <input id="note" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-xl border border-ink-100 px-3.5 py-2.5" />
      {record.isError && (
        <div className="mt-3">
          <Alert tone="danger">{record.error instanceof ApiError ? record.error.message : 'Something went wrong'}</Alert>
        </div>
      )}
      {record.isSuccess && (
        <div className="mt-3">
          <Alert tone="success">Payment recorded (order {record.data.orderNo}). The membership is active.</Alert>
        </div>
      )}
      <Button className="mt-3" disabled={reference.trim().length < 3 || record.isPending} onClick={() => record.mutate()}>
        Record payment and activate
      </Button>
    </Card>
  );
}
