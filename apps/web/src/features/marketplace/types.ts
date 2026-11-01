export interface MerchantCard { name: string; slug: string; logoUrl: string | null; city: string | null; state: string | null }

export interface ListingCardData {
  id: string;
  slug: string;
  type: 'PRODUCT' | 'SERVICE';
  title: string;
  category: { id: number; name: string; slug: string } | null;
  priceSen: number;
  memberPriceSen: number | null;
  isAvailable: boolean;
  imageUrl: string | null;
  merchant: MerchantCard;
}

export interface Outlet { id: string; name: string; addressLine1: string; addressLine2: string | null; city: string; state: string; postcode: string; phone: string | null; hours: string | null }

export const mapsUrl = (o: Outlet) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([o.addressLine1, o.addressLine2, o.postcode, o.city, o.state, 'Malaysia'].filter(Boolean).join(', '))}`;
