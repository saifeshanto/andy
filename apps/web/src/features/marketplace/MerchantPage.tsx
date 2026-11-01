import { useQuery } from '@tanstack/react-query';
import { Globe, MapPin, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { ListingCard } from './ListingCard';
import { mapsUrl, type ListingCardData, type MerchantCard, type Outlet } from './types';

type Detail = MerchantCard & { businessType: string; description: string | null; phone: string | null; email: string | null; website: string | null; outlets: Outlet[]; listings: ListingCardData[] };

export function MerchantPage() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'merchant', slug], queryFn: () => api<{ data: Detail }>(`/public/merchants/${encodeURIComponent(slug)}`).then((r) => r.data), retry: false });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">Not available</h1>
        <Link to="/merchants" className="mt-4 inline-block font-semibold underline">All merchants</Link>
      </main>
    );
  }
  const m = q.data;
  return (
    <main>
      <section className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
          <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-3xl bg-white/10 text-4xl font-bold">{m.logoUrl ? <img src={m.logoUrl} alt={`${m.name} logo`} className="size-full object-cover" /> : m.name[0]}</span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent-400">{m.businessType}</p>
            <h1 className="font-display text-4xl font-bold uppercase sm:text-5xl">{m.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-300">
              {m.phone && <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 underline"><Phone className="size-4" aria-hidden />{m.phone}</a>}
              {m.website && <a href={m.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline"><Globe className="size-4" aria-hidden />Website</a>}
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {m.description && <p className="mb-8 whitespace-pre-line text-ink-700">{m.description}</p>}
          <h2 className="font-display text-2xl font-bold uppercase">Products and services</h2>
          <div className="mt-4">
            {m.listings.length === 0 ? <EmptyState title="Nothing listed yet" /> : <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">{m.listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
          </div>
        </div>
        <aside>
          <h2 className="font-display text-2xl font-bold uppercase">Outlets</h2>
          <ul className="mt-4 space-y-3">
            {m.outlets.map((o) => (
              <li key={o.id}>
                <Card className="text-sm">
                  <p className="font-semibold">{o.name}</p>
                  <a href={mapsUrl(o)} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-start gap-2 underline"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[o.addressLine1, o.addressLine2, `${o.postcode} ${o.city}`, o.state].filter(Boolean).join(', ')}</a>
                  {o.phone && <p className="mt-1">{o.phone}</p>}
                  {o.hours && <p className="mt-1 whitespace-pre-line text-ink-500">{o.hours}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
