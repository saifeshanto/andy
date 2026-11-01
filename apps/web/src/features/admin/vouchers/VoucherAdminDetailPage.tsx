import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextAreaField } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { campaignStatusLabel, campaignStatusTone, type CampaignView } from '@/features/vouchers/types';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';

type Detail = CampaignView & { merchant: { id: string; name: string; status: string }; outlets: { id: string; name: string; city: string; state: string; isActive: boolean }[] };

export function VoucherAdminDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['admin', 'voucher', id], queryFn: () => api<{ data: Detail }>(`/admin/vouchers/${id}`).then((r) => r.data) });
  const act = useMutation({
    mutationFn: (a: 'approve' | 'reject' | 'end') => api(`/admin/vouchers/${id}/${a}`, { method: 'POST', json: a === 'reject' ? { note } : {} }),
    onSuccess: async () => {
      setNote('');
      await qc.invalidateQueries({ queryKey: ['admin', 'voucher', id] });
      await qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Voucher not found.</Alert>;
  const c = q.data;
  const rows: [string, React.ReactNode][] = [
    ['Merchant', <Link key="m" to={`/admin/merchants/${c.merchant.id}`} className="underline">{c.merchant.name}</Link>],
    ['Benefit', c.benefit],
    ['Who can claim', c.memberOnly ? 'Members only' : 'Any signed-in user with a confirmed email'],
    ['Quantity', c.totalQty == null ? 'Unlimited' : `${c.totalQty} (${c.claimedCount} claimed)`],
    ['Per member', String(c.perUserLimit)],
    ['Claim period', `${c.claimStartAt ? formatDate(c.claimStartAt) : 'From approval'} to ${formatDate(c.claimEndAt)}`],
    ['Use by', `${formatDate(c.validUntil)}${c.validDays ? `, or ${c.validDays} days after claiming if sooner` : ''}`],
    ['Outlets', c.outlets.map((o) => `${o.name} (${o.city})${o.isActive ? '' : ' [closed]'}`).join(', ') || '—'],
    ['Sent', formatDateTime(c.submittedAt)],
  ];

  return (
    <>
      <Link to="/admin/vouchers" className="inline-flex items-center gap-1 text-sm text-ink-500 underline"><ArrowLeft className="size-4" aria-hidden /> Vouchers</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{c.title}</h1>
        <Badge tone={campaignStatusTone[c.status]}>{campaignStatusLabel[c.status]}</Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card>
            <dl className="divide-y divide-ink-100 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]"><dt className="text-ink-500">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <h2 className="font-semibold">Terms</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{c.terms}</p>
          </Card>
        </div>
        <div className="space-y-4">
          {c.reviewNote && <Alert tone="danger"><strong>Last review note:</strong> {c.reviewNote}</Alert>}
          {act.error && <Alert tone="danger">{act.error instanceof ApiError ? act.error.message : 'Something went wrong'}</Alert>}
          {c.status === 'PENDING' && can('vouchers.review') && (
            <Card>
              <h2 className="font-semibold">Review</h2>
              <p className="mt-1 text-sm text-ink-500">Check the offer is clear and the terms are fair. Once approved, members can claim it and the terms cannot change.</p>
              <Button className="mt-4 w-full" disabled={act.isPending} onClick={() => act.mutate('approve')}>Approve</Button>
              <TextAreaField className="mt-4" label="Reason, if not approving" rows={3} value={note} onChange={(e) => setNote(e.target.value)} hint="The merchant sees this." />
              <Button variant="secondary" className="mt-2 w-full" disabled={act.isPending || note.trim().length < 5} onClick={() => act.mutate('reject')}>Do not approve</Button>
            </Card>
          )}
          {(c.status === 'APPROVED' || c.status === 'PAUSED') && can('vouchers.manage') && (
            <Card>
              <h2 className="font-semibold">Stop new claims</h2>
              <p className="mt-1 text-sm text-ink-500">Ends this offer. Vouchers members already hold can still be used until they expire.</p>
              <Button variant="secondary" className="mt-3 w-full" disabled={act.isPending} onClick={() => act.mutate('end')}>End voucher</Button>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
