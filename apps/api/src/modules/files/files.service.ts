import { createHash } from 'node:crypto';
import type { FilePurpose, FileVisibility } from '../../generated/prisma/client.js';
import { publicId } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { putObject, sniffType } from '../../core/storage.js';

const MB = 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];

/** What each kind of upload may contain, how big it may be, and who may see it. */
export const UPLOAD_RULES: Record<FilePurpose, { mimes: string[]; maxBytes: number; visibility: FileVisibility }> = {
  MERCHANT_DOCUMENT: { mimes: [...IMAGES, 'application/pdf'], maxBytes: 5 * MB, visibility: 'PRIVATE' },
  MERCHANT_LOGO: { mimes: IMAGES, maxBytes: 2 * MB, visibility: 'PUBLIC' },
  MERCHANT_COVER: { mimes: IMAGES, maxBytes: 3 * MB, visibility: 'PUBLIC' },
  LISTING_IMAGE: { mimes: IMAGES, maxBytes: 3 * MB, visibility: 'PUBLIC' },
};
export const MAX_UPLOAD_BYTES = 5 * MB;

export async function storeUpload(ownerUserId: bigint, purpose: FilePurpose, buf: Buffer, originalName: string) {
  const rule = UPLOAD_RULES[purpose];
  if (buf.length === 0) throw new AppError('EMPTY_FILE', 400, 'The file is empty');
  if (buf.length > rule.maxBytes) throw new AppError('FILE_TOO_LARGE', 413, `The file is too large (max ${rule.maxBytes / MB} MB)`);
  const type = sniffType(buf);
  if (!type || !rule.mimes.includes(type.mime)) {
    throw new AppError('FILE_TYPE_NOT_ALLOWED', 415, rule.mimes.includes('application/pdf') ? 'Upload a JPG, PNG, WebP or PDF file' : 'Upload a JPG, PNG or WebP image');
  }
  const storageKey = await putObject(buf, type.ext);
  const safeName = originalName.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || `file.${type.ext}`;
  return db().storedFile.create({
    data: {
      publicId: publicId(24),
      ownerUserId,
      purpose,
      visibility: rule.visibility,
      mime: type.mime,
      sizeBytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
      storageKey,
      originalName: safeName,
    },
  });
}

/** URL the browser uses to fetch a file. Private files still need a signed-in, permitted user. */
export const fileUrl = (publicId: string | null | undefined) => (publicId ? `/api/v1/files/${publicId}` : null);

/** Finds a file the user uploaded for this purpose, or fails. Used when attaching a file to a record. */
export async function ownedFile(userId: bigint, filePublicId: string, purpose: FilePurpose) {
  const file = await db().storedFile.findUnique({ where: { publicId: filePublicId } });
  if (!file || file.ownerUserId !== userId || file.purpose !== purpose) throw new AppError('FILE_NOT_FOUND', 404, 'Upload not found');
  return file;
}
