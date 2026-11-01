import { MERCHANT_ROLE_ACTIONS } from '@andy/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit, requestIp } from '../../core/audit.js';
import { currentUser, requireAuth } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { authLimiter } from '../../core/rate-limit.js';
import type { MerchantOutlet } from '../../generated/prisma/client.js';
import { ownedFile } from '../files/index.js';
import { presentMerchant } from '../merchants/merchants.service.js';
import { merchantAccess } from './access.js';
import { InviteBody, OutletBody, ProfileBody, StaffPatch } from './portal.schemas.js';
import { acceptInvite, inviteStaff, previewInvite, updateStaff } from './portal.service.js';

export const portalRouter = Router();
const base = '/merchant/:merchantId';
const IdOf = (name: string) => z.object({ [name]: z.coerce.bigint() });

const presentOutlet = (o: MerchantOutlet) => ({
  id: o.id.toString(),
  name: o.name,
  addressLine1: o.addressLine1,
  addressLine2: o.addressLine2,
  city: o.city,
  state: o.state,
  postcode: o.postcode,
  phone: o.phone,
  hours: o.hours,
  isActive: o.isActive,
});

/** Portal home: the business, my role and what I may do, plus counts for the dashboard. */
portalRouter.get(base, requireAuth, async (req, res) => {
  const { merchant, seat } = await merchantAccess(req, 'listings.read');
  const [outlets, staff, listings] = await Promise.all([
    db().merchantOutlet.count({ where: { merchantId: merchant.id, isActive: true } }),
    db().merchantMember.count({ where: { merchantId: merchant.id, status: 'ACTIVE' } }),
    db().listing.groupBy({ by: ['status'], where: { merchantId: merchant.id }, _count: true }),
  ]);
  res.json({
    data: {
      merchant: await presentMerchant(merchant),
      role: seat.role,
      actions: MERCHANT_ROLE_ACTIONS[seat.role],
      counts: { outlets, staff, listings: Object.fromEntries(listings.map((l) => [l.status, l._count])) },
    },
  });
});

portalRouter.patch(`${base}/profile`, requireAuth, async (req, res) => {
  const { merchant, user } = await merchantAccess(req, 'profile.edit', { write: true });
  const { logoFileId, coverFileId, ...fields } = ProfileBody.parse(req.body);
  const files: { logoFileId?: bigint | null; coverFileId?: bigint | null } = {};
  if (logoFileId !== undefined) files.logoFileId = logoFileId === null ? null : (await ownedFile(user.id, logoFileId, 'MERCHANT_LOGO')).id;
  if (coverFileId !== undefined) files.coverFileId = coverFileId === null ? null : (await ownedFile(user.id, coverFileId, 'MERCHANT_COVER')).id;
  const updated = await db().merchant.update({ where: { id: merchant.id }, data: { ...fields, ...files } });
  await audit({ actorId: user.id, action: 'merchant.profileUpdated', entityType: 'Merchant', entityId: merchant.id, after: { fields: Object.keys({ ...fields, ...files }) }, ip: requestIp(req) });
  res.json({ data: await presentMerchant(updated) });
});

// ───────── Outlets ─────────

portalRouter.get(`${base}/outlets`, requireAuth, async (req, res) => {
  const { merchant } = await merchantAccess(req, 'listings.read');
  const rows = await db().merchantOutlet.findMany({ where: { merchantId: merchant.id }, orderBy: [{ isActive: 'desc' }, { id: 'asc' }] });
  res.json({ data: rows.map(presentOutlet) });
});

portalRouter.post(`${base}/outlets`, requireAuth, async (req, res) => {
  const { merchant, user } = await merchantAccess(req, 'outlets.manage', { write: true });
  const body = OutletBody.parse(req.body);
  if ((await db().merchantOutlet.count({ where: { merchantId: merchant.id } })) >= 50) throw new AppError('TOO_MANY_OUTLETS', 409, 'At most 50 outlets');
  const outlet = await db().merchantOutlet.create({ data: { ...body, merchantId: merchant.id } });
  await audit({ actorId: user.id, action: 'merchant.outletCreated', entityType: 'Merchant', entityId: merchant.id, after: { outletId: outlet.id.toString(), name: outlet.name }, ip: requestIp(req) });
  res.status(201).json({ data: presentOutlet(outlet) });
});

