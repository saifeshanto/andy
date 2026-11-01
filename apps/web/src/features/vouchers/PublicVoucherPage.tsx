import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MapPin, Phone, Ticket } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { mapsUrl } from '@/features/marketplace/types';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { claimStateText, type MyVoucher, type PublicVoucher } from './types';

export function PublicVoucherPage() {
  const { slug = '' } = useParams();
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = ['public', 'voucher', slug, status];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ data: PublicVoucher }>(`/public/vouchers/${encodeURIComponent(slug)}`).then((r) => r.data), retry: false, enabled: status !== 'loading' });
  const claim = useMutation({
    mutationFn: () => api<{ data: MyVoucher }>('/me/vouchers', { method: 'POST', json: { campaignId: q.data!.id } }).then((r) => r.data),
    onSuccess: async (v) => {
      await qc.invalidateQueries({ queryKey: ['public', 'voucher', slug] });
      await qc.invalidateQueries({ queryKey: ['me', 'vouchers'] });
      navigate(`/account/vouchers/${v.code.replace('-', '')}`);
    },
  });

  if (status === 'loading' || q.isLoading) return <Spinner />;
  if (q.isError || !q.data) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">Not available</h1>
        <p className="mt-2 text-ink-500">This voucher has ended or is not available right now.</p>
        <Link to="/vouchers" className="mt-4 inline-block font-semibold underline">See all vouchers</Link>
      </main>
    );
  }
  const v = q.data;
  const limitReached = v.myClaims >= v.perUserLimit;
  const err = claim.error instanceof ApiError ? claim.error : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-500"><Link to="/vouchers" className="underline">Vouchers</Link></nav>
      <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          <Card tone="dark">
            <div className="flex items-center gap-3">
              <Ticket className="size-8 text-accent-500" aria-hidden />
              <p className="font-display text-4xl font-bold uppercase">{v.benefit}</p>
            </div>
            <h1 className="mt-3 text-2xl font-semibold">{v.title}</h1>
            <p className="mt-1 text-white/70">at <Link to={`/merchants/${v.merchant.slug}`} className="underline">{v.merchant.name}</Link></p>
          </Card>
          <Card className="mt-4">
            <h2 className="font-semibold">Terms</h2>
            <p className="mt-2 whitespace-pre-line text-ink-700">{v.terms}</p>
            <ul className="mt-4 space-y-1 text-sm text-ink-500">
              <li>Claim by {formatDate(v.claimEndAt)}.</li>
              <li>Use by {formatDate(v.validUntil)}{v.validDays ? `, or within ${v.validDays} days of claiming, whichever is sooner` : ''}.</li>
              {v.memberOnly && <li>For Andy Auto Club members. Your membership must be active when you claim it and when you use it.</li>}
              {v.perUserLimit > 1 && <li>Up to {v.perUserLimit} per member.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            {v.remaining != null && v.claimState === 'OPEN' && <p className="mb-3 text-sm text-ink-500">{v.remaining} left</p>}
            {status === 'signed-out' ? (
              <>
                <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}><Button className="w-full">Sign in to claim</Button></Link>
                <p className="mt-2 text-center text-sm text-ink-500">New here? <Link to="/register" className="underline">Create an account</Link></p>
              </>
            ) : limitReached ? (
              <>
                <Alert tone="success">You have claimed this voucher.</Alert>
                <Link to="/account/vouchers" className="mt-3 block"><Button variant="secondary" className="w-full">Show my vouchers</Button></Link>
              </>
            ) : (
              <Button className="w-full" disabled={v.claimState !== 'OPEN' || claim.isPending} onClick={() => claim.mutate()}>
                {claim.isPending ? 'Claiming…' : claimStateText[v.claimState]}
              </Button>
            )}
            {err && (
              <div className="mt-3">
                <Alert tone="danger">
                  {err.message}{' '}
                  {err.code === 'MEMBERSHIP_REQUIRED' && <Link to="/account/membership" className="font-semibold underline">Membership</Link>}
                </Alert>
              </div>
            )}
          </Card>
          {v.outlets && v.outlets.length > 0 && (
            <Card>
              <h2 className="font-semibold">Where to use it</h2>
              <ul className="mt-3 space-y-4">
                {v.outlets.map((o) => (
                  <li key={o.id} className="text-sm">
                    <p className="font-medium">{o.name}</p>
                    <a href={mapsUrl(o)} target="_blank" rel="noreferrer" className="mt-1 flex gap-2 text-ink-700 underline"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[o.addressLine1, o.addressLine2, `${o.postcode} ${o.city}`, o.state].filter(Boolean).join(', ')}</a>
                    {o.phone && <a href={`tel:${o.phone}`} className="mt-1 flex gap-2 text-ink-700"><Phone className="mt-0.5 size-4 shrink-0" aria-hidden />{o.phone}</a>}
                    {o.hours && <p className="mt-1 flex gap-2 text-ink-500"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden />{o.hours}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
