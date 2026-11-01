import { z } from 'zod';

const MAX_PRICE_SEN = 100_000_000; // RM 1,000,000

export const ListingInput = z
  .object({
    type: z.enum(['PRODUCT', 'SERVICE']),
    categoryId: z.coerce.number().int().positive('Choose a category'),
    title: z.string().trim().min(3, 'Enter a title').max(150),
    description: z.string().trim().min(10, 'Describe it in at least 10 characters').max(5000),
    priceSen: z.number().int('Price must be in sen').min(1, 'Enter a price').max(MAX_PRICE_SEN),
    memberPriceSen: z.number().int().min(1).max(MAX_PRICE_SEN).nullable().optional(),
    stockQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
    durationMinutes: z.number().int().min(5).max(7 * 24 * 60).nullable().optional(),
    isAvailable: z.boolean().optional(),
    outletIds: z.array(z.string().regex(/^\d+$/)).max(50).optional(),
    imageFileIds: z.array(z.string().min(10).max(32)).max(8, 'At most 8 photos').optional(),
  })
  .refine((v) => v.memberPriceSen == null || v.memberPriceSen <= v.priceSen, { path: ['memberPriceSen'], message: 'Member price cannot be higher than the normal price' });

/** For edits every field is optional; the member-price rule is checked against the merged result in the service. */
export const ListingPatch = z.object({
  type: z.enum(['PRODUCT', 'SERVICE']).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(3).max(150).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  priceSen: z.number().int().min(1).max(MAX_PRICE_SEN).optional(),
  memberPriceSen: z.number().int().min(1).max(MAX_PRICE_SEN).nullable().optional(),
  stockQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(7 * 24 * 60).nullable().optional(),
  isAvailable: z.boolean().optional(),
  outletIds: z.array(z.string().regex(/^\d+$/)).max(50).optional(),
  imageFileIds: z.array(z.string().min(10).max(32)).max(8, 'At most 8 photos').optional(),
});
export type ListingPatch = z.infer<typeof ListingPatch>;

/**
 * Changes to these fields on a live listing wait for admin approval (OPEN-21 default).
 * Everything else (stock, availability, outlets, duration) applies at once.
 */
export const REVIEWED_FIELDS = ['type', 'categoryId', 'title', 'description', 'priceSen', 'memberPriceSen', 'imageFileIds'] as const;
export type ReviewedField = (typeof REVIEWED_FIELDS)[number];
