import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Pager } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import type { PublicVoucher } from './types';
import { VoucherCard } from './VoucherCard';

export function PublicVouchersPage() {
  const { status } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const search = params.get('q') ?? '';
  const q = useQuery({
    queryKey: ['public', 'vouchers', params.toString(), status],
    queryFn: () => api<{ data: PublicVoucher[]; meta: { totalPages: number } }>(`/public/vouchers?${params}`),
    placeholderData: keepPreviousData,
    enabled: status !== 'loading',
  });
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-4xl font-bold uppercase sm:text-5xl">Vouchers</h1>
      <p className="mt-2 max-w-2xl text-ink-500">Claim a voucher, then show its QR code at the shop. Most are for Andy Auto Club members.</p>
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get('q')?.toString().trim() ?? '';
          setParams(v ? { q: v } : {});
        }}
      >
        <input name="q" type="search" defaultValue={search} placeholder="Search vouchers or businesses" aria-label="Search vouchers" className="min-h-11 w-full rounded-xl border border-ink-100 bg-white px-3.5 sm:max-w-md" />
      </form>
      <div className="mt-6">
        {q.isLoading && <Spinner />}
        {q.isError && <Alert tone="danger">Could not load vouchers.</Alert>}
        {q.data?.data.length === 0 && <EmptyState title="No vouchers right now">Check back soon. New offers are added by our merchants.</EmptyState>}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data?.data.map((v) => <li key={v.id}><VoucherCard v={v} /></li>)}
        </ul>
        {q.data && <Pager page={page} totalPages={q.data.meta.totalPages} onPage={(p) => setParams({ ...(search ? { q: search } : {}), page: String(p) })} />}
      </div>
    </main>
  );
}
