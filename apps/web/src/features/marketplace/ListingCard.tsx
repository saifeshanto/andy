import { ImageOff } from 'lucide-react';
import { Link } from 'react-router';
import { MoneyRM } from '@/components/ui/MoneyRM';
import type { ListingCardData } from './types';

export function ListingCard({ l }: { l: ListingCardData }) {
  return (
    <Link to={`/products/${l.slug}`} className="group flex flex-col overflow-hidden rounded-card bg-white shadow-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] bg-ink-50">
        {l.imageUrl ? (
          <img src={l.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
        ) : (
          <div className="grid size-full place-items-center text-ink-300"><ImageOff className="size-8" aria-hidden /></div>
        )}
        {l.memberPriceSen != null && <span className="absolute left-3 top-3 rounded-full bg-accent-500 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">Member price</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{l.category?.name}</p>
        <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">{l.title}</h3>
        <p className="mt-1 truncate text-sm text-ink-500">{l.merchant.name}{l.merchant.city ? ` · ${l.merchant.city}` : ''}</p>
        <div className="mt-auto pt-3">
          {l.memberPriceSen != null ? (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <MoneyRM sen={l.memberPriceSen} className="text-lg font-bold text-accent-600" />
              <MoneyRM sen={l.priceSen} className="text-sm text-ink-500 line-through" />
            </p>
          ) : (
            <MoneyRM sen={l.priceSen} className="text-lg font-bold" />
          )}
        </div>
      </div>
    </Link>
  );
}
