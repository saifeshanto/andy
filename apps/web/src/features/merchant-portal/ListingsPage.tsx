import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { listingStatusLabel, listingStatusTone, type ListingView } from '@/features/listings/types';
import { api } from '@/lib/api';
import { usePortal } from './PortalContext';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'APPROVED', label: 'Live' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function ListingsPage() {
  const { id, base, can, merchant } = usePortal();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = useQuery({ queryKey: ['merchant-portal', id, 'listings', status], queryFn: () => api<{ data: ListingView[] }>(`/merchant/${id}/listings${status ? `?status=${status}` : ''}`).then((r) => r.data) });
  const canEdit = can('listings.manage') && merchant.status === 'APPROVED';

  return (
    <>
      <PageHeader
        title="Listings"
        description="Products and services shown in the marketplace. New listings and changes to price, title, description or photos are checked by our team first."
        actions={canEdit ? <Link to={`${base}/listings/new`}><Button>New listing</Button></Link> : null}
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setParams(f.value ? { status: f.value } : {})} aria-pressed={status === f.value} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${status === f.value ? 'bg-ink-950 text-white' : 'bg-white shadow-card hover:bg-ink-50'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {q.isLoading && <Spinner />}
      {q.data?.length === 0 && <EmptyState title="No listings here yet">{canEdit ? 'Add your first product or service.' : null}</EmptyState>}
      <ul className="grid gap-3">
        {q.data?.map((l) => (
          <li key={l.id}>
            <Link to={`${base}/listings/${l.id}`} className="flex gap-4 rounded-card bg-white p-3 shadow-card hover:shadow-lg sm:p-4">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-50 sm:size-24">
                {l.images[0] ? <img src={l.images[0].url} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff className="size-6 text-ink-300" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={listingStatusTone[l.status]}>{listingStatusLabel[l.status]}</Badge>
                  {l.pendingChanges && <Badge tone="warning">Changes waiting</Badge>}
                  {l.status === 'APPROVED' && !l.isAvailable && <Badge>Hidden</Badge>}
                </div>
                <p className="mt-1.5 truncate font-semibold">{l.title}</p>
                <p className="text-sm text-ink-500">
                  {l.category?.name} · <MoneyRM sen={l.priceSen} />
                  {l.memberPriceSen != null && <> · members <MoneyRM sen={l.memberPriceSen} /></>}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
