import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDuration } from '@/features/listings/types';
import { api } from '@/lib/api';
import { ListingCard } from './ListingCard';
import { mapsUrl, type ListingCardData, type MerchantCard, type Outlet } from './types';

interface Detail {
  id: string;
  slug: string;
  type: 'PRODUCT' | 'SERVICE';
  title: string;
  description: string;
  category: { name: string; slug: string } | null;
  priceSen: number;
  memberPriceSen: number | null;
  stockQty: number | null;
  durationMinutes: number | null;
  isAvailable: boolean;
  images: { id: string; url: string }[];
  merchant: MerchantCard;
  outlets: Outlet[];
  moreFromMerchant: ListingCardData[];
}

export function ListingPage() {
  const { slug = '' } = useParams();
  const { status } = useAuth();
  const q = useQuery({ queryKey: ['public', 'listing', slug], queryFn: () => api<{ data: Detail }>(`/public/listings/${encodeURIComponent(slug)}`).then((r) => r.data), retry: false });
  const [photo, setPhoto] = useState(0);
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">Not available</h1>
        <p className="mt-2 text-ink-500">This listing has been removed or is not available right now.</p>
        <Link to="/marketplace" className="mt-4 inline-block font-semibold underline">Back to the marketplace</Link>
      </main>
    );
  }
  const l = q.data;
  const img = l.images[photo] ?? l.images[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
        <Link to="/marketplace" className="underline">Marketplace</Link>
        {l.category && <> / <Link to={`/marketplace?category=${l.category.slug}`} className="underline">{l.category.name}</Link></>}
      </nav>
      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-10">
        <div>
          <div className="aspect-[4/3] overflow-hidden rounded-card bg-ink-50">{img && <img src={img.url} alt={l.title} className="size-full object-cover" />}</div>
          {l.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {l.images.map((im, i) => (
                <button key={im.id} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} aria-pressed={i === photo} className={`size-16 shrink-0 overflow-hidden rounded-xl ring-2 ${i === photo ? 'ring-accent-500' : 'ring-transparent'}`}>
                  <img src={im.url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Link to={`/merchants/${l.merchant.slug}`} className="flex items-center gap-3">
            <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-ink-100 font-bold text-ink-500">{l.merchant.logoUrl ? <img src={l.merchant.logoUrl} alt="" className="size-full object-cover" /> : l.merchant.name[0]}</span>
            <span className="text-sm font-semibold underline">{l.merchant.name}</span>
          </Link>
          <h1 className="mt-4 font-display text-3xl font-bold uppercase leading-tight sm:text-4xl">{l.title}</h1>
          <Card className="mt-5">
            {l.memberPriceSen != null ? (
              <>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent-500">Member price</p>
                <MoneyRM sen={l.memberPriceSen} className="font-display text-4xl font-bold" />
                <p className="mt-1 text-ink-500">Normal price <MoneyRM sen={l.priceSen} /></p>
                {status !== 'signed-in' && <p className="mt-3 text-sm"><Link to="/account/membership" className="font-semibold underline">Become a member</Link> to get member prices.</p>}
              </>
            ) : (
              <MoneyRM sen={l.priceSen} className="font-display text-4xl font-bold" />
            )}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-500">
              <span>{l.type === 'SERVICE' ? 'Service' : 'Product'}</span>
              {l.durationMinutes && <span className="inline-flex items-center gap-1"><Clock className="size-4" aria-hidden /> {formatDuration(l.durationMinutes)}</span>}
              {l.stockQty === 0 && <span className="font-semibold text-danger-500">Out of stock</span>}
            </div>
            {!l.isAvailable && <div className="mt-3"><Alert tone="warning">Not available at the moment.</Alert></div>}
            <p className="mt-4 text-sm text-ink-500">Pay at the outlet. Show this page or mention Andy Auto Club when you visit.</p>
          </Card>
          <h2 className="mt-8 font-semibold">About</h2>
          <p className="mt-2 whitespace-pre-line text-ink-700">{l.description}</p>
          {l.outlets.length > 0 && (
            <>
              <h2 className="mt-8 font-semibold">Where to get it</h2>
              <ul className="mt-3 space-y-3">
                {l.outlets.map((o) => (
                  <li key={o.id}>
                    <Card className="text-sm">
                      <p className="font-semibold">{o.name}</p>
                      <a href={mapsUrl(o)} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-start gap-2 text-ink-700 underline"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[o.addressLine1, o.addressLine2, `${o.postcode} ${o.city}`, o.state].filter(Boolean).join(', ')}</a>
                      {o.phone && <a href={`tel:${o.phone.replace(/[^\d+]/g, '')}`} className="mt-1 flex items-center gap-2 underline"><Phone className="size-4" aria-hidden />{o.phone}</a>}
                      {o.hours && <p className="mt-1 whitespace-pre-line text-ink-500">{o.hours}</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      {l.moreFromMerchant.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold uppercase">More from {l.merchant.name}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{l.moreFromMerchant.map((x) => <ListingCard key={x.id} l={x} />)}</div>
        </section>
      )}
    </main>
  );
}
