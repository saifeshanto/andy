import { parseRM } from '@andy/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ListingStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
export type ListingType = 'PRODUCT' | 'SERVICE';

export interface ListingView {
  id: string;
  slug: string | null;
  type: ListingType;
  category: { id: number; name: string; slug: string } | null;
  title: string;
  description: string;
  priceSen: number;
  memberPriceSen: number | null;
  stockQty: number | null;
  durationMinutes: number | null;
  isAvailable: boolean;
  status: ListingStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  images: { id: string; url: string }[];
  outletIds?: string[];
  pendingChanges: { id: string; data: Record<string, unknown>; createdAt: string } | null;
  missing?: string[];
}

export interface Category { id: number; name: string; slug: string; sort: number; isActive: boolean }

export const listingStatusLabel: Record<ListingStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Waiting for approval',
  APPROVED: 'Live',
  REJECTED: 'Not approved',
  ARCHIVED: 'Archived',
};
export const listingStatusTone: Record<ListingStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  ARCHIVED: 'neutral',
};

export const useCategories = () =>
  useQuery({ queryKey: ['public', 'categories'], queryFn: () => api<{ data: Category[] }>('/public/categories').then((r) => r.data), staleTime: 5 * 60_000 });

/** "180" or "1,800.50" to sen; undefined when it is not a valid amount. */
export function toSen(rm: string): number | undefined {
  try {
    return rm.trim() ? parseRM(rm) : undefined;
  } catch {
    return undefined;
  }
}
export const toRM = (sen: number | null | undefined) => (sen == null ? '' : (sen / 100).toFixed(2));

export function formatDuration(min: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}
