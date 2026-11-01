import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { mapsUrl } from '@/features/marketplace/types';
import { QrCode } from '@/features/vouchers/QrCode';
import { voucherStatusLabel, type MyVoucher } from '@/features/vouchers/types';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';

/** The screen a member shows at the counter. Refreshes so it flips to "Used" right after the cashier redeems. */
export function MyVoucherPage() {
  const { code = '' } = useParams();
  const q = useQuery({
    queryKey: ['me', 'vouchers', 'one', code],
    queryFn: () => api<{ data: MyVoucher }>(`/me/vouchers/${encodeURIComponent(code)}`).then((r) => r.data),
    refetchInterval: (query) => (query.state.data?.status === 'ACTIVE' ? 5000 : false),
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <Alert tone="danger">Voucher not found.</Alert>;
  const v = q.data;
  const ready = v.status === 'ACTIVE';

  return (
    <div className="mx-auto max-w-md">
      <Link to="/account/vouchers" className="inline-flex items-center gap-1 text-sm text-ink-500 underline"><ArrowLeft className="size-4" aria-hidden /> My vouchers</Link>
      <Card className="mt-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-500">{v.benefit}</p>
        <h1 className="mt-1 text-xl font-semibold">{v.title}</h1>
        <p className="text-sm text-ink-500">{v.merchant.name}</p>
        <div className={`mt-5 flex justify-center ${ready ? '' : 'opacity-20'}`}>
          <QrCode value={v.code} size={240} label={`QR code for voucher ${v.code}`} />
        </div>
        <p className="mt-3 font-mono text-2xl font-bold tracking-widest">{v.code}</p>
        <div className="mt-4">
          {ready ? (
            <p className="text-sm text-ink-500">Show this at the counter. Valid until {formatDate(v.expiresAt)}.</p>
          ) : v.status === 'REDEEMED' ? (
            <Alert tone="success">Used on {formatDateTime(v.redeemedAt)}{v.redeemedOutlet ? ` at ${v.redeemedOutlet}` : ''}.</Alert>
          ) : (
            <Alert tone="warning">{voucherStatusLabel[v.status]} on {formatDate(v.expiresAt)}.</Alert>
          )}
        </div>
      </Card>
      <Card className="mt-4">
        <h2 className="font-semibold">Terms</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{v.terms}</p>
        {v.memberOnly && <p className="mt-2 text-sm text-ink-500">Your membership must be active when you use it.</p>}
      </Card>
      {v.outlets && v.outlets.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold">Where to use it</h2>
          <ul className="mt-2 space-y-3 text-sm">
            {v.outlets.map((o) => (
              <li key={o.id}>
                <p className="font-medium">{o.name}</p>
                <a href={mapsUrl(o)} target="_blank" rel="noreferrer" className="mt-0.5 flex gap-2 text-ink-700 underline"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[o.addressLine1, `${o.postcode} ${o.city}`, o.state].join(', ')}</a>
                {o.hours && <p className="mt-0.5 text-ink-500">{o.hours}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
