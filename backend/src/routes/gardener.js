import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { canTransitionBooking } from './bookings.js';
import { removeObject } from '../lib/supabaseStorage.js';
import { notifyUserSafely } from '../lib/notifications.js';

const router = Router();
router.use(requireAuth, requireRole('GARDENER'));

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const timeSchema = z.string().regex(timePattern, 'Time must use HH:mm format.');

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  bio: z.string().trim().max(3000).nullable().optional(),
  serviceArea: z.string().trim().max(500).nullable().optional()
}).strict();

const availabilityFields = {
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  isActive: z.boolean().default(true)
};

const validateAvailabilityWindow = (value, ctx) => {
  if (value.startTime && value.endTime && value.startTime >= value.endTime) {
    ctx.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'endTime must be later than startTime.'
    });
  }
};

const availabilitySchema = z.object(availabilityFields).superRefine(
  validateAvailabilityWindow
);

const availabilityPatchSchema = z.object(availabilityFields)
  .partial()
  .superRefine(validateAvailabilityWindow);

const assignmentActionSchema = z.object({
  reason: z.string().trim().max(1000).optional()
}).strict();

const jobQuerySchema = z.object({
  status: z.enum(['ASSIGNED', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).superRefine((value, ctx) => {
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be on or after from.' });
  }
});

async function getGardener(userId) {
  const gardener = await prisma.gardenerProfile.findUnique({ where: { userId } });
  if (!gardener) {
    throw Object.assign(new Error('Gardener profile not found.'), {
      statusCode: 404,
      code: 'GARDENER_PROFILE_NOT_FOUND'
    });
  }
  return gardener;
}

function serializeAssignment(assignment) {
  if (!assignment) return null;
  return {
    ...assignment,
    gardener: assignment.gardener
      ? {
        ...assignment.gardener,
        rating: assignment.gardener.rating == null ? null : Number(assignment.gardener.rating)
      }
      : undefined
  };
}

async function writeAudit(tx, { actorUserId, action, entityType, entityId, metadata }) {
  await tx.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata }
  });
}

const jobInclude = {
  booking: {
    include: {
      service: true,
      address: true,
      customer: {
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } }
        }
      },
      plants: {
        include: {
          plant: {
            include: {
              photos: { orderBy: { createdAt: 'desc' } },
              careRecords: { orderBy: { recordedAt: 'desc' }, take: 5 }
            }
          }
        }
      },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      report: { include: { checklistItems: true, photos: true, plants: { include: { plant: true } } } }
    }
  }
};

// -----------------------------------------------------------------------------
// Gardener profile
// -----------------------------------------------------------------------------

router.get('/profile', async (req, res, next) => {
  try {
    const gardener = await prisma.gardenerProfile.findUnique({
      where: { userId: req.auth.id },
      include: { user: { select: { id: true, email: true, fullName: true, phone: true, role: true, status: true } } }
    });
    if (!gardener) return res.status(404).json({ error: 'GARDENER_PROFILE_NOT_FOUND', message: 'Gardener profile not found.' });

    return res.json({
      profile: {
        ...gardener,
        rating: gardener.rating == null ? null : Number(gardener.rating)
      }
    });
  } catch (error) { next(error); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const gardener = await getGardener(req.auth.id);

    const { fullName, phone, bio, serviceArea } = input;
    const updated = await prisma.$transaction(async tx => {
      if (fullName !== undefined || phone !== undefined) {
        await tx.user.update({
          where: { id: req.auth.id },
          data: {
            ...(fullName !== undefined ? { fullName } : {}),
            ...(phone !== undefined ? { phone } : {})
          }
        });
      }

      return tx.gardenerProfile.update({
        where: { id: gardener.id },
        data: {
          ...(bio !== undefined ? { bio } : {}),
          ...(serviceArea !== undefined ? { serviceArea } : {})
        },
        include: { user: { select: { id: true, email: true, fullName: true, phone: true, role: true, status: true } } }
      });
    });

    return res.json({ profile: { ...updated, rating: updated.rating == null ? null : Number(updated.rating) } });
  } catch (error) { next(error); }
});

// -----------------------------------------------------------------------------
// Gardener availability
// -----------------------------------------------------------------------------

router.get('/availability', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const availability = await prisma.gardenerAvailability.findMany({
      where: { gardenerId: gardener.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });
    return res.json({ availability });
  } catch (error) { next(error); }
});

