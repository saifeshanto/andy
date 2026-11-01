import { useQuery } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { campaignStatusLabel, campaignStatusTone, type CampaignView } from '@/features/vouchers/types';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { usePortal } from './PortalContext';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'APPROVED', label: 'Live' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: 'ENDED', label: 'Ended' },
];

export function VouchersPage() {
  const { id, base, can, merchant } = usePortal();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = useQuery({ queryKey: ['merchant-portal', id, 'vouchers', status], queryFn: () => api<{ data: CampaignView[] }>(`/merchant/${id}/vouchers${status ? `?status=${status}` : ''}`).then((r) => r.data) });
  const canEdit = can('vouchers.manage') && merchant.status === 'APPROVED';

  return (
    <>
      <PageHeader
        title="Vouchers"
        description="Offers members claim and use at your counter, such as a free car wash or RM20 off. New vouchers are checked by our team first."
        actions={canEdit ? <Link to={`${base}/vouchers/new`}><Button>New voucher</Button></Link> : null}
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setParams(f.value ? { status: f.value } : {})} aria-pressed={status === f.value} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${status === f.value ? 'bg-ink-950 text-white' : 'bg-white shadow-card hover:bg-ink-50'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {q.isLoading && <Spinner />}
      {q.data?.length === 0 && <EmptyState title="No vouchers here yet">{canEdit ? 'Create an offer to bring members to your shop.' : null}</EmptyState>}
      <ul className="grid gap-3">
        {q.data?.map((c) => (
          <li key={c.id}>
            <Link to={`${base}/vouchers/${c.id}`} className="flex gap-4 rounded-card bg-white p-3 shadow-card hover:shadow-lg sm:p-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-accent-500/10 text-accent-500"><Ticket className="size-7" aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={campaignStatusTone[c.status]}>{campaignStatusLabel[c.status]}</Badge>
                  <span className="text-sm font-semibold text-accent-500">{c.benefit}</span>
                  {c.memberOnly && <Badge>Members only</Badge>}
                </div>
                <p className="mt-1.5 truncate font-semibold">{c.title}</p>
                <p className="text-sm text-ink-500">
                  {c.claimedCount}{c.totalQty != null ? ` of ${c.totalQty}` : ''} claimed · {c.redeemedCount} used · claim by {formatDate(c.claimEndAt)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
