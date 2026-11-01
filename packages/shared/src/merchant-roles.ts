/**
 * What each merchant staff role may do inside the merchant portal (OPEN-17: proposed split, pending Andy).
 * Separate from platform permissions: these apply only to the merchant the staff member belongs to.
 */
export const MERCHANT_ACTIONS = {
  'profile.edit': 'Edit the public business profile',
  'outlets.manage': 'Add and edit outlets',
  'staff.manage': 'Invite and disable cashiers',
  'staff.manageManagers': 'Invite and disable managers',
  'listings.read': 'View listings',
  'listings.manage': 'Create, edit and submit listings',
  'vouchers.manage': 'Create voucher offers and send them for approval',
  'vouchers.redeem': 'Redeem member vouchers',
  'redemptions.readAll': 'See every redemption at this business (cashiers see only their own)',
} as const;

export type MerchantAction = keyof typeof MERCHANT_ACTIONS;
export type MerchantRoleKey = 'OWNER' | 'MANAGER' | 'CASHIER';

export const MERCHANT_ROLE_ACTIONS: Record<MerchantRoleKey, readonly MerchantAction[]> = {
  OWNER: Object.keys(MERCHANT_ACTIONS) as MerchantAction[],
  MANAGER: ['profile.edit', 'outlets.manage', 'staff.manage', 'listings.read', 'listings.manage', 'vouchers.manage', 'vouchers.redeem', 'redemptions.readAll'],
  CASHIER: ['listings.read', 'vouchers.redeem'],
};

export const merchantCan = (role: MerchantRoleKey, action: MerchantAction) => MERCHANT_ROLE_ACTIONS[role].includes(action);