router.post('/availability', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const input = availabilitySchema.parse(req.body);

    const existing = await prisma.gardenerAvailability.findMany({
      where: { gardenerId: gardener.id, dayOfWeek: input.dayOfWeek, isActive: true },
      orderBy: { startTime: 'asc' }
    });

    if (input.isActive) {
      const overlaps = existing.some(slot => input.startTime < slot.endTime && input.endTime > slot.startTime);
      if (overlaps) {
        return res.status(409).json({ error: 'AVAILABILITY_OVERLAP', message: 'The availability interval overlaps an existing active interval.' });
      }
    }

    const availability = await prisma.gardenerAvailability.create({
      data: { ...input, gardenerId: gardener.id }
    });
    return res.status(201).json({ availability });
  } catch (error) { next(error); }
});

router.patch('/availability/:id', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const input = availabilityPatchSchema.parse(req.body);
    const existing = await prisma.gardenerAvailability.findFirst({
      where: { id: req.params.id, gardenerId: gardener.id }
    });
    if (!existing) return res.status(404).json({ error: 'AVAILABILITY_NOT_FOUND', message: 'Availability entry not found.' });

    const nextValue = {
      dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
      isActive: input.isActive ?? existing.isActive
    };

    if (nextValue.startTime >= nextValue.endTime) {
      return res.status(400).json({ error: 'INVALID_AVAILABILITY', message: 'endTime must be later than startTime.' });
    }

    if (nextValue.isActive) {
      const siblings = await prisma.gardenerAvailability.findMany({
        where: {
          gardenerId: gardener.id,
          dayOfWeek: nextValue.dayOfWeek,
          isActive: true,
          id: { not: existing.id }
        }
      });
      const overlaps = siblings.some(slot => nextValue.startTime < slot.endTime && nextValue.endTime > slot.startTime);
      if (overlaps) return res.status(409).json({ error: 'AVAILABILITY_OVERLAP', message: 'The availability interval overlaps an existing active interval.' });
    }

    const availability = await prisma.gardenerAvailability.update({ where: { id: existing.id }, data: nextValue });
    return res.json({ availability });
  } catch (error) { next(error); }
});

router.delete('/availability/:id', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const result = await prisma.gardenerAvailability.deleteMany({ where: { id: req.params.id, gardenerId: gardener.id } });
    if (!result.count) return res.status(404).json({ error: 'AVAILABILITY_NOT_FOUND', message: 'Availability entry not found.' });
    return res.status(204).send();
  } catch (error) { next(error); }
});

// -----------------------------------------------------------------------------
// Gardener identity / KYC documents
// -----------------------------------------------------------------------------

const kycDocumentTypes = ['GOVERNMENT_ID', 'ADDRESS_PROOF', 'PROFESSIONAL_CERTIFICATE', 'OTHER'];

router.get('/kyc/documents', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const documents = await prisma.gardenerKycDocument.findMany({
      where: { gardenerId: gardener.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, documentType: true, originalFileName: true, contentType: true, sizeBytes: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true, updatedAt: true, mediaAssetId: true }
    });
    return res.json({ kycStatus: gardener.kycStatus, documents });
  } catch (error) { next(error); }
});

router.post('/kyc/documents', async (req, res, next) => {
  try {
    const input = z.object({
      documentType: z.enum(kycDocumentTypes),
      mediaAssetId: z.string().min(1),
      originalFileName: z.string().trim().min(1).max(255)
    }).strict().parse(req.body);
    const gardener = await getGardener(req.auth.id);
    if (gardener.kycStatus === 'VERIFIED') return res.status(409).json({ error: 'KYC_ALREADY_VERIFIED', message: 'Your professional identity is already verified. Contact T-CARE support if your documents need to be replaced.' });
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, ownerUserId: req.auth.id, kind: 'KYC_DOCUMENT', targetType: 'KYC_DOCUMENT', targetId: gardener.id, status: 'UPLOADED' },
      select: { id: true, contentType: true, sizeBytes: true }
    });
    if (!asset) return res.status(409).json({ error: 'KYC_MEDIA_NOT_READY', message: 'Upload the document to T-CARE Storage before submitting it for review.' });
    const document = await prisma.$transaction(async tx => {
      const created = await tx.gardenerKycDocument.create({ data: {
        gardenerId: gardener.id, mediaAssetId: asset.id, documentType: input.documentType,
        originalFileName: input.originalFileName, contentType: asset.contentType, sizeBytes: asset.sizeBytes || 0
      } });
      await tx.gardenerProfile.update({ where: { id: gardener.id }, data: { kycStatus: 'PENDING' } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'GardenerKycDocument', entityId: created.id, metadata: { gardenerId: gardener.id, documentType: input.documentType, mediaAssetId: asset.id } } });
      return created;
    });
    return res.status(201).json({ document, kycStatus: 'PENDING' });
  } catch (error) { next(error); }
});

