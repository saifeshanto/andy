import type { MerchantAction, MerchantRoleKey } from '@andy/shared';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, MapPin, Package, Store, Users } from 'lucide-react';
import { createContext, useContext } from 'react';
import { Navigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { DashboardLayout, type NavItem } from '@/app/layouts/DashboardLayout';
import type { MerchantView } from '@/features/merchants/types';
import { api, ApiError } from '@/lib/api';

export interface PortalData {
  merchant: MerchantView;
  role: MerchantRoleKey;
  actions: MerchantAction[];
  counts: { outlets: number; staff: number; listings: Partial<Record<string, number>> };
}

interface PortalCtx extends PortalData {
  id: string;
  can: (a: MerchantAction) => boolean;
  base: string;
}

const Ctx = createContext<PortalCtx | null>(null);

export function usePortal(): PortalCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePortal must be used inside the merchant portal');
  return v;
}

export const portalKey = (id: string) => ['merchant-portal', id] as const;

/** Loads the merchant from the URL, then renders the portal sidebar with only the sections this role can use. */
export function MerchantPortalLayout() {
  const { merchantId = '' } = useParams();
  const q = useQuery({ queryKey: portalKey(merchantId), queryFn: () => api<{ data: PortalData }>(`/merchant/${merchantId}`).then((r) => r.data), retry: false });
  if (q.isLoading) return <Spinner />;
  if (q.error instanceof ApiError && q.error.status === 404) return <Navigate to="/merchant" replace />;
  if (q.isError || !q.data) return <div className="p-6"><Alert tone="danger">Could not open the merchant portal.</Alert></div>;

  const base = `/merchant/${merchantId}`;
  const can = (a: MerchantAction) => q.data.actions.includes(a);
  const nav: (NavItem & { need?: MerchantAction })[] = [
    { to: base, label: 'Overview', icon: LayoutDashboard, end: true },
    { to: `${base}/listings`, label: 'Listings', icon: Package, need: 'listings.read' },
    { to: `${base}/outlets`, label: 'Outlets', icon: MapPin, need: 'listings.read' },
    { to: `${base}/staff`, label: 'Staff', icon: Users, need: 'staff.manage' },
    { to: `${base}/profile`, label: 'Business profile', icon: Store, need: 'profile.edit' },
  ];
  return (
    <Ctx.Provider value={{ ...q.data, id: merchantId, can, base }}>
      <DashboardLayout title="Merchant" nav={nav.filter((n) => !n.need || can(n.need))} />
    </Ctx.Provider>
  );
}
