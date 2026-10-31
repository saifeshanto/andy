import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MembershipOverview {
  current: { status: string; startAt: string; endAt: string; plan: string } | null;
  paidUntil: string | null;
  canPurchase: boolean;
  plan: { name: string; priceSen: number; durationMonths: number } | null;
  history: { status: string; startAt: string; endAt: string; plan: string }[];
}

export interface OrderView {
  orderNo: string;
  type: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
  totalSen: number;
  paidAt: string | null;
  createdAt: string;
  items: { title: string; qty: number; unitPriceSen: number; lineTotalSen: number }[];
}

export const useMembership = () =>
  useQuery({ queryKey: ['me', 'membership'], queryFn: () => api<{ data: MembershipOverview }>('/me/membership').then((r) => r.data) });

export async function startCheckout(): Promise<string> {
  const res = await api<{ data: { checkoutUrl: string } }>('/me/membership/checkout', { method: 'POST' });
  return res.data.checkoutUrl;
}