router.delete('/kyc/documents/:id', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const document = await prisma.gardenerKycDocument.findFirst({ where: { id: req.params.id, gardenerId: gardener.id }, include: { mediaAsset: true } });
    if (!document) return res.status(404).json({ error: 'KYC_DOCUMENT_NOT_FOUND', message: 'KYC document not found.' });
    if (document.status === 'VERIFIED' || gardener.kycStatus === 'VERIFIED') return res.status(409).json({ error: 'VERIFIED_KYC_IMMUTABLE', message: 'A verified identity document cannot be removed. Contact T-CARE support if it must be replaced.' });
    if (document.mediaAsset.status !== 'DELETED') await removeObject(document.mediaAsset.objectKey);
    await prisma.$transaction(async tx => {
      await tx.gardenerKycDocument.delete({ where: { id: document.id } });
      if (document.mediaAsset.status !== 'DELETED') await tx.mediaAsset.update({ where: { id: document.mediaAssetId }, data: { status: 'DELETED' } });
      const remaining = await tx.gardenerKycDocument.count({ where: { gardenerId: gardener.id } });
      if (!remaining) await tx.gardenerProfile.update({ where: { id: gardener.id }, data: { kycStatus: 'NOT_STARTED' } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'GardenerKycDocument', entityId: document.id, metadata: { gardenerId: gardener.id } } });
    });
    return res.status(204).send();
  } catch (error) { next(error); }
});

// -----------------------------------------------------------------------------
// Assigned jobs
// -----------------------------------------------------------------------------

router.get('/jobs', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const query = jobQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      gardenerId: gardener.id,
      ...(query.status ? { status: query.status } : {}),
      booking: {
        ...(query.from || query.to
          ? { scheduledStart: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
          : {})
      }
    };

    const [total, assignments] = await Promise.all([
      prisma.gardenerAssignment.count({ where }),
      prisma.gardenerAssignment.findMany({
        where,
        include: {
          booking: {
            include: {
              service: true,
              address: true,
              customer: { include: { user: { select: { fullName: true, phone: true } } } },
              plants: { include: { plant: { select: { id: true, name: true, type: true, healthStatus: true } } } }
            }
          }
        },
        orderBy: { booking: { scheduledStart: 'asc' } },
        skip,
        take: query.limit
      })
    ]);

    return res.json({
      jobs: assignments.map(serializeAssignment),
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
    });
  } catch (error) { next(error); }
});

router.get('/jobs/:id', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const assignment = await prisma.gardenerAssignment.findFirst({
      where: { id: req.params.id, gardenerId: gardener.id },
      include: jobInclude.booking
        ? {
          ...jobInclude,
          gardener: { include: { user: { select: { fullName: true, phone: true, email: true } } } }
        }
        : jobInclude
    });
    if (!assignment) return res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Assigned job not found.' });

    return res.json({ assignment: serializeAssignment(assignment) });
  } catch (error) { next(error); }
});

async function transitionAssignedJob({ req, res, next, targetBookingStatus, targetAssignmentStatus, allowedAssignmentStatuses, note, timestamps = {} }) {
  try {
    const gardener = await getGardener(req.auth.id);
    const assignment = await prisma.gardenerAssignment.findFirst({
      where: { id: req.params.id, gardenerId: gardener.id },
      include: { booking: { include: { customer: { select: { userId: true } }, service: { select: { name: true } } } } }
    });
    if (!assignment) return res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Assigned job not found.' });

    if (!allowedAssignmentStatuses.includes(assignment.status)) {
      return res.status(409).json({ error: 'INVALID_ASSIGNMENT_STATE', message: `Job cannot be changed from assignment status ${assignment.status}.` });
    }

    if (!canTransitionBooking(assignment.booking.status, targetBookingStatus)) {
      return res.status(409).json({ error: 'INVALID_BOOKING_STATE', message: `Booking cannot transition from ${assignment.booking.status} to ${targetBookingStatus}.` });
    }

    const result = await prisma.$transaction(async tx => {
      const updatedAssignment = await tx.gardenerAssignment.update({
        where: { id: assignment.id },
        data: { status: targetAssignmentStatus, ...timestamps }
      });
      const updatedBooking = await tx.booking.update({
        where: { id: assignment.booking.id },
        data: { status: targetBookingStatus }
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: assignment.booking.id,
          fromStatus: assignment.booking.status,
          toStatus: targetBookingStatus,
          changedBy: req.auth.id,
          note
        }
      });
      await writeAudit(tx, {
        actorUserId: req.auth.id,
        action: 'STATUS_CHANGE',
        entityType: 'Booking',
        entityId: assignment.booking.id,
        metadata: { fromStatus: assignment.booking.status, toStatus: targetBookingStatus, assignmentId: assignment.id }
      });
      return { updatedAssignment, updatedBooking };
    });

    await notifyUserSafely({ userId: assignment.booking.customer.userId, type: 'BOOKING', channel: 'IN_APP', title: 'Booking progress updated', body: `Your ${assignment.booking.service?.name || 'T-CARE service'} booking is now ${targetBookingStatus.replaceAll('_', ' ').toLowerCase()}.` });
    return res.json({ assignment: result.updatedAssignment, booking: result.updatedBooking });
  } catch (error) { next(error); }
}

