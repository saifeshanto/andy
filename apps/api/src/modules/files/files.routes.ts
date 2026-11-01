import express, { Router } from 'express';
import { z } from 'zod';
import { currentUser, optionalAuth, requireAuth } from '../../core/auth.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { uploadLimiter } from '../../core/rate-limit.js';
import { openObject } from '../../core/storage.js';
import { fileUrl, MAX_UPLOAD_BYTES, storeUpload } from './files.service.js';

export const filesRouter = Router();

const UploadQuery = z.object({ purpose: z.enum(['MERCHANT_DOCUMENT', 'MERCHANT_LOGO', 'MERCHANT_COVER', 'LISTING_IMAGE']) });

/**
 * Upload one file as the raw request body (no multipart). The browser sends the File object directly
 * and the name in `x-file-name`. The file is attached to a record by a separate call.
 */
filesRouter.post(
  '/uploads',
  requireAuth,
  uploadLimiter,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    const { purpose } = UploadQuery.parse(req.query);
    const user = currentUser(req);
    if (user.status !== 'ACTIVE') throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please confirm your email address first');
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const name = decodeURIComponent(req.header('x-file-name') ?? '').slice(0, 200);
    const file = await storeUpload(user.id, purpose, body, name);
    res.status(201).json({ data: { id: file.publicId, url: fileUrl(file.publicId), mime: file.mime, sizeBytes: file.sizeBytes, name: file.originalName } });
  },
);

/** Serves a file. Public files to anyone; private files (merchant documents) only to permitted users. */
filesRouter.get('/files/:publicId', optionalAuth, async (req, res) => {
  const { publicId } = z.object({ publicId: z.string().regex(/^[A-Za-z0-9]{10,32}$/) }).parse(req.params);
  const file = await db().storedFile.findUnique({ where: { publicId } });
  if (!file) throw new AppError('NOT_FOUND', 404, 'File not found');
  if (file.visibility === 'PRIVATE' && !(await canReadPrivate(req.user, file))) throw new AppError('NOT_FOUND', 404, 'File not found');

  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', String(file.sizeBytes));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', `${file.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename="${file.originalName.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', file.visibility === 'PUBLIC' ? 'public, max-age=31536000, immutable' : 'private, no-store');
  const stream = openObject(file.storageKey);
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  });
  stream.pipe(res);
});

async function canReadPrivate(user: Express.Request['user'], file: { id: bigint; ownerUserId: bigint }): Promise<boolean> {
  if (!user) return false;
  if (file.ownerUserId === user.id || user.permissions.has('merchants.read')) return true;
  const doc = await db().merchantDocument.findUnique({ where: { fileId: file.id } });
  if (!doc) return false;
  const seat = await db().merchantMember.findUnique({ where: { merchantId_userId: { merchantId: doc.merchantId, userId: user.id } } });
  return !!seat && seat.status === 'ACTIVE' && (seat.role === 'OWNER' || seat.role === 'MANAGER');
}
