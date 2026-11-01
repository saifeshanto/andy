import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { MY_STATES } from '@/features/merchants/types';
import { api } from '@/lib/api';
import type { MerchantCard } from './types';

type Row = MerchantCard & { businessType: string; listings: number };

export function MerchantsPage() {
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ['public', 'merchants', params.toString()], queryFn: () => api<{ data: Row[]; meta: { totalPages: number } }>(`/public/merchants?pageSize=24&${params}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">Merchants</h1>
      <p className="mt-2 text-ink-500">Workshops, detailers and parts sellers approved by Andy Auto Club.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input type="search" defaultValue={params.get('q') ?? ''} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value.trim())} placeholder="Search by name or type, then Enter" aria-label="Search merchants" className="min-h-11 flex-1 rounded-xl border border-ink-100 bg-white px-3.5" />
        <select aria-label="State" value={params.get('state') ?? ''} onChange={(e) => set('state', e.target.value)} className="min-h-11 rounded-xl border border-ink-100 bg-white px-3 text-sm">
          <option value="">All states</option>
          {MY_STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="mt-6">
        {q.isLoading && <Spinner />}
        {q.data?.data.length === 0 && <EmptyState title="No merchants found" />}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data?.data.map((m) => (
            <li key={m.slug}>
              <Link to={`/merchants/${m.slug}`} className="flex items-center gap-4 rounded-card bg-white p-4 shadow-card hover:shadow-lg">
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink-100 text-2xl font-bold text-ink-500">{m.logoUrl ? <img src={m.logoUrl} alt="" className="size-full object-cover" loading="lazy" /> : m.name[0]}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.name}</span>
                  <span className="block truncate text-sm text-ink-500">{m.businessType}</span>
                  <span className="block text-sm text-ink-500">{[m.city, m.state].filter(Boolean).join(', ')} · {m.listings} listing{m.listings === 1 ? '' : 's'}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {q.data && q.data.meta.totalPages > 1 && <Pager page={Number(params.get('page') ?? 1)} totalPages={q.data.meta.totalPages} onPage={(p) => set('page', String(p))} />}
      </div>
    </main>
  );
}
