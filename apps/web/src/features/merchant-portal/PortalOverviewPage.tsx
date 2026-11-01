import { ScanLine } from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/app/layouts/DashboardLayout';
import { merchantStatusLabel, merchantStatusTone } from '@/features/merchants/types';
import { usePortal } from './PortalContext';

export function PortalOverviewPage() {
  const { merchant, role, counts, base, can } = usePortal();
  const l = counts.listings;
  const tiles = [
    { label: 'Live listings', value: l.APPROVED ?? 0, to: `${base}/listings`, show: can('listings.read') },
    { label: 'Waiting for approval', value: l.PENDING ?? 0, to: `${base}/listings`, show: can('listings.read') },
    { label: 'Outlets', value: counts.outlets, to: `${base}/outlets`, show: can('listings.read') },
    { label: 'Staff', value: counts.staff, to: `${base}/staff`, show: can('staff.manage') },
  ].filter((t) => t.show);
  return (
    <>
      <PageHeader title={merchant.name} description={`You are signed in as ${role.toLowerCase()}.`} actions={<Badge tone={merchantStatusTone[merchant.status]}>{merchantStatusLabel[merchant.status]}</Badge>} />
      {merchant.status === 'SUSPENDED' && (
        <div className="mb-4"><Alert tone="danger">This business is suspended and hidden from the marketplace.{merchant.reviewNote ? ` ${merchant.reviewNote}` : ''} Contact us to reinstate it.</Alert></div>
      )}
      {can('vouchers.redeem') && merchant.status === 'APPROVED' && (
        <Link to={`${base}/redeem`} className="mb-4 flex min-h-16 items-center gap-3 rounded-card bg-ink-950 px-5 py-4 text-white shadow-card hover:bg-ink-800">
          <ScanLine className="size-7 text-accent-500" aria-hidden />
          <span><span className="block font-semibold">Redeem a voucher</span><span className="text-sm text-white/70">Scan a member’s QR code or type the code</span></span>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="h-full transition-shadow hover:shadow-lg">
              <p className="text-sm text-ink-500">{t.label}</p>
              <p className="mt-2 font-display text-4xl font-bold">{t.value}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
