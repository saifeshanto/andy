import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, QrCode, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { usePortal } from './PortalContext';
import { QrScanner } from './QrScanner';

interface Lookup {
  code: string;
  title: string;
  terms: string;
  benefit: string;
  memberName: string;
  expiresAt: string;
  canRedeem: boolean;
  reason: string | null;
  reasonCode: string | null;
  redeemedAt: string | null;
  redeemedOutlet: string | null;
  outlets: { id: string; name: string }[];
}

const OUTLET_KEY = 'andy.redeem.outlet';
const savedOutlet = () => {
  try {
    return localStorage.getItem(OUTLET_KEY) ?? '';
  } catch {
    return '';
  }
};

/** The counter screen: scan or type a code, check it, then confirm. Built for a phone held in one hand. */
export function RedeemPage() {
  const { id, base, merchant } = usePortal();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [outletId, setOutletId] = useState(savedOutlet);
  const [done, setDone] = useState<{ code: string; title: string; redeemedAt: string } | null>(null);

  const lookup = useMutation({
    mutationFn: (c: string) => api<{ data: Lookup }>(`/merchant/${id}/redemptions/lookup`, { method: 'POST', json: { code: c } }).then((r) => r.data),
    onSuccess: (v) => {
      if (!v.outlets.some((o) => o.id === outletId)) setOutletId(v.outlets.length === 1 ? v.outlets[0]!.id : '');
    },
  });
  const redeem = useMutation({
    mutationFn: () => api<{ data: { code: string; title: string; redeemedAt: string } }>(`/merchant/${id}/redemptions`, { method: 'POST', json: { code: lookup.data!.code, outletId } }).then((r) => r.data),
    onSuccess: (r) => {
      try {
        localStorage.setItem(OUTLET_KEY, outletId);
      } catch {
        /* private mode: just not remembered */
      }
      setDone(r);
    },
  });

  const check = (c: string) => {
    const clean = c.trim();
    if (!clean) return;
    setCode(clean);
    redeem.reset();
    lookup.mutate(clean);
  };
  const onScan = useCallback((text: string) => {
    setScanning(false);
    check(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const next = () => {
    setDone(null);
    setCode('');
    lookup.reset();
    redeem.reset();
  };

  if (merchant.status !== 'APPROVED') return <Alert tone="warning">This business is suspended, so vouchers cannot be redeemed.</Alert>;

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="size-16 text-success-500" aria-hidden />
            <h1 className="mt-3 font-display text-3xl font-bold uppercase">Redeemed</h1>
            <p className="mt-1 font-semibold">{done.title}</p>
            <p className="mt-1 text-sm text-ink-500">{done.code} · {formatDateTime(done.redeemedAt)}</p>
            <p className="mt-3 text-sm text-ink-500">Give the member their item or discount now.</p>
          </div>
          <Button className="mt-2 w-full" onClick={next}>Next customer</Button>
        </Card>
      </div>
    );
  }

  const v = lookup.data;
  const lookupError = lookup.error instanceof ApiError ? lookup.error.message : lookup.error ? 'Could not check the code. Try again.' : null;
  const redeemError = redeem.error instanceof ApiError ? redeem.error.message : redeem.error ? 'Could not redeem. Try again.' : null;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Redeem voucher" description="Scan the member’s QR code or type the code on their voucher." />
      {scanning ? (
        <QrScanner onCode={onScan} onClose={() => setScanning(false)} />
      ) : (
        <Card>
          <Button className="w-full" onClick={() => setScanning(true)}><QrCode className="size-5" aria-hidden /> Scan QR code</Button>
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              check(code);
            }}
          >
            <Field label="Or type the code" className="flex-1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCDE-FGH23" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            <Button type="submit" variant="secondary" disabled={lookup.isPending || !code.trim()}>{lookup.isPending ? 'Checking…' : 'Check'}</Button>
          </form>
        </Card>
      )}

      {lookupError && <div className="mt-4"><Alert tone="danger">{lookupError}</Alert></div>}

      {v && !scanning && (
        <Card className="mt-4">
          <div className="flex items-start gap-3">
            {v.canRedeem ? <CheckCircle2 className="size-8 shrink-0 text-success-500" aria-hidden /> : <XCircle className="size-8 shrink-0 text-danger-500" aria-hidden />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent-500">{v.benefit}</p>
              <h2 className="text-lg font-semibold">{v.title}</h2>
              <p className="text-sm text-ink-500">{v.code} · for {v.memberName} · valid until {formatDate(v.expiresAt)}</p>
            </div>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium">Terms</summary>
            <p className="mt-1 whitespace-pre-line text-ink-700">{v.terms}</p>
          </details>
          {!v.canRedeem && (
            <div className="mt-4">
              <Alert tone="danger">
                {v.reason}
                {v.reasonCode === 'REDEEMED' && v.redeemedAt && <> on {formatDateTime(v.redeemedAt)}{v.redeemedOutlet ? ` at ${v.redeemedOutlet}` : ''}.</>}
              </Alert>
            </div>
          )}
          {v.canRedeem && (
            <div className="mt-4 space-y-3">
              {v.outlets.length > 1 && (
                <SelectField label="Your outlet" options={v.outlets.map((o) => ({ value: o.id, label: o.name }))} placeholder="Choose the outlet you are at" value={outletId} onChange={(e) => setOutletId(e.target.value)} />
              )}
              {redeemError && <Alert tone="danger">{redeemError}</Alert>}
              <Button className="min-h-14 w-full text-lg" disabled={redeem.isPending || !outletId} onClick={() => redeem.mutate()}>
                {redeem.isPending ? 'Redeeming…' : 'Confirm redeem'}
              </Button>
              <p className="text-center text-xs text-ink-500">This cannot be undone at the counter. If you make a mistake, contact us.</p>
            </div>
          )}
          <Button variant="ghost" className="mt-2 w-full" onClick={next}>Clear</Button>
        </Card>
      )}
      <p className="mt-6 text-center text-sm"><Link to={`${base}/redemptions`} className="underline">Redemption history</Link></p>
    </div>
  );
}
