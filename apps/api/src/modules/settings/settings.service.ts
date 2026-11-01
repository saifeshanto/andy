import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { SETTINGS, SETTING_KEYS, type SettingKey, type SettingValue } from './settings.registry.js';

type Reader = PrismaClient | Prisma.TransactionClient;

export async function getSettings(db: Reader, onlyPublic = false): Promise<Record<string, unknown>> {
  const keys = SETTING_KEYS.filter((k) => !onlyPublic || SETTINGS[k].public);
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const parsed = SETTINGS[key].schema.safeParse(stored.get(key));
    out[key] = parsed.success ? parsed.data : SETTINGS[key].default;
  }
  return out;
}

/** One typed setting, falling back to its default. */
export async function getSetting<K extends SettingKey>(db: Reader, key: K): Promise<SettingValue<K>> {
  const row = await db.setting.findUnique({ where: { key } });
  const parsed = SETTINGS[key].schema.safeParse(row?.value);
  return (parsed.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
}

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTINGS;
}

export function parseSetting(key: SettingKey, value: unknown): Prisma.InputJsonValue {
  return SETTINGS[key].schema.parse(value) as Prisma.InputJsonValue;
}
