import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useCategories } from '@/features/listings/types';
import { MY_STATES } from '@/features/merchants/types';
import { api } from '@/lib/api';
import { ListingCard } from './ListingCard';
import type { ListingCardData } from './types';

type Paged = { data: ListingCardData[]; meta: { totalPages: number; total: number } };

export function MarketplacePage() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const query = new URLSearchParams(params);
  query.set('pageSize', '24');
  const q = useQuery({ queryKey: ['public', 'listings', query.toString()], queryFn: () => api<Paged>(`/public/listings?${query}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  const category = params.get('category') ?? '';
  const select = 'min-h-11 rounded-xl border border-ink-100 bg-white px-3 text-sm';

  return (
    <main>
      <section className="bg-ink-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="font-display text-4xl font-bold uppercase sm:text-5xl">Marketplace</h1>
          <p className="mt-2 text-ink-300">Products and services from approved automotive merchants. Members see member prices.</p>
          <form
            className="relative mt-6 max-w-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              set('q', new FormData(e.currentTarget).get('q')?.toString().trim() ?? '');
            }}
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-500" aria-hidden />
            <input name="q" type="search" defaultValue={params.get('q') ?? ''} placeholder="Search tyres, servicing, detailing…" aria-label="Search the marketplace" className="min-h-12 w-full rounded-full bg-white pl-12 pr-4 text-ink-900" />
          </form>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ slug: '', name: 'All' }, ...(categories.data ?? [])].map((c) => (
            <button key={c.slug} onClick={() => set('category', c.slug)} aria-pressed={category === c.slug} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${category === c.slug ? 'bg-ink-950 text-white' : 'bg-white shadow-card hover:bg-ink-50'}`}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="State" value={params.get('state') ?? ''} onChange={(e) => set('state', e.target.value)} className={select}>
            <option value="">All states</option>
            {MY_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select aria-label="Type" value={params.get('type') ?? ''} onChange={(e) => set('type', e.target.value)} className={select}>
            <option value="">Products and services</option>
            <option value="PRODUCT">Products</option>
            <option value="SERVICE">Services</option>
          </select>
          <select aria-label="Sort" value={params.get('sort') ?? 'newest'} onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)} className={select}>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
          {q.data && <span className="ml-auto text-sm text-ink-500">{q.data.meta.total} result{q.data.meta.total === 1 ? '' : 's'}</span>}
        </div>
        <div className="mt-6">
          {q.isLoading && <Spinner />}
          {q.isError && <Alert tone="danger">Could not load the marketplace.</Alert>}
          {q.data?.data.length === 0 && <EmptyState title="Nothing found">Try another category or state.</EmptyState>}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{q.data?.data.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          {q.data && q.data.meta.totalPages > 1 && <Pager page={Number(params.get('page') ?? 1)} totalPages={q.data.meta.totalPages} onPage={(p) => set('page', String(p))} />}
        </div>
      </div>
    </main>
  );
}
