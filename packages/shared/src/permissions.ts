/**
 * Every permission key in the platform. The API syncs these into the Permission table at startup,
 * so adding one here is enough to make it assignable. Naming: <area>.<action>.
 */
export const PERMISSIONS = {
  'admin.access': 'Open the admin area',
  'users.read': 'View users and their details',
  'users.manage': 'Suspend or reactivate users',
  'roles.read': 'View roles and permissions',
  'roles.assign': 'Grant or remove admin roles on users',
  'settings.read': 'View platform settings',
  'settings.manage': 'Change platform settings',
  'audit.read': 'View the audit log',
  'emails.read': 'View the email log',
  'emails.manage': 'Retry failed emails',
  'memberships.read': 'View memberships',
  'orders.read': 'View orders and payments',
  'payments.manage': 'Re-check a payment with the gateway',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * System roles (PROJECT_PLAN.md section 2). Their permission sets are a starting point and can be
 * reviewed with Andy; money permissions (withdrawals, payouts) arrive with those modules.
 */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: { name: 'Super Admin', description: 'Full access, including roles and settings', permissions: ALL_PERMISSIONS },
  OPERATIONS: {
    name: 'Operations',
    description: 'Approvals, member support, content',
    permissions: ['admin.access', 'users.read', 'users.manage', 'settings.read', 'emails.read', 'emails.manage', 'memberships.read', 'orders.read'],
  },
  FINANCE: {
    name: 'Finance',
    description: 'Wallets, withdrawals, payouts and financial reports',
    permissions: ['admin.access', 'users.read', 'audit.read', 'settings.read', 'memberships.read', 'orders.read', 'payments.manage'],
  },
  SUPPORT: {
    name: 'Support',
    description: 'Read-mostly customer support',
    permissions: ['admin.access', 'users.read', 'emails.read', 'emails.manage', 'memberships.read', 'orders.read'],
  },
} as const satisfies Record<string, { name: string; description: string; permissions: readonly PermissionKey[] }>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
