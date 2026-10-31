import { PERMISSIONS, SYSTEM_ROLES } from '@andy/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { logger } from '../../core/logger.js';

/**
 * Makes the Permission table and system roles match packages/shared/permissions.ts.
 * Idempotent; runs at startup, so no seed step is needed on Hostinger.
 * System role permission sets are reset to the code definition (custom roles are left alone).
 */
export async function syncRbac(db: PrismaClient): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const [key, description] of Object.entries(PERMISSIONS)) {
      await tx.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
    }
    const perms = await tx.permission.findMany();
    const idByKey = new Map(perms.map((p) => [p.key, p.id]));

    for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
      const role = await tx.role.upsert({
        where: { key },
        create: { key, name: def.name, description: def.description, isSystem: true },
        update: { name: def.name, description: def.description, isSystem: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: def.permissions.map((p) => ({ roleId: role.id, permissionId: idByKey.get(p)! })),
      });
    }
  });
  logger.info('RBAC synced');
}

export async function listRoles(db: PrismaClient) {
  const roles = await db.role.findMany({
    orderBy: { id: 'asc' },
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
  });
  return roles.map((r) => ({
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    userCount: r._count.users,
    permissions: r.permissions.map((p) => p.permission.key).sort(),
  }));
}
