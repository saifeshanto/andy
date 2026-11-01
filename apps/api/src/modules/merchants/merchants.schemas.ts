import { z } from 'zod';

/** Malaysian states and federal territories, for address dropdowns. */
export const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
] as const;

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => null));

/** Fields an applicant can save at any time while editing. Everything is optional until submit. */
export const ApplicationDraft = z.object({
  name: z.string().trim().min(2, 'Enter the business name').max(150),
  businessType: z.string().trim().min(2, 'Enter the type of business').max(80),
  ssmNo: z.string().trim().max(40).optional(),
  description: opt(3000),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal('').transform(() => null)),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(191).optional().or(z.literal('').transform(() => null)),
  website: z.string().trim().url('Enter a full web address, starting with https://').max(255).optional().or(z.literal('').transform(() => null)),
  addressLine1: opt(200),
  addressLine2: opt(200),
  city: opt(100),
  state: z.enum(MY_STATES).optional().or(z.literal('').transform(() => null)),
  postcode: z.string().trim().regex(/^\d{5}$/, 'Postcode is 5 digits').optional().or(z.literal('').transform(() => null)),
  logoFileId: z.string().optional().nullable(),
});
export type ApplicationDraft = z.infer<typeof ApplicationDraft>;

export const ReviewNote = z.object({ note: z.string().trim().min(5, 'Explain the reason (at least 5 characters)').max(1000) });
