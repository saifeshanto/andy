import { z } from 'zod';

/**
 * Every editable setting, its validation and default. Money-related settings (membership price,
 * commission amounts, withdrawal rules) are added with their modules once the business rules are confirmed.
 */
export const SETTINGS = {
  'site.name': { schema: z.string().trim().min(2).max(80), default: 'Andy Auto Club', public: true, label: 'Site name' },
  'site.contactEmail': { schema: z.string().trim().email().or(z.literal('')), default: '', public: true, label: 'Contact email' },
  'site.contactPhone': { schema: z.string().trim().max(30), default: '', public: true, label: 'Contact phone' },
  'site.maintenanceMode': { schema: z.boolean(), default: false, public: true, label: 'Maintenance mode' },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
