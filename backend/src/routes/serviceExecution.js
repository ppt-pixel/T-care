import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createSignedDownloadUrl, removeObject } from '../lib/supabaseStorage.js';
import { canTransitionBooking } from './bookings.js';
import { notifyUserSafely } from '../lib/notifications.js';

const router = Router();
router.use(requireAuth, requireRole('GARDENER'));

const healthStatus = z.enum(['EXCELLENT', 'HEALTHY', 'NEEDS_ATTENTION', 'CRITICAL']);
const reportSchema = z.object({
  summary: z.string().trim().min(1).max(5000),
  observations: z.string().trim().max(10000).nullable().optional(),
  recommendation: z.string().trim().max(10000).nullable().optional(),
  nextCareAt: z.coerce.date().nullable().optional(),
  checklistItems: z.array(z.object({
    id: z.string().min(1).optional(),
    label: z.string().trim().min(1).max(500),
    completed: z.boolean().default(false)
  }).strict()).max(100).default([]),
  plants: z.array(z.object({
    plantId: z.string().min(1),
    healthStatus,
    conditionNote: z.string().trim().max(5000).nullable().optional(),
    recommendation: z.string().trim().max(5000).nullable().optional()
  }).strict()).max(200).default([])
}).strict();

const photoSchema = z.object({
  objectKey: z.string().trim().min(1).max(1000),
  url: z.string().url().max(4000).nullable().optional(),
  caption: z.string().trim().max(1000).nullable().optional()
}).strict();

async function getGardener(userId) {
  const gardener = await prisma.gardenerProfile.findUnique({ where: { userId } });
  if (!gardener) throw Object.assign(new Error('Gardener profile not found.'), { statusCode: 404, code: 'GARDENER_PROFILE_NOT_FOUND' });
  return gardener;
}

async function getAssignedJob(gardenerId, id) {
  const assignment = await prisma.gardenerAssignment.findFirst({
    where: { id, gardenerId },
    include: {
      booking: {
        include: {
          service: true,
          customer: { include: { user: { select: { id: true, fullName: true } } } },
          plants: { include: { plant: true } },
          report: { include: { checklistItems: true, photos: true, plants: { include: { plant: true } } } }
        }
      }
    }
  });
  if (!assignment) throw Object.assign(new Error('Assigned job not found.'), { statusCode: 404, code: 'JOB_NOT_FOUND' });
  return assignment;
}

async function serializeReport(report, userId) {
  if (!report) return null;
  const photos = await Promise.all((report.photos || []).map(async photo => {
    const asset = await prisma.mediaAsset.findFirst({ where: { ownerUserId: userId, objectKey: photo.objectKey, kind: 'SERVICE_REPORT_PHOTO', targetType: 'SERVICE_REPORT', targetId: report.id, status: 'UPLOADED' }, select: { id: true } });
    let url = photo.url || null;
    if (asset) { try { url = (await createSignedDownloadUrl(photo.objectKey, 300)).url; } catch { /* a report remains readable if Storage signing is temporarily unavailable */ } }
    return { ...photo, mediaAssetId: asset?.id || null, url };
  }));
  return { ...report, photos };
}

async function audit(tx, actorUserId, action, entityType, entityId, metadata = undefined) {
  await tx.auditLog.create({ data: { actorUserId, action, entityType, entityId, metadata } });
}

router.get('/jobs/:id/report', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const assignment = await getAssignedJob(gardener.id, req.params.id);
    return res.json({ report: await serializeReport(assignment.booking.report, req.auth.id) });
  } catch (error) { next(error); }
});

