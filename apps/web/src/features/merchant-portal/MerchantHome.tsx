import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { merchantStatusLabel, merchantStatusTone, type MerchantView } from '@/features/merchants/types';
import { api } from '@/lib/api';

type Seat = { role: string; merchant: MerchantView };

/** /merchant: go straight to the only business, or let people who work at several choose. */
export function MerchantHome() {
  const q = useQuery({ queryKey: ['me', 'merchants'], queryFn: () => api<{ data: Seat[] }>('/me/merchants').then((r) => r.data) });
  if (q.isLoading) return <Spinner />;
  const live = (q.data ?? []).filter((s) => s.merchant.status === 'APPROVED' || s.merchant.status === 'SUSPENDED');
  if (live.length === 1) return <Navigate to={`/merchant/${live[0]!.merchant.id}`} replace />;
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold uppercase">Merchant portal</h1>
      {live.length === 0 ? (
        <Card className="mt-6">
          <p>You are not part of an approved business yet.</p>
          <Link to="/merchant/apply" className="mt-3 inline-block font-semibold underline">Apply to become a merchant</Link>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {live.map((s) => (
            <li key={s.merchant.id}>
              <Link to={`/merchant/${s.merchant.id}`} className="flex items-center justify-between gap-3 rounded-card bg-white p-5 shadow-card hover:shadow-lg">
                <span>
                  <span className="block font-semibold">{s.merchant.name}</span>
                  <span className="block text-sm text-ink-500">{s.role.toLowerCase()}</span>
                </span>
                <Badge tone={merchantStatusTone[s.merchant.status]}>{merchantStatusLabel[s.merchant.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
