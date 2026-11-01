import { merchantCan, type MerchantAction } from '@andy/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { currentUser } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';

export const MerchantParam = z.object({ merchantId: z.string().regex(/^[A-Za-z0-9]{8,24}$/) });

/**
 * Resolves the merchant in the URL and checks the signed-in user's staff seat can do `action`.
 * Unknown merchant and "not your merchant" both return 404, so ids cannot be probed.
 * Only APPROVED merchants can change anything; a SUSPENDED merchant's staff can still look.
 */
export async function merchantAccess(req: Request, action: MerchantAction, opts: { write?: boolean } = {}) {
  const { merchantId } = MerchantParam.parse(req.params);
  const user = currentUser(req);
  const merchant = await db().merchant.findUnique({ where: { publicId: merchantId } });
  if (!merchant || !['APPROVED', 'SUSPENDED'].includes(merchant.status)) throw new AppError('NOT_FOUND', 404, 'Merchant not found');
  const seat = await db().merchantMember.findUnique({ where: { merchantId_userId: { merchantId: merchant.id, userId: user.id } } });
  if (!seat || seat.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 404, 'Merchant not found');
  if (!merchantCan(seat.role, action)) throw new AppError('FORBIDDEN', 403, 'Your role at this business cannot do this');
  if (opts.write && merchant.status !== 'APPROVED') throw new AppError('MERCHANT_SUSPENDED', 409, 'This business is suspended. Contact us to reinstate it.');
  return { merchant, seat, user };
}
