import { Router } from 'express';
import { PERMISSIONS } from '@andy/shared';
import { requireAuth, requirePermission } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { listRoles } from './rbac.service.js';

export const rbacRouter = Router();

rbacRouter.get('/admin/roles', requireAuth, requirePermission('admin.access', 'roles.read'), async (_req, res) => {
  res.json({ data: { roles: await listRoles(db()), permissions: PERMISSIONS } });
});
