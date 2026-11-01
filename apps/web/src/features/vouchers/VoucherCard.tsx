import { Ticket } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';
import type { PublicVoucher } from './types';

export function VoucherCard({ v }: { v: PublicVoucher }) {
  return (
    <Link to={`/vouchers/${v.slug}`} className="group flex h-full flex-col overflow-hidden rounded-card bg-white shadow-card transition hover:shadow-lg">
      <div className="flex items-center gap-3 bg-ink-950 px-4 py-4 text-white">
        <Ticket className="size-6 shrink-0 text-accent-500" aria-hidden />
        <p className="font-display text-2xl font-bold uppercase leading-none">{v.benefit}</p>
        {v.memberOnly && <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">Members</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-semibold group-hover:underline">{v.title}</p>
        <p className="mt-1 text-sm text-ink-500">{v.merchant.name}{v.merchant.city ? ` · ${v.merchant.city}` : ''}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs text-ink-500">
          <span>Claim by {formatDate(v.claimEndAt)}</span>
          {v.remaining != null && v.claimState === 'OPEN' && <span>· {v.remaining} left</span>}
          {v.claimState === 'SOLD_OUT' && <Badge tone="danger">All claimed</Badge>}
          {v.myClaims > 0 && <Badge tone="success">Claimed</Badge>}
        </div>
      </div>
    </Link>
  );
}
