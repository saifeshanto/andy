import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField, TextAreaField } from '@/components/ui/Field';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { listingStatusLabel, listingStatusTone, toRM, toSen, useCategories, type ListingType, type ListingView } from '@/features/listings/types';
import { api, ApiError, uploadFile } from '@/lib/api';
import { useOutlets } from './OutletsPage';
import { portalKey, usePortal } from './PortalContext';

interface FormState {
  type: ListingType;
  categoryId: string;
  title: string;
  description: string;
  price: string;
  memberPrice: string;
  stockQty: string;
  durationMinutes: string;
  isAvailable: boolean;
  outletIds: string[];
  images: { id: string; url: string }[];
}

function fromListing(l?: ListingView): FormState {
  const pending = l?.pendingChanges?.data ?? {};
  const pick = <K extends keyof ListingView>(k: K) => (k in pending ? (pending[k as string] as ListingView[K]) : l?.[k]);
  return {
    type: pick('type') ?? 'PRODUCT',
    categoryId: String(pick('categoryId' as keyof ListingView) ?? l?.category?.id ?? ''),
    title: pick('title') ?? '',
    description: pick('description') ?? '',
    price: toRM(pick('priceSen')),
    memberPrice: toRM(pick('memberPriceSen')),
    stockQty: l?.stockQty == null ? '' : String(l.stockQty),
    durationMinutes: l?.durationMinutes == null ? '' : String(l.durationMinutes),
    isAvailable: l?.isAvailable ?? true,
    outletIds: l?.outletIds ?? [],
    images: Array.isArray(pending.imageFileIds) ? (pending.imageFileIds as string[]).map((id) => ({ id, url: `/api/v1/files/${id}` })) : (l?.images ?? []),
  };
}

export function ListingEditorPage() {
  const { listingId } = useParams();
  const isNew = !listingId;
  const { id, base } = usePortal();
  const q = useQuery({
    queryKey: ['merchant-portal', id, 'listing', listingId],
    queryFn: () => api<{ data: ListingView }>(`/merchant/${id}/listings/${listingId}`).then((r) => r.data),
    enabled: !isNew,
  });
  if (!isNew && q.isLoading) return <Spinner />;
  if (!isNew && (q.isError || !q.data)) return <Alert tone="danger">Listing not found.</Alert>;
  return (
    <>
      <Link to={`${base}/listings`} className="inline-flex items-center gap-1 text-sm text-ink-500 underline"><ArrowLeft className="size-4" aria-hidden /> All listings</Link>
      <Editor key={q.data?.updatedAt ?? 'new'} listing={q.data} />
    </>
  );
}