router.put('/jobs/:id/report', async (req, res, next) => {
  try {
    const input = reportSchema.parse(req.body);
    const gardener = await getGardener(req.auth.id);
    const assignment = await getAssignedJob(gardener.id, req.params.id);
    const booking = assignment.booking;

    if (booking.status !== 'SERVICE_STARTED') {
      return res.status(409).json({ error: 'INVALID_SERVICE_STATE', message: 'A service report can only be recorded after service has started.' });
    }

    const bookingPlantIds = new Set(booking.plants.map(bp => bp.plantId));
    const uniqueReportPlants = new Set();
    for (const item of input.plants) {
      if (!bookingPlantIds.has(item.plantId)) return res.status(403).json({ error: 'PLANT_OWNERSHIP_VIOLATION', message: 'A report plant must belong to the booking.' });
      if (uniqueReportPlants.has(item.plantId)) return res.status(400).json({ error: 'DUPLICATE_REPORT_PLANT', message: 'Each booking plant may appear only once in a report.' });
      uniqueReportPlants.add(item.plantId);
    }

    const result = await prisma.$transaction(async tx => {
      const existing = await tx.serviceReport.findUnique({ where: { bookingId: booking.id } });
      const report = existing
        ? await tx.serviceReport.update({
            where: { id: existing.id },
            data: {
              summary: input.summary,
              observations: input.observations ?? null,
              recommendation: input.recommendation ?? null,
              nextCareAt: input.nextCareAt ?? null,
              checklistItems: {
                deleteMany: {},
                create: input.checklistItems.map(item => ({ label: item.label, completed: item.completed }))
              },
              plants: {
                deleteMany: {},
                create: input.plants.map(item => ({ plantId: item.plantId, healthStatus: item.healthStatus, conditionNote: item.conditionNote ?? null, recommendation: item.recommendation ?? null }))
              }
            },
            include: { checklistItems: true, photos: true, plants: { include: { plant: true } } }
          })
        : await tx.serviceReport.create({
            data: {
              bookingId: booking.id,
              summary: input.summary,
              observations: input.observations ?? null,
              recommendation: input.recommendation ?? null,
              nextCareAt: input.nextCareAt ?? null,
              checklistItems: { create: input.checklistItems.map(item => ({ label: item.label, completed: item.completed })) },
              plants: { create: input.plants.map(item => ({ plantId: item.plantId, healthStatus: item.healthStatus, conditionNote: item.conditionNote ?? null, recommendation: item.recommendation ?? null })) }
            },
            include: { checklistItems: true, photos: true, plants: { include: { plant: true } } }
          });

      for (const item of input.plants) {
        await tx.plant.update({ where: { id: item.plantId }, data: { healthStatus: item.healthStatus, nextCareAt: input.nextCareAt ?? undefined } });
        const careNotes = [item.conditionNote, item.recommendation].filter(Boolean).join('\n\n') || input.summary;
        const priorCareRecord = await tx.plantCareRecord.findFirst({ where: { plantId: item.plantId, bookingId: booking.id } });
        if (priorCareRecord) {
          await tx.plantCareRecord.update({ where: { id: priorCareRecord.id }, data: { title: `Service report: ${booking.service.name}`, notes: careNotes, nextCareAt: input.nextCareAt ?? null } });
        } else {
          await tx.plantCareRecord.create({ data: { plantId: item.plantId, bookingId: booking.id, title: `Service report: ${booking.service.name}`, notes: careNotes, nextCareAt: input.nextCareAt ?? null } });
        }
      }

      await audit(tx, req.auth.id, existing ? 'UPDATE' : 'CREATE', 'ServiceReport', report.id, { bookingId: booking.id });
      return report;
    });

    return res.json({ report: await serializeReport(result, req.auth.id) });
  } catch (error) { next(error); }
});

