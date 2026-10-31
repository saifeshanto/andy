import { z } from 'zod';

type Kind = 'text' | 'boolean' | 'select' | 'numberList';

interface SettingDef<T> {
  schema: z.ZodType<T>;
  default: T;
  public: boolean;
  label: string;
  kind: Kind;
  help?: string;
  options?: { value: string; label: string }[];
}

const def = <T,>(d: SettingDef<T>) => d;

/**
 * Every editable setting, its validation and default. Settings tied to an unanswered business question
 * default to "not set", and the feature that needs them refuses to act until an admin sets them.
 */
export const SETTINGS = {
  'site.name': def({ schema: z.string().trim().min(2).max(80), default: 'Andy Auto Club', public: true, label: 'Site name', kind: 'text' }),
  'site.contactEmail': def({ schema: z.string().trim().email().or(z.literal('')), default: '', public: true, label: 'Contact email', kind: 'text' }),
  'site.contactPhone': def({ schema: z.string().trim().max(30), default: '', public: true, label: 'Contact phone', kind: 'text' }),
  'site.maintenanceMode': def({ schema: z.boolean(), default: false, public: true, label: 'Maintenance mode', kind: 'boolean' }),

  'membership.renewalStartsFrom': def({
    schema: z.enum(['', 'CURRENT_END', 'PAYMENT_DATE']),
    default: '' as '' | 'CURRENT_END' | 'PAYMENT_DATE',
    public: false,
    label: 'Early renewal: new year starts from',
    kind: 'select',
    help: 'Until this is set, members with an active membership cannot renew early (OPEN-02).',
    options: [
      { value: '', label: 'Not set (early renewal off)' },
      { value: 'CURRENT_END', label: 'End of current membership (member loses nothing)' },
      { value: 'PAYMENT_DATE', label: 'Payment date (remaining time is replaced)' },
    ],
  }),
  'membership.reminderDays': def({
    schema: z.array(z.number().int().min(-60).max(90)).max(10),
    default: [] as number[],
    public: false,
    label: 'Renewal reminder days',
    kind: 'numberList',
    help: 'Comma-separated. Positive = days before expiry, negative = days after. Empty = no reminders (OPEN-03).',
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'];
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
