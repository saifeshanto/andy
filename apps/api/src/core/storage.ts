import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { randomToken } from './crypto.js';
import { AppError } from './errors.js';

/**
 * Local-disk file storage. Kept behind these few functions so moving to object storage later (OPEN-37)
 * only changes this file.
 */
export function uploadRoot(): string {
  const cfg = env();
  if (cfg.UPLOAD_DIR) return path.resolve(cfg.UPLOAD_DIR);
  if (cfg.NODE_ENV === 'production' || cfg.NODE_ENV === 'staging') {
    // Inside the app folder, files would be deleted by the next deploy. Refuse rather than lose them.
    throw new AppError('UPLOADS_NOT_CONFIGURED', 503, 'File uploads are not set up yet');
  }
  return path.resolve(process.cwd(), 'storage/uploads');
}

export type SniffedType = { mime: string; ext: string };

/** Identifies a file from its first bytes. The client's Content-Type is never trusted. */
export function sniffType(buf: Buffer): SniffedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

/** Writes bytes under a random name in a year/month folder. Returns the storage key (relative path). */
export async function putObject(buf: Buffer, ext: string, now = new Date()): Promise<string> {
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomToken(18)}.${ext}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { mode: 0o640, flag: 'wx' });
  return key;
}

export function openObject(key: string) {
  return createReadStream(resolveKey(key));
}

export async function deleteObject(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}

function resolveKey(key: string): string {
  const root = uploadRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return full;
}