router.post('/jobs/:id/report/photos', async (req, res, next) => {
  try {
    const input = photoSchema.parse(req.body);
    const gardener = await getGardener(req.auth.id);
    const assignment = await getAssignedJob(gardener.id, req.params.id);
    if (assignment.booking.status !== 'SERVICE_STARTED') return res.status(409).json({ error: 'INVALID_SERVICE_STATE', message: 'Report photos can only be changed while the service is in progress.' });
    if (!assignment.booking.report) return res.status(409).json({ error: 'REPORT_REQUIRED', message: 'Create a service report before adding report photos.' });

    const asset = await prisma.mediaAsset.findFirst({ where: { ownerUserId: req.auth.id, objectKey: input.objectKey, kind: 'SERVICE_REPORT_PHOTO', targetType: 'SERVICE_REPORT', targetId: assignment.booking.report.id, status: 'UPLOADED' } });
    if (!asset) return res.status(409).json({ error: 'REPORT_MEDIA_NOT_READY', message: 'Upload and complete this report photo in T-CARE Storage before linking it.' });
    const photo = await prisma.serviceReportPhoto.create({ data: { reportId: assignment.booking.report.id, objectKey: input.objectKey, url: input.url ?? null, caption: input.caption ?? null } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'ServiceReportPhoto', entityId: photo.id, metadata: { reportId: assignment.booking.report.id } } });
    return res.status(201).json({ photo });
  } catch (error) { next(error); }
});

router.delete('/jobs/:id/report/photos/:photoId', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const assignment = await getAssignedJob(gardener.id, req.params.id);
    const report = assignment.booking.report;
    if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Service report not found.' });
    const photo = await prisma.serviceReportPhoto.findFirst({ where: { id: req.params.photoId, reportId: report.id } });
    if (!photo) return res.status(404).json({ error: 'PHOTO_NOT_FOUND', message: 'Report photo not found.' });
    const asset = await prisma.mediaAsset.findFirst({ where: { ownerUserId: req.auth.id, objectKey: photo.objectKey, kind: 'SERVICE_REPORT_PHOTO', targetType: 'SERVICE_REPORT', targetId: report.id } });
    if (asset && asset.status !== 'DELETED') { await removeObject(asset.objectKey); await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'DELETED' } }); }
    await prisma.serviceReportPhoto.delete({ where: { id: photo.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'ServiceReportPhoto', entityId: photo.id, metadata: { reportId: report.id, mediaAssetId: asset?.id || null } } });
    return res.status(204).send();
  } catch (error) { next(error); }
});

// Complete only when a valid report exists and every checklist item is complete.
router.post('/jobs/:id/complete', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const assignment = await getAssignedJob(gardener.id, req.params.id);
    const booking = assignment.booking;
    if (assignment.status !== 'IN_PROGRESS' || booking.status !== 'SERVICE_STARTED') return res.status(409).json({ error: 'INVALID_SERVICE_STATE', message: 'Only an in-progress started service can be completed.' });
    if (!canTransitionBooking(booking.status, 'SERVICE_COMPLETED')) return res.status(409).json({ error: 'INVALID_BOOKING_TRANSITION', message: 'Invalid booking transition.' });
    if (!booking.report) return res.status(409).json({ error: 'REPORT_REQUIRED', message: 'A service report is required before completing the service.' });
    if (!booking.report.summary?.trim()) return res.status(409).json({ error: 'REPORT_INCOMPLETE', message: 'Service report summary is required.' });
    if (booking.report.checklistItems.some(item => !item.completed)) return res.status(409).json({ error: 'CHECKLIST_INCOMPLETE', message: 'All service checklist items must be completed.' });

    const result = await prisma.$transaction(async tx => {
      const updatedAssignment = await tx.gardenerAssignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      const updatedBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'SERVICE_COMPLETED' } });
      await tx.bookingStatusHistory.create({ data: { bookingId: booking.id, fromStatus: booking.status, toStatus: 'SERVICE_COMPLETED', changedBy: req.auth.id, note: 'Service completed by gardener.' } });
      await audit(tx, req.auth.id, 'STATUS_CHANGE', 'Booking', booking.id, { fromStatus: booking.status, toStatus: 'SERVICE_COMPLETED', assignmentId: assignment.id });
      return { updatedAssignment, updatedBooking };
    });
    await notifyUserSafely({ userId: booking.customer.user.id, type: 'BOOKING', channel: 'IN_APP', title: 'Service completed', body: `Your ${booking.service?.name || 'T-CARE service'} booking ${booking.reference} is complete. You can review the service report and submit feedback.` });
    return res.json(result);
  } catch (error) { next(error); }
});

export default function serviceExecutionRouter() { return router; }
