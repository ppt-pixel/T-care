import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { createSignedUploadUrl, createSignedDownloadUrl, removeObject } from '../lib/supabaseStorage.js';

const router = Router();
router.use(requireAuth);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const allowedVideoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const allowedDocumentTypes = new Set(['application/pdf']);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const kindSchema = z.enum(['PLANT_PHOTO', 'SERVICE_REPORT_PHOTO', 'PROFILE_PHOTO', 'MAKEOVER_MEDIA', 'SERVICE_MEDIA', 'KYC_DOCUMENT']);
const targetSchema = z.object({ targetType: z.enum(['PLANT', 'SERVICE_REPORT', 'BOOKING', 'PROFILE', 'MAKEOVER', 'SERVICE', 'KYC_DOCUMENT']), targetId: z.string().min(1) }).nullable().optional();

function fail(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }

function validateObjectKey(key, userId) {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('//')) throw fail(400, 'INVALID_OBJECT_KEY', 'Invalid storage object key.');
  if (!key.startsWith(`${userId}/`)) throw fail(403, 'INVALID_MEDIA_OWNER', 'Media object key must belong to the authenticated user.');
  if (key.length > 500) throw fail(400, 'INVALID_OBJECT_KEY', 'Storage object key is too long.');
}

function validateFile(contentType, sizeBytes, kind) {
  const isImage = allowedImageTypes.has(contentType);
  const isVideo = allowedVideoTypes.has(contentType);
  const isKycDocument = kind === 'KYC_DOCUMENT' && allowedDocumentTypes.has(contentType);
  if (!isImage && !isVideo && !isKycDocument) throw fail(400, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type.');
  if (kind === 'KYC_DOCUMENT' && !isImage && !isKycDocument) throw fail(400, 'UNSUPPORTED_MEDIA_TYPE', 'KYC documents must be PDF or a supported image.');
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw fail(400, 'INVALID_MEDIA_SIZE', 'A positive file size is required.');
  if (isImage && sizeBytes > MAX_IMAGE_BYTES) throw fail(413, 'MEDIA_TOO_LARGE', 'Images must be 10 MB or smaller.');
  if (isVideo && sizeBytes > MAX_VIDEO_BYTES) throw fail(413, 'MEDIA_TOO_LARGE', 'Videos must be 100 MB or smaller.');
  if (isKycDocument && sizeBytes > MAX_DOCUMENT_BYTES) throw fail(413, 'MEDIA_TOO_LARGE', 'KYC documents must be 10 MB or smaller.');
}

async function canAccessTarget(user, targetType, targetId) {
  if (!targetType || !targetId) return;
  if (user.role === 'ADMIN') return;
  if (targetType === 'PROFILE') {
    if (targetId !== user.id) throw fail(403, 'FORBIDDEN', 'You cannot manage another user profile media.');
    return;
  }
  if (targetType === 'PLANT') {
    const plant = await prisma.plant.findUnique({ where: { id: targetId }, select: { customer: { select: { userId: true } } } });
    if (!plant || plant.customer.userId !== user.id) throw fail(403, 'FORBIDDEN', 'Only the plant owner or an administrator can manage plant media.');
    return;
  }
  if (targetType === 'BOOKING') {
    const booking = await prisma.booking.findUnique({ where: { id: targetId }, select: { customer: { select: { userId: true } }, assignment: { select: { gardener: { select: { userId: true } } } } } });
    if (!booking || (booking.customer.userId !== user.id && booking.assignment?.gardener?.userId !== user.id)) throw fail(403, 'FORBIDDEN', 'You cannot manage media for this booking.');
    return;
  }
  if (targetType === 'KYC_DOCUMENT') {
    const gardener = await prisma.gardenerProfile.findUnique({ where: { id: targetId }, select: { userId: true } });
    if (!gardener || gardener.userId !== user.id) throw fail(403, 'FORBIDDEN', 'Only the Gardener who owns this profile can manage its KYC documents.');
    return;
  }
  if (targetType === 'SERVICE_REPORT') {
    const report = await prisma.serviceReport.findUnique({ where: { id: targetId }, select: { booking: { select: { customer: { select: { userId: true } }, assignment: { select: { gardener: { select: { userId: true } } } } } } } });
    if (!report || (report.booking.customer.userId !== user.id && report.booking.assignment?.gardener?.userId !== user.id)) throw fail(403, 'FORBIDDEN', 'You cannot manage media for this service report.');
    return;
  }
  if (targetType === 'MAKEOVER' || targetType === 'SERVICE') {
    // These targets may be introduced by later domain modules. Only Admin may
    // attach media until a concrete ownership relation exists.
    if (user.role !== 'ADMIN') throw fail(403, 'FORBIDDEN', 'This media target is currently restricted to administrators.');
  }
}

function buildObjectKey(userId, kind, contentType) {
  const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  const folder = kind === 'PLANT_PHOTO' ? 'plants' : kind === 'SERVICE_REPORT_PHOTO' ? 'reports' : kind === 'PROFILE_PHOTO' ? 'users' : kind === 'KYC_DOCUMENT' ? 'kyc' : kind === 'MAKEOVER_MEDIA' ? 'makeovers' : 'services';
  return `${userId}/${folder}/${crypto.randomUUID()}.${extension}`;
}

router.post('/upload-intent', async (req, res, next) => {
  try {
    const input = z.object({
      kind: kindSchema,
      contentType: z.string().trim().toLowerCase(),
      sizeBytes: z.number().int().positive(),
      target: targetSchema
    }).strict().parse(req.body);
    validateFile(input.contentType, input.sizeBytes, input.kind);
    await canAccessTarget(req.auth, input.target?.targetType, input.target?.targetId);

    const objectKey = buildObjectKey(req.auth.id, input.kind, input.contentType);
    const asset = await prisma.mediaAsset.create({ data: {
      ownerUserId: req.auth.id,
      bucket: env.SUPABASE_STORAGE_BUCKET,
      objectKey,
      kind: input.kind,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      targetType: input.target?.targetType ?? null,
      targetId: input.target?.targetId ?? null
    }});

    const upload = await createSignedUploadUrl(objectKey);
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'MediaAsset', entityId: asset.id, metadata: { kind: input.kind, targetType: input.target?.targetType ?? null, targetId: input.target?.targetId ?? null } } });
    return res.status(201).json({ asset, uploadUrl: upload.url, token: upload.token });
  } catch (error) { next(error); }
});

