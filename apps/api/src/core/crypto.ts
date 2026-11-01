import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token for emails and refresh cookies. Only its hash is stored. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Public, non-sequential id for URLs (no ambiguous characters). */
export function publicId(length = 16): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
