import { Router } from 'express';
import { z } from 'zod';
import { audit, requestIp } from '../../core/audit.js';
import { currentUser, requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { SETTINGS } from './settings.registry.js';
import { getSettings, isSettingKey, parseSetting } from './settings.service.js';

export const settingsRouter = Router();

settingsRouter.get('/public/settings', async (_req, res) => {
  res.json({ data: await getSettings(db(), true) });
});

settingsRouter.get('/admin/settings', requireAuth, requirePermission('admin.access', 'settings.read'), async (_req, res) => {
  const values = await getSettings(db());
  const fields = Object.entries(SETTINGS).map(([key, d]) => ({
    key,
    label: d.label,
    kind: d.kind,
    help: 'help' in d ? d.help : undefined,
    options: 'options' in d ? d.options : undefined,
  }));
  res.json({ data: { values, fields } });
});

const Body = z.object({ value: z.unknown() });

settingsRouter.put('/admin/settings/:key', requireAuth, requirePermission('admin.access', 'settings.manage'), async (req, res) => {
  const key = String(req.params.key);
  if (!isSettingKey(key)) throw new AppError('UNKNOWN_SETTING', 404, 'Unknown setting');
  const value = parseSetting(key, Body.parse(req.body).value);
  const actor = currentUser(req);
  await db().$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key } });
    await tx.setting.upsert({ where: { key }, create: { key, value, updatedById: actor.id }, update: { value, updatedById: actor.id } });
    await audit(
      { actorId: actor.id, action: 'setting.changed', entityType: 'Setting', entityId: key, before: before?.value ?? null, after: value, ip: requestIp(req) },
      tx,
    );
  });
  res.json({ data: await getSettings(db()) });
});