router.post('/jobs/:id/accept', (req, res, next) => transitionAssignedJob({
  req,
  res,
  next,
  targetBookingStatus: 'GARDENER_ACCEPTED',
  targetAssignmentStatus: 'ACCEPTED',
  allowedAssignmentStatuses: ['ASSIGNED'],
  note: 'Assignment accepted by gardener.',
  timestamps: { acceptedAt: new Date() }
}));

router.post('/jobs/:id/reject', async (req, res, next) => {
  try {
    const input = assignmentActionSchema.parse(req.body ?? {});
    const gardener = await getGardener(req.auth.id);
    const assignment = await prisma.gardenerAssignment.findFirst({
      where: { id: req.params.id, gardenerId: gardener.id },
      include: { booking: { include: { customer: { select: { userId: true } }, service: { select: { name: true } } } } }
    });
    if (!assignment) return res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Assigned job not found.' });
    if (assignment.status !== 'ASSIGNED') return res.status(409).json({ error: 'INVALID_ASSIGNMENT_STATE', message: 'Only a newly assigned job can be rejected.' });
    if (assignment.booking.status !== 'GARDENER_ASSIGNED') return res.status(409).json({ error: 'INVALID_BOOKING_STATE', message: 'Booking is not awaiting gardener acceptance.' });

    const result = await prisma.$transaction(async tx => {
      const updatedAssignment = await tx.gardenerAssignment.update({ where: { id: assignment.id }, data: { status: 'REJECTED' } });
      const updatedBooking = await tx.booking.update({ where: { id: assignment.booking.id }, data: { status: 'CONFIRMED' } });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: assignment.booking.id,
          fromStatus: assignment.booking.status,
          toStatus: 'CONFIRMED',
          changedBy: req.auth.id,
          note: input.reason ? `Gardener rejected assignment: ${input.reason}` : 'Gardener rejected assignment.'
        }
      });
      await writeAudit(tx, {
        actorUserId: req.auth.id,
        action: 'STATUS_CHANGE',
        entityType: 'GardenerAssignment',
        entityId: assignment.id,
        metadata: { status: 'REJECTED', reason: input.reason ?? null, bookingId: assignment.booking.id }
      });
      return { updatedAssignment, updatedBooking };
    });

    await notifyUserSafely({ userId: assignment.booking.customer.userId, type: 'BOOKING', channel: 'IN_APP', title: 'Gardener assignment update', body: `The assigned Gardener could not accept booking ${assignment.booking.reference || ''}. T-CARE will arrange another assignment.` });
    return res.json({ assignment: result.updatedAssignment, booking: result.updatedBooking });
  } catch (error) { next(error); }
});

router.post('/jobs/:id/on-the-way', (req, res, next) => transitionAssignedJob({
  req,
  res,
  next,
  targetBookingStatus: 'ON_THE_WAY',
  targetAssignmentStatus: 'ACCEPTED',
  allowedAssignmentStatuses: ['ACCEPTED'],
  note: 'Gardener marked the job as on the way.'
}));

router.post('/jobs/:id/arrived', (req, res, next) => transitionAssignedJob({
  req,
  res,
  next,
  targetBookingStatus: 'ARRIVED',
  targetAssignmentStatus: 'ACCEPTED',
  allowedAssignmentStatuses: ['ACCEPTED'],
  note: 'Gardener marked arrival at the service address.'
}));

router.post('/jobs/:id/start', (req, res, next) => transitionAssignedJob({
  req,
  res,
  next,
  targetBookingStatus: 'SERVICE_STARTED',
  targetAssignmentStatus: 'IN_PROGRESS',
  allowedAssignmentStatuses: ['ACCEPTED'],
  note: 'Service started by gardener.',
  timestamps: { startedAt: new Date() }
}));

// Basic gardener job history. This is intentionally separate from the paginated
// job endpoint so clients can request only completed assignments when needed.
router.get('/history', async (req, res, next) => {
  try {
    const gardener = await getGardener(req.auth.id);
    const jobs = await prisma.gardenerAssignment.findMany({
      where: { gardenerId: gardener.id, status: 'COMPLETED' },
      include: {
        booking: {
          include: { service: true, address: true, customer: { include: { user: { select: { fullName: true } } } } }
        }
      },
      orderBy: { completedAt: 'desc' },
      take: 100
    });
    return res.json({ jobs: jobs.map(serializeAssignment) });
  } catch (error) { next(error); }
});

export default function gardenerRouter() { return router; }
