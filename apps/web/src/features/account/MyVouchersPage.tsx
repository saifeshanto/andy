import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Ticket } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { voucherStatusLabel, type MyVoucher } from '@/features/vouchers/types';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const TABS = [
  { value: 'active', label: 'Ready to use' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
] as const;

export function MyVouchersPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'active') as (typeof TABS)[number]['value'];
  const q = useQuery({ queryKey: ['me', 'vouchers', tab], queryFn: () => api<{ data: MyVoucher[] }>(`/me/vouchers?tab=${tab}`).then((r) => r.data) });
  return (
    <>
      <PageHeader title="My vouchers" description="Open a voucher and show its QR code at the counter." actions={<Link to="/vouchers"><Button variant="secondary">Find vouchers</Button></Link>} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setParams(t.value === 'active' ? {} : { tab: t.value })} aria-pressed={tab === t.value} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${tab === t.value ? 'bg-ink-950 text-white' : 'bg-white shadow-card hover:bg-ink-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {q.isLoading && <Spinner />}
      {q.data?.length === 0 && <EmptyState title={tab === 'active' ? 'No vouchers yet' : 'Nothing here'}>{tab === 'active' ? 'Claim one from the vouchers page.' : null}</EmptyState>}
      <ul className="grid gap-3">
        {q.data?.map((v) => (
          <li key={v.code}>
            <Link to={`/account/vouchers/${v.code.replace('-', '')}`} className="flex items-center gap-4 rounded-card bg-white p-4 shadow-card hover:shadow-lg">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-500/10 text-accent-500"><Ticket className="size-6" aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-accent-500">{v.benefit}</p>
                <p className="truncate font-semibold">{v.title}</p>
                <p className="text-sm text-ink-500">
                  {v.merchant.name} · {v.status === 'REDEEMED' ? `used ${formatDate(v.redeemedAt)}` : v.status === 'ACTIVE' ? `use by ${formatDate(v.expiresAt)}` : `expired ${formatDate(v.expiresAt)}`}
                </p>
              </div>
              {v.status !== 'ACTIVE' && <Badge>{voucherStatusLabel[v.status]}</Badge>}
              <ChevronRight className="size-5 shrink-0 text-ink-300" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
