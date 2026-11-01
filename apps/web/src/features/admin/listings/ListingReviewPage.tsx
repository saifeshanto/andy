import { formatRM } from '@andy/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDuration, listingStatusLabel, listingStatusTone, type ListingView } from '@/features/listings/types';
import { api, ApiError } from '@/lib/api';

type Detail = ListingView & {
  merchant: { id: string; name: string; status: string };
  outlets: { id: string; name: string; city: string; state: string }[];
  pendingImages: { id: string; url: string }[] | null;
  categoryNames: Record<string, string>;
};

const LABELS: Record<string, string> = { type: 'Type', categoryId: 'Category', title: 'Title', description: 'Description', priceSen: 'Price', memberPriceSen: 'Member price', imageFileIds: 'Photos' };

export function ListingReviewPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'listing', id], queryFn: () => api<{ data: Detail }>(`/admin/listings/${id}`).then((r) => r.data) });
  const [note, setNote] = useState('');
  const act = useMutation({
    mutationFn: (path: string) => api(path, { method: 'POST', json: note.trim() ? { note } : {} }),
    onSuccess: () => {
      setNote('');
      void qc.invalidateQueries({ queryKey: ['admin', 'listing', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'listing-approvals'] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Listing not found.</Alert>;
  const l = q.data;
  const rev = l.pendingChanges;
  const show = (k: string, v: unknown) => {
    if (k === 'priceSen' || k === 'memberPriceSen') return v == null ? '—' : formatRM(v as number);
    if (k === 'categoryId') return l.categoryNames[String(v)] ?? String(v);
    if (k === 'type') return v === 'SERVICE' ? 'Service' : 'Product';
    return String(v ?? '—');
  };
  const current: Record<string, unknown> = { type: l.type, categoryId: l.category?.id, title: l.title, description: l.description, priceSen: l.priceSen, memberPriceSen: l.memberPriceSen };
  const reviewing = can('listings.review') && (l.status === 'PENDING' || !!rev);
  const base = rev ? `/admin/listing-revisions/${rev.id}` : `/admin/listings/${l.id}`;

  return (
    <>
      <Link to="/admin/listings" className="text-sm text-ink-500 underline">← Listing approvals</Link>
      <PageHeader title={l.title} description={`${l.merchant.name} · ${l.category?.name ?? ''}`} actions={<Badge tone={listingStatusTone[l.status]}>{listingStatusLabel[l.status]}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {rev && (
            <Card>
              <h2 className="font-semibold">Requested changes</h2>
              <dl className="mt-3 space-y-3 text-sm">
                {Object.entries(rev.data).filter(([k]) => k !== 'imageFileIds').map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-medium">{LABELS[k] ?? k}</dt>
                    <dd className="mt-1 grid gap-1 sm:grid-cols-2">
                      <span className="rounded-lg bg-danger-500/5 px-2 py-1 whitespace-pre-line line-through decoration-danger-500/50">{show(k, current[k])}</span>
                      <span className="rounded-lg bg-success-500/5 px-2 py-1 whitespace-pre-line">{show(k, v)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              {l.pendingImages && (
                <>
                  <p className="mt-4 text-sm font-medium">New photos</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">{l.pendingImages.map((i) => <img key={i.id} src={i.url} alt="" className="aspect-square rounded-lg object-cover" />)}</div>
                </>
              )}
            </Card>
          )}
          <Card>
            <h2 className="font-semibold">{rev ? 'Live version' : 'Listing'}</h2>
            <div className="mt-3 grid grid-cols-4 gap-2">{l.images.map((i) => <img key={i.id} src={i.url} alt="" className="aspect-square rounded-lg object-cover" />)}</div>
            <p className="mt-4 text-lg font-semibold"><MoneyRM sen={l.priceSen} />{l.memberPriceSen != null && <span className="ml-2 text-sm font-normal text-ink-500">members <MoneyRM sen={l.memberPriceSen} /></span>}</p>
            <p className="mt-1 text-sm text-ink-500">{l.type === 'SERVICE' ? `Service${l.durationMinutes ? ` · ${formatDuration(l.durationMinutes)}` : ''}` : `Product${l.stockQty != null ? ` · ${l.stockQty} in stock` : ''}`}</p>
            <p className="mt-3 whitespace-pre-line text-ink-700">{l.description}</p>
            <p className="mt-3 text-sm text-ink-500">Outlets: {l.outlets.map((o) => `${o.name} (${o.city})`).join(', ') || '—'}</p>
          </Card>
        </div>
        {reviewing && (
          <Card>
            <h2 className="font-semibold">Decision</h2>
            <label htmlFor="note" className="mt-4 block text-sm font-medium">Note to the merchant</label>
            <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-xl border border-ink-100 px-3.5 py-2.5" />
            <p className="mt-1 text-xs text-ink-500">Required to reject. Emailed to the merchant.</p>
            {act.isError && <div className="mt-3"><Alert tone="danger">{act.error instanceof ApiError ? act.error.message : 'Something went wrong'}</Alert></div>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={act.isPending} onClick={() => act.mutate(`${base}/approve`)}>{rev ? 'Approve changes' : 'Approve'}</Button>
              <Button variant="danger" disabled={act.isPending || note.trim().length < 5} onClick={() => act.mutate(`${base}/reject`)}>Reject</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
