import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { SETTINGS, SETTING_KEYS, type SettingKey } from './settings.registry.js';

export async function getSettings(db: PrismaClient, onlyPublic = false): Promise<Record<string, unknown>> {
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

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTINGS;
}

export function parseSetting(key: SettingKey, value: unknown): Prisma.InputJsonValue {
  return SETTINGS[key].schema.parse(value) as Prisma.InputJsonValue;
}
