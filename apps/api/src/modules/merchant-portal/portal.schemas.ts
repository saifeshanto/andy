import { z } from 'zod';
import { MY_STATES } from '../merchants/merchants.schemas.js';

const blankToNull = z.literal('').transform(() => null);

/** After approval, the business name and SSM number are fixed; the rest of the public profile is editable. */
export const ProfileBody = z.object({
  description: z.string().trim().max(3000).or(blankToNull).optional(),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number').optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(191).or(blankToNull).optional(),
  website: z.string().trim().url('Enter a full web address, starting with https://').max(255).or(blankToNull).optional(),
  logoFileId: z.string().min(10).max(32).nullable().optional(),
  coverFileId: z.string().min(10).max(32).nullable().optional(),
});

export const OutletBody = z.object({
  name: z.string().trim().min(2, 'Enter the outlet name').max(150),
  addressLine1: z.string().trim().min(3, 'Enter the address').max(200),
  addressLine2: z.string().trim().max(200).or(blankToNull).optional(),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  state: z.enum(MY_STATES, 'Choose a state'),
  postcode: z.string().trim().regex(/^\d{5}$/, 'Postcode is 5 digits'),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number').or(blankToNull).optional(),
  hours: z.string().trim().max(500).or(blankToNull).optional(),
  isActive: z.boolean().optional(),
});

export const InviteBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(191),
  role: z.enum(['MANAGER', 'CASHIER']),
  outletId: z.string().regex(/^\d+$/).nullable().optional(),
});

export const StaffPatch = z.object({
  role: z.enum(['MANAGER', 'CASHIER']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  outletId: z.string().regex(/^\d+$/).nullable().optional(),
});
