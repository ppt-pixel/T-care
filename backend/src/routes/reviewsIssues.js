import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const reviewInput = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(5000).nullable().optional()
}).strict();

const issueInput = z.object({
  bookingId: z.string().min(1).nullable().optional(),
  subject: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(10000)
}).strict();

const adminReviewUpdate = z.object({
  status: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN'])
}).strict();

const adminIssueUpdate = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'])
}).strict();

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

async function getCustomer(req) {
  const customer = await prisma.customerProfile.findUnique({ where: { userId: req.auth.id } });
  if (!customer) throw httpError(404, 'CUSTOMER_PROFILE_NOT_FOUND', 'Customer profile not found.');
  return customer;
}

async function recalculateGardenerRating(tx, gardenerId) {
  const reviews = await tx.review.findMany({
    where: { status: 'PUBLISHED', booking: { assignment: { gardenerId } } },
    select: { rating: true }
  });
  const rating = reviews.length
    ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length
    : null;
  await tx.gardenerProfile.update({
    where: { id: gardenerId },
    data: { rating }
  });
  return rating;
}

// Customer review endpoints.
const customer = Router();
customer.use(requireAuth, requireRole('CUSTOMER'));

customer.post('/reviews', async (req, res, next) => {
  try {
    const input = reviewInput.parse(req.body);
    const profile = await getCustomer(req);
    const booking = await prisma.booking.findFirst({
      where: { id: input.bookingId, customerId: profile.id },
      include: { assignment: true, service: true, review: true }
    });

    if (!booking) throw httpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    if (booking.status !== 'SERVICE_COMPLETED') {
      throw httpError(409, 'REVIEW_NOT_ELIGIBLE', 'A review can only be submitted after service completion.');
    }
    if (!booking.assignment) {
      throw httpError(409, 'GARDENER_NOT_ASSIGNED', 'This booking has no completed gardener assignment.');
    }
    if (booking.review) {
      throw httpError(409, 'REVIEW_ALREADY_EXISTS', 'A review already exists for this booking.');
    }

    const review = await prisma.$transaction(async tx => {
      const created = await tx.review.create({
        data: {
          bookingId: booking.id,
          customerId: profile.id,
          rating: input.rating,
          comment: input.comment ?? null,
          status: 'PENDING'
        },
        include: { booking: { include: { service: true, assignment: { include: { gardener: { include: { user: { select: { id: true, fullName: true } } } } } } } } }
      });
      await tx.auditLog.create({
        data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'Review', entityId: created.id, metadata: { bookingId: booking.id, rating: input.rating } }
      });
      return created;
    });
    return res.status(201).json({ review });
  } catch (error) { next(error); }
});

customer.get('/reviews', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const reviews = await prisma.review.findMany({
      where: { customerId: profile.id },
      include: { booking: { include: { service: true, assignment: { include: { gardener: { include: { user: { select: { id: true, fullName: true } } } } } } } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ reviews });
  } catch (error) { next(error); }
});

customer.post('/issues', async (req, res, next) => {
  try {
    const input = issueInput.parse(req.body);
    const profile = await getCustomer(req);
    if (input.bookingId) {
      const booking = await prisma.booking.findFirst({ where: { id: input.bookingId, customerId: profile.id }, select: { id: true } });
      if (!booking) throw httpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    const issue = await prisma.$transaction(async tx => {
      const created = await tx.issueReport.create({ data: { customerId: profile.id, bookingId: input.bookingId ?? null, subject: input.subject, description: input.description } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'IssueReport', entityId: created.id, metadata: { bookingId: input.bookingId ?? null } } });
      return created;
    });
    return res.status(201).json({ issue });
  } catch (error) { next(error); }
});

customer.get('/issues', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const issues = await prisma.issueReport.findMany({ where: { customerId: profile.id }, include: { booking: { include: { service: true } } }, orderBy: { createdAt: 'desc' } });
    return res.json({ issues });
  } catch (error) { next(error); }
});

customer.get('/issues/:id', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const issue = await prisma.issueReport.findFirst({ where: { id: req.params.id, customerId: profile.id }, include: { booking: { include: { service: true } } } });
    if (!issue) throw httpError(404, 'ISSUE_NOT_FOUND', 'Issue not found.');
    return res.json({ issue });
  } catch (error) { next(error); }
});

// Publicly visible reviews are limited to published reviews and do not expose private customer data.
router.get('/public', async (req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true, rating: true, comment: true, createdAt: true,
        booking: { select: { service: { select: { id: true, name: true } }, assignment: { select: { gardener: { select: { user: { select: { fullName: true } } } } } } } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return res.json({ reviews });
  } catch (error) { next(error); }
});

// Admin moderation/issue operations.
const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.get('/reviews', async (req, res, next) => {
  try {
    const status = req.query.status ? z.enum(['PENDING', 'PUBLISHED', 'HIDDEN']).parse(req.query.status) : undefined;
    const reviews = await prisma.review.findMany({
      where: status ? { status } : undefined,
      include: { customer: { include: { user: { select: { id: true, email: true, fullName: true } } } }, booking: { include: { service: true, assignment: { include: { gardener: { include: { user: { select: { fullName: true, email: true } } } } } } } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ reviews });
  } catch (error) { next(error); }
});

admin.patch('/reviews/:id', async (req, res, next) => {
  try {
    const input = adminReviewUpdate.parse(req.body);
    const existing = await prisma.review.findUnique({ where: { id: req.params.id }, include: { booking: { include: { assignment: true } } } });
    if (!existing) throw httpError(404, 'REVIEW_NOT_FOUND', 'Review not found.');

    const result = await prisma.$transaction(async tx => {
      const updated = await tx.review.update({ where: { id: existing.id }, data: { status: input.status } });
      if (existing.booking.assignment) await recalculateGardenerRating(tx, existing.booking.assignment.gardenerId);
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Review', entityId: existing.id, metadata: { fromStatus: existing.status, toStatus: input.status } } });
      return updated;
    });
    return res.json({ review: result });
  } catch (error) { next(error); }
});

admin.get('/issues', async (req, res, next) => {
  try {
    const status = req.query.status ? z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED']).parse(req.query.status) : undefined;
    const issues = await prisma.issueReport.findMany({
      where: status ? { status } : undefined,
      include: { customer: { include: { user: { select: { id: true, email: true, fullName: true } } } }, booking: { include: { service: true, assignment: { include: { gardener: { include: { user: { select: { fullName: true, email: true } } } } } } } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ issues });
  } catch (error) { next(error); }
});

admin.patch('/issues/:id', async (req, res, next) => {
  try {
    const input = adminIssueUpdate.parse(req.body);
    const existing = await prisma.issueReport.findUnique({ where: { id: req.params.id } });
    if (!existing) throw httpError(404, 'ISSUE_NOT_FOUND', 'Issue not found.');
    const updated = await prisma.$transaction(async tx => {
      const item = await tx.issueReport.update({ where: { id: existing.id }, data: { status: input.status } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'IssueReport', entityId: existing.id, metadata: { fromStatus: existing.status, toStatus: input.status } } });
      return item;
    });
    return res.json({ issue: updated });
  } catch (error) { next(error); }
});

router.use('/customer', customer);
router.use('/admin', admin);

export default function reviewsIssuesRouter() { return router; }
