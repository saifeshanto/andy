import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { audit, requestIp } from '../../core/audit.js';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { slugify } from '../merchants/merchants.service.js';

/**
 * Starting categories from PROJECT_PLAN M8, created only when there are none. Admins can rename,
 * reorder or hide them (question 10 for Andy).
 */
const STARTER = ['Servicing', 'Tyres', 'Car wash & detailing', 'Accessories', 'Insurance', 'Towing'];

export async function ensureDefaultCategories(client: PrismaClient): Promise<void> {
  if ((await client.category.count()) > 0) return;
  await client.category.createMany({ data: STARTER.map((name, i) => ({ name, slug: slugify(name), sort: i * 10 })) });
}

const present = (c: { id: number; name: string; slug: string; sort: number; isActive: boolean }) => ({ id: c.id, name: c.name, slug: c.slug, sort: c.sort, isActive: c.isActive });

export const categoriesRouter = Router();

categoriesRouter.get('/public/categories', async (_req, res) => {
  const rows = await db().category.findMany({ where: { isActive: true }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] });
  res.json({ data: rows.map(present) });
});

const Body = z.object({ name: z.string().trim().min(2).max(100), sort: z.coerce.number().int().min(0).max(10000).optional(), isActive: z.boolean().optional() });

categoriesRouter.get('/admin/categories', requireAuth, requirePermission('admin.access', 'catalog.manage'), async (_req, res) => {
  const rows = await db().category.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }] });
  const counts = await db().listing.groupBy({ by: ['categoryId'], _count: true });
  const byId = new Map(counts.map((c) => [c.categoryId, c._count]));
  res.json({ data: rows.map((c) => ({ ...present(c), listings: byId.get(c.id) ?? 0 })) });
});

categoriesRouter.post('/admin/categories', requireAuth, requirePermission('admin.access', 'catalog.manage'), async (req, res) => {
  const body = Body.parse(req.body);
  const slug = slugify(body.name);
  if (await db().category.findUnique({ where: { slug } })) throw new AppError('CATEGORY_EXISTS', 409, 'A category with this name already exists');
  const c = await db().category.create({ data: { name: body.name, slug, sort: body.sort ?? 0, isActive: body.isActive ?? true } });
  await audit({ actorId: currentUser(req).id, action: 'category.created', entityType: 'Category', entityId: String(c.id), after: present(c), ip: requestIp(req) });
  res.status(201).json({ data: present(c) });
});

categoriesRouter.patch('/admin/categories/:id', requireAuth, requirePermission('admin.access', 'catalog.manage'), async (req, res) => {
  const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
  const body = Body.partial().parse(req.body);
  const before = await db().category.findUnique({ where: { id } });
  if (!before) throw new AppError('NOT_FOUND', 404, 'Category not found');
  // The slug stays fixed so existing links keep working.
  const c = await db().category.update({ where: { id }, data: body });
  await audit({ actorId: currentUser(req).id, action: 'category.updated', entityType: 'Category', entityId: String(id), before: present(before), after: present(c), ip: requestIp(req) });
  res.json({ data: present(c) });
});
