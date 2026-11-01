import type { Merchant, MerchantDocumentType, Prisma } from '../../generated/prisma/client.js';
import { audit } from '../../core/audit.js';
import { publicId } from '../../core/crypto.js';
import { db } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { fileUrl, ownedFile } from '../files/index.js';
import { queueEmail } from '../notifications/index.js';
import type { ApplicationDraft } from './merchants.schemas.js';

/** States in which the applicant may still edit and add documents. */
const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'] as const;
/** Applications that count as "in progress", so a user cannot open several at once. */
const OPEN = ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED'] as const;

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'merchant'
  );
}

async function uniqueMerchantSlug(name: string, exceptId?: bigint): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db().merchant.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${publicId(6).toLowerCase()}`;
}

/** The merchant this user owns, looked up by public id. Applicant-side routes only. */
export async function ownApplication(userId: bigint, merchantPublicId: string) {
  const m = await db().merchant.findUnique({
    where: { publicId: merchantPublicId },
    include: { members: { where: { userId, role: 'OWNER' } } },
  });
  if (!m || m.members.length === 0) throw new AppError('NOT_FOUND', 404, 'Application not found');
  return m;
}

async function logoData(userId: bigint, logoFileId: string | null | undefined): Promise<{ logoFileId?: bigint | null }> {
  if (logoFileId === undefined) return {};
  if (logoFileId === null || logoFileId === '') return { logoFileId: null };
  return { logoFileId: (await ownedFile(userId, logoFileId, 'MERCHANT_LOGO')).id };
}

export async function createApplication(user: { id: bigint; status: string }, input: ApplicationDraft) {
  if (user.status !== 'ACTIVE') throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please confirm your email address before applying');
  const open = await db().merchant.count({ where: { createdById: user.id, status: { in: [...OPEN] } } });
  if (open > 0) throw new AppError('APPLICATION_IN_PROGRESS', 409, 'You already have an application in progress');
  const { logoFileId, ...fields } = input;
  const pid = publicId(16);
  const merchant = await db().$transaction(async (tx) => {
    const m = await tx.merchant.create({
      data: { ...fields, ssmNo: fields.ssmNo ?? '', ...(await logoData(user.id, logoFileId)), publicId: pid, slug: `draft-${pid.toLowerCase()}`, createdById: user.id },
    });
    await tx.merchantMember.create({ data: { merchantId: m.id, userId: user.id, role: 'OWNER' } });
    await audit({ actorId: user.id, action: 'merchant.applicationCreated', entityType: 'Merchant', entityId: m.id, after: { name: m.name } }, tx);
    return m;
  });
  return merchant;
}

export async function updateApplication(userId: bigint, merchantPublicId: string, input: Partial<ApplicationDraft>) {
  const m = await ownApplication(userId, merchantPublicId);
  if (!(EDITABLE as readonly string[]).includes(m.status)) throw new AppError('NOT_EDITABLE', 409, 'This application can no longer be edited');
  const { logoFileId, ...fields } = input;
  return db().merchant.update({ where: { id: m.id }, data: { ...fields, ...(await logoData(userId, logoFileId)) } });
}

export async function addDocument(userId: bigint, merchantPublicId: string, type: MerchantDocumentType, filePublicId: string) {
  const m = await ownApplication(userId, merchantPublicId);
  if (!(EDITABLE as readonly string[]).includes(m.status)) throw new AppError('NOT_EDITABLE', 409, 'This application can no longer be edited');
  const file = await ownedFile(userId, filePublicId, 'MERCHANT_DOCUMENT');
  if (await db().merchantDocument.findUnique({ where: { fileId: file.id } })) throw new AppError('ALREADY_ATTACHED', 409, 'This file is already attached');
  if ((await db().merchantDocument.count({ where: { merchantId: m.id } })) >= 10) throw new AppError('TOO_MANY_DOCUMENTS', 409, 'At most 10 documents');
  return db().merchantDocument.create({ data: { merchantId: m.id, type, fileId: file.id } });
}

export async function removeDocument(userId: bigint, merchantPublicId: string, documentId: bigint) {
  const m = await ownApplication(userId, merchantPublicId);
  if (!(EDITABLE as readonly string[]).includes(m.status)) throw new AppError('NOT_EDITABLE', 409, 'This application can no longer be edited');
  const { count } = await db().merchantDocument.deleteMany({ where: { id: documentId, merchantId: m.id } });
  if (!count) throw new AppError('NOT_FOUND', 404, 'Document not found');
}

/** What is still missing before an application can be submitted. Empty means ready. */
export async function missingForSubmit(m: Merchant): Promise<string[]> {
  const missing: string[] = [];
  if (!m.ssmNo) missing.push('SSM registration number');
  if (!m.phone) missing.push('Business phone');
  if (!m.addressLine1 || !m.city || !m.state || !m.postcode) missing.push('Full business address');
  const ssm = await db().merchantDocument.count({ where: { merchantId: m.id, type: 'SSM_CERTIFICATE' } });
  if (!ssm) missing.push('SSM certificate (upload)');
  return missing;
}

export async function submitApplication(user: { id: bigint; email: string }, merchantPublicId: string) {
  const m = await ownApplication(user.id, merchantPublicId);
  if (!(EDITABLE as readonly string[]).includes(m.status)) throw new AppError('NOT_EDITABLE', 409, 'This application has already been submitted');
  const missing = await missingForSubmit(m);
  if (missing.length) throw new AppError('APPLICATION_INCOMPLETE', 400, `Please complete: ${missing.join(', ')}`, { missing });
  await db().$transaction(async (tx) => {
    const { count } = await tx.merchant.updateMany({ where: { id: m.id, status: { in: [...EDITABLE] } }, data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null } });
    if (!count) throw new AppError('NOT_EDITABLE', 409, 'This application has already been submitted');
    await audit({ actorId: user.id, action: 'merchant.applicationSubmitted', entityType: 'Merchant', entityId: m.id }, tx);
    const owner = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    await queueEmail(owner.email, 'merchantApplicationReceived', { name: owner.fullName, merchant: m.name }, tx);
  });
}

// ───────── Admin review ─────────

type Decision = 'approve' | 'requestChanges' | 'reject' | 'suspend' | 'reinstate';
const TRANSITIONS: Record<Decision, { from: Merchant['status'][]; to: Merchant['status']; action: string; email?: 'merchantApproved' | 'merchantChangesRequested' | 'merchantRejected' | 'merchantSuspended' }> = {
  approve: { from: ['SUBMITTED'], to: 'APPROVED', action: 'merchant.approved', email: 'merchantApproved' },
  requestChanges: { from: ['SUBMITTED'], to: 'CHANGES_REQUESTED', action: 'merchant.changesRequested', email: 'merchantChangesRequested' },
  reject: { from: ['SUBMITTED'], to: 'REJECTED', action: 'merchant.rejected', email: 'merchantRejected' },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED', action: 'merchant.suspended', email: 'merchantSuspended' },
  reinstate: { from: ['SUSPENDED'], to: 'APPROVED', action: 'merchant.reinstated' },
};

/**
 * Moves a merchant between review states. The status check and the update are one statement,
 * so two admins acting at once cannot both succeed.
 */
export async function decide(actor: { id: bigint; ip: string | null }, merchantPublicId: string, decision: Decision, note?: string) {
  const t = TRANSITIONS[decision];
  const m = await db().merchant.findUnique({ where: { publicId: merchantPublicId } });
  if (!m) throw new AppError('NOT_FOUND', 404, 'Merchant not found');
  return db().$transaction(async (tx) => {
    const data: Prisma.MerchantUpdateManyMutationInput = { status: t.to, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note ?? null };
    if (decision === 'approve') data.slug = await uniqueMerchantSlug(m.name, m.id);
    const { count } = await tx.merchant.updateMany({ where: { id: m.id, status: { in: t.from } }, data });
    if (!count) throw new AppError('INVALID_STATE', 409, `This merchant is ${m.status.toLowerCase().replace('_', ' ')}, so it cannot be changed this way`);

    // On first approval, the business address becomes the first outlet so the merchant can start listing at once.
    if (decision === 'approve' && m.addressLine1 && m.city && m.state && m.postcode && (await tx.merchantOutlet.count({ where: { merchantId: m.id } })) === 0) {
      await tx.merchantOutlet.create({
        data: { merchantId: m.id, name: m.name, addressLine1: m.addressLine1, addressLine2: m.addressLine2, city: m.city, state: m.state, postcode: m.postcode, phone: m.phone },
      });
    }
    await audit({ actorId: actor.id, action: t.action, entityType: 'Merchant', entityId: m.id, before: { status: m.status }, after: { status: t.to, note: note ?? null }, ip: actor.ip }, tx);
    if (t.email) {
      const owners = await tx.merchantMember.findMany({ where: { merchantId: m.id, role: 'OWNER' }, select: { userId: true } });
      const users = await tx.user.findMany({ where: { id: { in: owners.map((o) => o.userId) } } });
      for (const u of users) await queueEmail(u.email, t.email, { name: u.fullName, merchant: m.name, note: note ?? '' }, tx);
    }
    return tx.merchant.findUniqueOrThrow({ where: { id: m.id } });
  });
}

// ───────── Presenters ─────────

export async function presentMerchant(m: Merchant, opts: { documents?: boolean } = {}) {
  const [logo, docs] = await Promise.all([
    m.logoFileId ? db().storedFile.findUnique({ where: { id: m.logoFileId }, select: { publicId: true } }) : null,
    opts.documents
      ? db().merchantDocument.findMany({ where: { merchantId: m.id }, orderBy: { id: 'asc' } }).then(async (rows) => {
          const files = await db().storedFile.findMany({ where: { id: { in: rows.map((r) => r.fileId) } } });
          const byId = new Map(files.map((f) => [f.id, f]));
          return rows.map((r) => {
            const f = byId.get(r.fileId);
            return { id: r.id.toString(), type: r.type, url: fileUrl(f?.publicId), name: f?.originalName, mime: f?.mime, sizeBytes: f?.sizeBytes, createdAt: r.createdAt };
          });
        })
      : undefined,
  ]);
  return {
    id: m.publicId,
    slug: m.status === 'APPROVED' || m.status === 'SUSPENDED' ? m.slug : null,
    name: m.name,
    businessType: m.businessType,
    ssmNo: m.ssmNo,
    description: m.description,
    phone: m.phone,
    email: m.email,
    website: m.website,
    addressLine1: m.addressLine1,
    addressLine2: m.addressLine2,
    city: m.city,
    state: m.state,
    postcode: m.postcode,
    logo: logo ? { id: logo.publicId, url: fileUrl(logo.publicId) } : null,
    status: m.status,
    submittedAt: m.submittedAt,
    reviewedAt: m.reviewedAt,
    reviewNote: m.reviewNote,
    createdAt: m.createdAt,
    ...(docs ? { documents: docs } : {}),
  };
}