function Editor({ listing }: { listing?: ListingView }) {
  const { id, base, can, merchant } = usePortal();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const categories = useCategories();
  const outlets = useOutlets(id);
  const [f, setF] = useState<FormState>(() => fromListing(listing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const status = listing?.status;
  const locked = status === 'PENDING' || status === 'ARCHIVED' || !can('listings.manage') || merchant.status !== 'APPROVED';

  const refresh = async (l?: ListingView) => {
    await qc.invalidateQueries({ queryKey: ['merchant-portal', id, 'listings'] });
    await qc.invalidateQueries({ queryKey: portalKey(id) });
    if (l) qc.setQueryData(['merchant-portal', id, 'listing', l.id], l);
  };

  const body = () => {
    const e: Record<string, string> = {};
    const priceSen = toSen(f.price);
    const memberPriceSen = f.memberPrice.trim() ? toSen(f.memberPrice) : null;
    if (!f.categoryId) e.categoryId = 'Choose a category';
    if (f.title.trim().length < 3) e.title = 'Enter a title';
    if (f.description.trim().length < 10) e.description = 'Describe it in at least 10 characters';
    if (!priceSen) e.price = 'Enter a price, e.g. 180 or 180.50';
    if (memberPriceSen === undefined) e.memberPrice = 'Enter a valid amount or leave empty';
    else if (memberPriceSen !== null && priceSen && memberPriceSen > priceSen) e.memberPrice = 'Member price cannot be higher than the normal price';
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      type: f.type,
      categoryId: Number(f.categoryId),
      title: f.title.trim(),
      description: f.description.trim(),
      priceSen,
      memberPriceSen,
      stockQty: f.type === 'PRODUCT' && f.stockQty.trim() ? Number(f.stockQty) : null,
      durationMinutes: f.type === 'SERVICE' && f.durationMinutes.trim() ? Number(f.durationMinutes) : null,
      isAvailable: f.isAvailable,
      outletIds: f.outletIds,
      imageFileIds: f.images.map((i) => i.id),
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      const b = body();
      if (!b) throw new Error('invalid');
      const url = listing ? `/merchant/${id}/listings/${listing.id}` : `/merchant/${id}/listings`;
      return api<{ data: ListingView }>(url, { method: listing ? 'PATCH' : 'POST', json: b }).then((r) => r.data);
    },
    onMutate: () => {
      setFormError(null);
      setSaved(null);
    },
    onSuccess: async (l) => {
      await refresh(l);
      if (!listing) navigate(`${base}/listings/${l.id}`, { replace: true });
      setSaved(l.status === 'APPROVED' && l.pendingChanges ? 'Saved. Changes to price, title, description or photos will go live once approved.' : 'Saved.');
    },
    onError: (err) => {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setErrors(Object.fromEntries((err.details as { path: string[]; message: string }[]).map((d) => [d.path[0] === 'priceSen' ? 'price' : d.path[0] === 'memberPriceSen' ? 'memberPrice' : d.path[0]!, d.message])));
      }
      if (err instanceof ApiError) setFormError(err.message);
    },
  });
  const action = useMutation({
    mutationFn: (a: 'submit' | 'archive' | 'cancel') =>
      a === 'cancel'
        ? api(`/merchant/${id}/listings/${listing!.id}/pending-changes`, { method: 'DELETE' })
        : api(`/merchant/${id}/listings/${listing!.id}/${a}`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['merchant-portal', id, 'listing', listing!.id] });
      await refresh();
    },
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const addPhotos = async (files: FileList) => {
    setUploading(true);
    setFormError(null);
    try {
      for (const file of Array.from(files).slice(0, 8 - f.images.length)) {
        const up = await uploadFile(file, 'LISTING_IMAGE');
        setF((s) => ({ ...s, images: [...s.images, { id: up.id, url: up.url }] }));
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const activeOutlets = (outlets.data ?? []).filter((o) => o.isActive || f.outletIds.includes(o.id));
  const actionError = action.error instanceof ApiError ? action.error.message : action.error ? 'Something went wrong' : null;

  return (
    <div className="mt-2">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{listing ? listing.title : 'New listing'}</h1>
        {status && <Badge tone={listingStatusTone[status]}>{listingStatusLabel[status]}</Badge>}
      </div>
      {status === 'REJECTED' && listing?.reviewNote && <div className="mb-4"><Alert tone="danger"><strong>Not approved:</strong> {listing.reviewNote} Edit and send it again.</Alert></div>}
      {status === 'PENDING' && <div className="mb-4"><Alert tone="warning">Waiting for approval. You can edit it again after the review.</Alert></div>}
      {listing?.pendingChanges && (
        <div className="mb-4">
          <Alert tone="warning">
            Your latest changes are waiting for approval. Members still see the live version (<MoneyRM sen={listing.priceSen} />).{' '}
            {!locked && <button className="font-semibold underline" onClick={() => action.mutate('cancel')}>Discard changes</button>}
          </Alert>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <fieldset disabled={locked} className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
              {(['PRODUCT', 'SERVICE'] as const).map((t) => (
                <label key={t} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${f.type === t ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-100'}`}>
                  <input type="radio" name="type" value={t} checked={f.type === t} onChange={() => set('type', t)} className="sr-only" />
                  {t === 'PRODUCT' ? 'Product' : 'Service'}
                </label>
              ))}
            </div>
            <SelectField label="Category" options={(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} placeholder="Choose a category" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} error={errors.categoryId} />
            <Field label="Title" value={f.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder={f.type === 'PRODUCT' ? 'e.g. Michelin Pilot Sport 5 225/45R17' : 'e.g. Full service with engine oil change'} />
            <TextAreaField label="Description" rows={6} value={f.description} onChange={(e) => set('description', e.target.value)} error={errors.description} hint="What is included, brands, warranty, anything a customer should know." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (RM)" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} error={errors.price} placeholder="0.00" />
              <Field label="Member price (RM)" inputMode="decimal" value={f.memberPrice} onChange={(e) => set('memberPrice', e.target.value)} error={errors.memberPrice} placeholder="Optional" hint="Shown to Andy Auto Club members." />
              {f.type === 'PRODUCT' ? (
                <Field label="Stock" inputMode="numeric" value={f.stockQty} onChange={(e) => set('stockQty', e.target.value.replace(/\D/g, ''))} placeholder="Optional" hint="Leave empty if you do not track stock." />
              ) : (
                <Field label="Takes about (minutes)" inputMode="numeric" value={f.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value.replace(/\D/g, ''))} placeholder="e.g. 90" />
              )}
            </div>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-4 accent-accent-500" checked={f.isAvailable} onChange={(e) => set('isAvailable', e.target.checked)} />
              <span className="text-sm">Available now <span className="text-ink-500">(untick to hide it without deleting)</span></span>
            </label>
          </fieldset>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Photos</h2>
            <p className="mt-1 text-sm text-ink-500">The first photo is the cover. Up to 8, JPG, PNG or WebP, 3 MB each.</p>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {f.images.map((img, i) => (
                <li key={img.id} className="relative aspect-square overflow-hidden rounded-xl bg-ink-50">
                  <img src={img.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                  {i === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-ink-950/80 px-2 py-0.5 text-xs text-white">Cover</span>}
                  {!locked && (
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => set('images', f.images.filter((x) => x.id !== img.id))} className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-white/90 shadow">
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
              {!locked && f.images.length < 8 && (
                <li>
                  <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-ink-300 text-ink-500 hover:bg-ink-50">
                    <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="size-6" aria-hidden />{uploading ? 'Uploading…' : 'Add photo'}</span>
                  </button>
                </li>
              )}
            </ul>
            <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Add photos" onChange={(e) => e.target.files && void addPhotos(e.target.files)} />
          </Card>
          <Card>
            <h2 className="font-semibold">Where</h2>
            <p className="mt-1 text-sm text-ink-500">Outlets where customers can get this.</p>
            <fieldset disabled={locked} className="mt-3 space-y-1">
              {activeOutlets.map((o) => (
                <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-ink-50">
                  <input type="checkbox" className="size-4 accent-accent-500" checked={f.outletIds.includes(o.id)} onChange={(e) => set('outletIds', e.target.checked ? [...f.outletIds, o.id] : f.outletIds.filter((x) => x !== o.id))} />
                  <span className="text-sm">{o.name} <span className="text-ink-500">· {o.city}</span></span>
                </label>
              ))}
            </fieldset>
          </Card>
          {formError && formError !== 'invalid' && <Alert tone="danger">{formError}</Alert>}
          {actionError && <Alert tone="danger">{actionError}</Alert>}
          {saved && <Alert tone="success">{saved}</Alert>}
          {!locked && (
            <Card>
              {listing && (status === 'DRAFT' || status === 'REJECTED') && listing.missing && listing.missing.length > 0 && (
                <p className="mb-3 text-sm text-ink-500">Before sending for approval, add: {listing.missing.join(', ').toLowerCase()}.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>{save.isPending ? 'Saving…' : listing?.status === 'APPROVED' ? 'Save changes' : 'Save draft'}</Button>
                {listing && (status === 'DRAFT' || status === 'REJECTED') && (
                  <Button variant="secondary" disabled={action.isPending || !!listing.missing?.length} onClick={() => action.mutate('submit')}>Send for approval</Button>
                )}
                {listing && <Button variant="ghost" disabled={action.isPending} onClick={() => action.mutate('archive')}>Archive</Button>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