portalRouter.patch(`${base}/outlets/:outletId`, requireAuth, async (req, res) => {
  const { merchant, user } = await merchantAccess(req, 'outlets.manage', { write: true });
  const { outletId } = IdOf('outletId').parse(req.params);
  const body = OutletBody.partial().parse(req.body);
  const { count } = await db().merchantOutlet.updateMany({ where: { id: outletId as bigint, merchantId: merchant.id }, data: body });
  if (!count) throw new AppError('NOT_FOUND', 404, 'Outlet not found');
  await audit({ actorId: user.id, action: 'merchant.outletUpdated', entityType: 'Merchant', entityId: merchant.id, after: { outletId: String(outletId), fields: Object.keys(body) }, ip: requestIp(req) });
  res.json({ data: presentOutlet(await db().merchantOutlet.findUniqueOrThrow({ where: { id: outletId as bigint } })) });
});

// ───────── Staff ─────────

portalRouter.get(`${base}/staff`, requireAuth, async (req, res) => {
  const { merchant } = await merchantAccess(req, 'staff.manage');
  const [members, invites] = await Promise.all([
    db().merchantMember.findMany({ where: { merchantId: merchant.id }, orderBy: { id: 'asc' } }),
    db().merchantInvite.findMany({ where: { merchantId: merchant.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { id: 'desc' } }),
  ]);
  const users = await db().user.findMany({ where: { id: { in: members.map((m) => m.userId) } }, select: { id: true, fullName: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({
    data: {
      members: members.map((m) => ({
        id: m.id.toString(),
        role: m.role,
        status: m.status,
        outletId: m.outletId?.toString() ?? null,
        fullName: byId.get(m.userId)?.fullName,
        email: byId.get(m.userId)?.email,
        isMe: m.userId === currentUser(req).id,
      })),
      invites: invites.map((i) => ({ id: i.id.toString(), email: i.email, role: i.role, outletId: i.outletId?.toString() ?? null, expiresAt: i.expiresAt })),
    },
  });
});

portalRouter.post(`${base}/staff/invites`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'staff.manage', { write: true });
  await inviteStaff(ctx, InviteBody.parse(req.body), requestIp(req));
  res.status(201).json({ data: { ok: true } });
});

portalRouter.delete(`${base}/staff/invites/:inviteId`, requireAuth, async (req, res) => {
  const { merchant, user } = await merchantAccess(req, 'staff.manage', { write: true });
  const { inviteId } = IdOf('inviteId').parse(req.params);
  const { count } = await db().merchantInvite.updateMany({ where: { id: inviteId as bigint, merchantId: merchant.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!count) throw new AppError('NOT_FOUND', 404, 'Invitation not found');
  await audit({ actorId: user.id, action: 'merchant.inviteRevoked', entityType: 'Merchant', entityId: merchant.id, after: { inviteId: String(inviteId) }, ip: requestIp(req) });
  res.status(204).end();
});

portalRouter.patch(`${base}/staff/:memberId`, requireAuth, async (req, res) => {
  const ctx = await merchantAccess(req, 'staff.manage', { write: true });
  const { memberId } = IdOf('memberId').parse(req.params);
  const m = await updateStaff(ctx, memberId as bigint, StaffPatch.parse(req.body), requestIp(req));
  res.json({ data: { id: m.id.toString(), role: m.role, status: m.status, outletId: m.outletId?.toString() ?? null } });
});

// ───────── Invitations (invitee side) ─────────

const TokenBody = z.object({ token: z.string().min(20).max(200) });

portalRouter.get('/merchant-invites/preview', authLimiter, async (req, res) => {
  res.json({ data: await previewInvite(TokenBody.parse(req.query).token) });
});

portalRouter.post('/merchant-invites/accept', requireAuth, authLimiter, async (req, res) => {
  res.json({ data: await acceptInvite(currentUser(req), TokenBody.parse(req.body).token) });
});