router.post('/:id/complete', async (req, res, next) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw fail(404, 'MEDIA_NOT_FOUND', 'Media asset not found.');
    if (asset.ownerUserId !== req.auth.id && req.auth.role !== 'ADMIN') throw fail(403, 'FORBIDDEN', 'You cannot complete this media upload.');
    if (asset.status === 'DELETED') throw fail(410, 'MEDIA_DELETED', 'Media asset has been deleted.');
    const updated = await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'UPLOADED' } });
    return res.json({ asset: updated });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset || asset.status === 'DELETED') throw fail(404, 'MEDIA_NOT_FOUND', 'Media asset not found.');
    await canAccessTarget(req.auth, asset.targetType, asset.targetId);
    const isOwner = asset.ownerUserId === req.auth.id;
    const isAdmin = req.auth.role === 'ADMIN';
    const hasVerifiedTargetAccess = Boolean(asset.targetType && asset.targetId); // canAccessTarget has already checked ownership/participation above.
    if (!isOwner && !isAdmin && !hasVerifiedTargetAccess) throw fail(403, 'FORBIDDEN', 'You cannot access this media asset.');
    const signed = await createSignedDownloadUrl(asset.objectKey, 300);
    return res.json({ asset, url: signed.url });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset || asset.status === 'DELETED') throw fail(404, 'MEDIA_NOT_FOUND', 'Media asset not found.');
    if (asset.ownerUserId !== req.auth.id && req.auth.role !== 'ADMIN') throw fail(403, 'FORBIDDEN', 'You cannot delete this media asset.');
    await removeObject(asset.objectKey);
    const updated = await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'DELETED' } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'MediaAsset', entityId: asset.id, metadata: { objectKey: asset.objectKey } } });
    return res.json({ asset: updated });
  } catch (error) { next(error); }
});

export default function mediaRouter() { return router; }
