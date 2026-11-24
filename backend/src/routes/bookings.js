import { Router } from 'express';
import crypto from 'node:crypto';
import { bookingRequestFingerprint, isValidIdempotencyKey } from '../lib/bookingIdempotency.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { notifyUserSafely } from '../lib/notifications.js';
import { createSignedDownloadUrl } from '../lib/supabaseStorage.js';
import { serializeCustomerPayment } from '../lib/paymentView.js';
import { cancelQrSession } from './payments.js';
import { canRestoreVisitCredit } from '../lib/subscriptionPlanRules.js';

const router = Router();
router.use(requireAuth, requireRole('CUSTOMER'));

const createBookingSchema = z.object({
  serviceId: z.string().min(1),
  subscriptionPlanId: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  plantIds: z.array(z.string().min(1)).min(1).max(200),
  addressId: z.string().min(1),
  scheduledStart: z.coerce.date(),
  specialInstructions: z.string().trim().max(2000).optional(),
});

const allowedTransitions = {
  CONFIRMED: new Set(['GARDENER_ASSIGNED', 'CANCELLED']),
  GARDENER_ASSIGNED: new Set(['GARDENER_ACCEPTED', 'CONFIRMED', 'CANCELLED']),
  GARDENER_ACCEPTED: new Set(['ON_THE_WAY', 'CANCELLED']),
  ON_THE_WAY: new Set(['ARRIVED', 'CANCELLED']),
  ARRIVED: new Set(['SERVICE_STARTED', 'CANCELLED']),
  SERVICE_STARTED: new Set(['SERVICE_COMPLETED']),
  SERVICE_COMPLETED: new Set([]),
  CANCELLED: new Set([])
};


async function withSignedReportPhotos(booking) {
  if (!booking?.report?.photos?.length) return booking;
  const keys = booking.report.photos.map(photo => photo.objectKey);
  const assets = await prisma.mediaAsset.findMany({
    where: { kind: 'SERVICE_REPORT_PHOTO', targetType: 'SERVICE_REPORT', targetId: booking.report.id, status: 'UPLOADED', objectKey: { in: keys } },
    select: { objectKey: true }
  });
  const validKeys = new Set(assets.map(asset => asset.objectKey));
  const photos = await Promise.all(booking.report.photos.map(async photo => {
    if (!validKeys.has(photo.objectKey)) return { ...photo, url: null };
    try { return { ...photo, url: (await createSignedDownloadUrl(photo.objectKey, 300)).url }; }
    catch { return { ...photo, url: null }; }
  }));
  return { ...booking, report: { ...booking.report, photos } };
}

function makeReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `TC-${stamp}-${random}`;
}

async function getCustomer(userId) {
  const customer = await prisma.customerProfile.findUnique({ where: { userId } });
  if (!customer) throw Object.assign(new Error('Customer profile not found.'), { statusCode: 404, code: 'CUSTOMER_PROFILE_NOT_FOUND' });
  return customer;
}

async function getCurrentPrice(tx, serviceId, plantCount, at) {
  const prices = await tx.servicePrice.findMany({
    where: {
      serviceId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      AND: [
        { OR: [{ minPlants: null }, { minPlants: { lte: plantCount } }] },
        { OR: [{ maxPlants: null }, { maxPlants: { gte: plantCount } }] }
      ]
    },
    orderBy: [{ minPlants: { sort: 'desc', nulls: 'last' } }, { effectiveFrom: 'desc' }]
  });
  if (!prices.length) throw Object.assign(new Error('No active price is available for this service and plant count.'), { statusCode: 409, code: 'SERVICE_PRICE_UNAVAILABLE' });
  return prices[0];
}

router.post('/', async (req, res, next) => {
  try {
    const input = createBookingSchema.parse(req.body);
    const idempotencyKey = req.get('Idempotency-Key');
    if (!isValidIdempotencyKey(idempotencyKey)) {
      throw Object.assign(new Error('A valid Idempotency-Key header is required. Retry the same booking submission with the same key.'), { statusCode: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    const fingerprint = bookingRequestFingerprint(input);
    const customer = await getCustomer(req.auth.id);
    const now = new Date();
    const uniquePlantIds = [...new Set(input.plantIds)];

    let result;
    try {
      result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${customer.id} FOR UPDATE`;

        const prior = await tx.booking.findUnique({
          where: { idempotencyKey },
          include: { service: true, address: true, plants: { include: { plant: true } }, statusHistory: { orderBy: { createdAt: 'asc' } } }
        });
        if (prior) {
          if (prior.customerId !== customer.id) throw Object.assign(new Error('This booking submission key has already been used.'), { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
          if (prior.idempotencyFingerprint !== fingerprint) throw Object.assign(new Error('This submission was already used for different booking details. Check My Visits before starting another booking.'), { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
          return { booking: prior, reused: true };
        }

        if (input.scheduledStart <= now) throw Object.assign(new Error('scheduledStart must be in the future.'), { statusCode: 400, code: 'INVALID_SCHEDULE' });

        const [service, address, plants] = await Promise.all([
          tx.service.findFirst({ where: { id: input.serviceId, status: 'ACTIVE' } }),
          tx.address.findFirst({ where: { id: input.addressId, customerId: customer.id } }),
          tx.plant.findMany({ where: { id: { in: uniquePlantIds }, customerId: customer.id }, select: { id: true } })
        ]);
        if (!service) throw Object.assign(new Error('Service not found or inactive.'), { statusCode: 404, code: 'SERVICE_NOT_FOUND' });
        if (!address) throw Object.assign(new Error('Address not found.'), { statusCode: 404, code: 'ADDRESS_NOT_FOUND' });
        if (plants.length !== uniquePlantIds.length) throw Object.assign(new Error('One or more selected plants do not belong to this customer.'), { statusCode: 403, code: 'PLANT_OWNERSHIP_VIOLATION' });

        let subscription = null;
        let plan = null;
        let visitCredit = null;
        let subtotal = 0;
        let convenienceFee = 0;

        if (input.subscriptionId) {
          subscription = await tx.subscription.findFirst({
            where: { id: input.subscriptionId, customerId: customer.id },
            include: { plan: { include: { serviceLinks: { select: { serviceId: true } } } } }
          });
          if (!subscription) throw Object.assign(new Error('Subscription not found for this Customer.'), { statusCode: 404, code: 'SUBSCRIPTION_NOT_FOUND' });
          plan = subscription.plan;
          if (!['ACTIVE', 'PAUSED', 'PENDING', 'CANCELLED', 'EXPIRED'].includes(subscription.status)) throw Object.assign(new Error('This subscription does not have an active paid period. Check your subscription status and payment history.'), { statusCode: 409, code: 'SUBSCRIPTION_NOT_ACTIVE' });
          if (plan.planType === 'ONE_TIME_SERVICE' || plan.planType === 'LEGACY_RECURRING') {
            throw Object.assign(new Error('This subscription does not provide recurring booking credits.'), { statusCode: 409, code: 'SUBSCRIPTION_PLAN_NOT_BOOKABLE' });
          }
          if (input.subscriptionPlanId && input.subscriptionPlanId !== plan.id) throw Object.assign(new Error('The selected plan does not match this subscription.'), { statusCode: 409, code: 'SUBSCRIPTION_PLAN_MISMATCH' });
          if (!plan.includedVisitsPerPeriod || !plan.minimumVisitIntervalDays) throw Object.assign(new Error('This plan is missing its Admin-configured booking entitlements.'), { statusCode: 409, code: 'PLAN_ENTITLEMENTS_NOT_CONFIGURED' });
          if (!plan.serviceLinks.some(link => link.serviceId === service.id)) throw Object.assign(new Error('This service is not included in your subscription plan.'), { statusCode: 400, code: 'SERVICE_NOT_INCLUDED_IN_PLAN' });
          if (plan.plantLimit != null && plants.length > plan.plantLimit) throw Object.assign(new Error(`This plan covers up to ${plan.plantLimit} plants per visit.`), { statusCode: 400, code: 'PLAN_PLANT_LIMIT_EXCEEDED' });

          const candidateCredit = await tx.subscriptionVisitCredit.findFirst({
            where: {
              subscriptionId: subscription.id,
              periodStart: { lte: now },
              periodEnd: { gt: input.scheduledStart },
              visitsUsed: { lt: candidateCredit.visitsGranted }
            },
            orderBy: { periodStart: 'desc' }
          });
          if (!candidateCredit) throw Object.assign(new Error('You do not have an available visit credit in the current paid period. Check your subscription renewal or payment status.'), { statusCode: 409, code: 'NO_ACTIVE_VISIT_CREDIT' });
          await tx.$queryRaw`SELECT "id" FROM "SubscriptionVisitCredit" WHERE "id" = ${candidateCredit.id} FOR UPDATE`;
          visitCredit = await tx.subscriptionVisitCredit.findUnique({ where: { id: candidateCredit.id } });
          if (!visitCredit || visitCredit.periodStart > now || visitCredit.periodEnd <= now || visitCredit.periodEnd <= input.scheduledStart || visitCredit.visitsUsed >= visitCredit.visitsGranted) {
            throw Object.assign(new Error('The visit credit is no longer available. Refresh your subscription details and try again.'), { statusCode: 409, code: 'VISIT_CREDIT_UNAVAILABLE' });
          }
          const priorPlanBookings = await tx.booking.findMany({
            where: { subscriptionId: subscription.id, subscriptionVisitCreditId: visitCredit.id, status: { not: 'CANCELLED' } },
            select: { scheduledStart: true }
          });
          const minimumGap = plan.minimumVisitIntervalDays * 24 * 60 * 60 * 1000;
          if (priorPlanBookings.some(item => Math.abs(input.scheduledStart.getTime() - item.scheduledStart.getTime()) < minimumGap)) {
            throw Object.assign(new Error(`This plan requires at least ${plan.minimumVisitIntervalDays} days between visits. Choose another date.`), { statusCode: 409, code: 'PLAN_VISIT_FREQUENCY_NOT_MET' });
          }
          const consumed = await tx.subscriptionVisitCredit.updateMany({
            where: { id: visitCredit.id, visitsUsed: { lt: visitCredit.visitsGranted } },
            data: { visitsUsed: { increment: 1 } }
          });
          if (consumed.count !== 1) throw Object.assign(new Error('This visit credit was used by another booking. Refresh and try again.'), { statusCode: 409, code: 'VISIT_CREDIT_RACE' });
          subtotal = 0;
          convenienceFee = 0;
        } else if (input.subscriptionPlanId) {
          plan = await tx.subscriptionPlan.findFirst({
            where: { id: input.subscriptionPlanId, status: 'ACTIVE', planType: 'ONE_TIME_SERVICE' },
            include: { serviceLinks: { select: { serviceId: true } } }
          });
          if (!plan) throw Object.assign(new Error('One-Time Service plan was not found or is inactive.'), { statusCode: 404, code: 'ONE_TIME_PLAN_NOT_FOUND' });
          if (plan.includedVisitsPerPeriod !== 1 || !plan.serviceLinks.some(link => link.serviceId === service.id)) throw Object.assign(new Error('This service is not included in the selected One-Time Service plan.'), { statusCode: 400, code: 'SERVICE_NOT_INCLUDED_IN_PLAN' });
          if (plan.plantLimit != null && plants.length > plan.plantLimit) throw Object.assign(new Error(`This plan covers up to ${plan.plantLimit} plants.`), { statusCode: 400, code: 'PLAN_PLANT_LIMIT_EXCEEDED' });
          subtotal = Number(plan.price);
          convenienceFee = Number(env.BOOKING_CONVENIENCE_FEE);
        } else {
          const price = await getCurrentPrice(tx, service.id, plants.length, now);
          subtotal = Number(price.amount);
          convenienceFee = Number(env.BOOKING_CONVENIENCE_FEE);
        }
        const total = subtotal + convenienceFee;
        const durationMinutes = service.durationMinutes ?? 60;
        const scheduledEnd = new Date(input.scheduledStart.getTime() + durationMinutes * 60_000);
        const overlappingBooking = await tx.booking.findFirst({
          where: {
            customerId: customer.id,
            status: { notIn: ['SERVICE_COMPLETED', 'CANCELLED'] },
            scheduledStart: { lt: scheduledEnd },
            scheduledEnd: { gt: input.scheduledStart }
          },
          select: { id: true, reference: true, scheduledStart: true, scheduledEnd: true }
        });
        if (overlappingBooking) throw Object.assign(new Error(`This time overlaps your existing booking ${overlappingBooking.reference}. Choose another visit time.`), { statusCode: 409, code: 'BOOKING_TIME_CONFLICT' });

        const booking = await tx.booking.create({
          data: {
            reference: makeReference(),
            customerId: customer.id,
            serviceId: service.id,
            addressId: address.id,
            scheduledStart: input.scheduledStart,
            scheduledEnd,
            specialInstructions: input.specialInstructions,
            ...(subscription ? { subscriptionId: subscription.id } : {}),
            ...(plan ? { subscriptionPlanId: plan.id } : {}),
            ...(visitCredit ? { subscriptionVisitCreditId: visitCredit.id } : {}),
            idempotencyKey,
            idempotencyFingerprint: fingerprint,
            subtotal,
            convenienceFee,
            total,
            plants: { create: plants.map(p => ({ plantId: p.id })) },
            statusHistory: { create: { toStatus: 'CONFIRMED', note: 'Booking created by customer.', changedBy: req.auth.id } }
          },
          include: { service: true, address: true, plants: { include: { plant: true } }, statusHistory: { orderBy: { createdAt: 'asc' } } }
        });
        await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'Booking', entityId: booking.id, metadata: { reference: booking.reference, serviceId: booking.serviceId, plantCount: booking.plants.length, subscriptionId: subscription?.id ?? null, subscriptionPlanId: plan?.id ?? null, subscriptionVisitCreditId: visitCredit?.id ?? null } } });
        return { booking, reused: false };
      });
    } catch (error) {
      const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(',') : String(error?.meta?.target ?? '');
      if (error?.code !== 'P2002' || !target.includes('idempotencyKey')) throw error;
      const prior = await prisma.booking.findUnique({
        where: { idempotencyKey },
        include: { service: true, address: true, plants: { include: { plant: true } }, statusHistory: { orderBy: { createdAt: 'asc' } } }
      });
      if (!prior || prior.customerId !== customer.id || prior.idempotencyFingerprint !== fingerprint) {
        throw Object.assign(new Error('This booking submission key has already been used.'), { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      }
      result = { booking: prior, reused: true };
    }

    if (!result.reused) {
      await notifyUserSafely({ userId: req.auth.id, type: 'BOOKING', channel: 'IN_APP', title: 'Booking request received', body: `Your ${result.booking.service?.name || 'T-CARE service'} booking ${result.booking.reference} is confirmed as a request. T-CARE will assign a verified Gardener.` });
    }
    const booking = result.booking;
    return res.status(result.reused ? 200 : 201).json({
      reused: result.reused,
      booking: { ...booking, subtotal: Number(booking.subtotal), convenienceFee: Number(booking.convenienceFee), total: Number(booking.total) }
    });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const bookings = await prisma.booking.findMany({
      where: { customerId: customer.id },
      include: { service: true, address: true, subscriptionPlan: true, subscriptionVisitCredit: true, assignment: { include: { gardener: { include: { user: { select: { fullName: true, phone: true } } } } } }, plants: { include: { plant: true } }, payment: { include: { refunds: true, qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
      orderBy: { scheduledStart: 'desc' }
    });
    return res.json({ bookings: bookings.map(b => ({
      ...b,
      subtotal: Number(b.subtotal),
      convenienceFee: Number(b.convenienceFee),
      total: Number(b.total),
      payment: b.payment ? serializeCustomerPayment({ ...b.payment, booking: { reference: b.reference, service: b.service } }) : null
    })) });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, customerId: customer.id },
      include: { service: true, address: true, subscriptionPlan: true, subscriptionVisitCredit: true, subscription: { select: { id: true, status: true, renewsAt: true, cancelAtPeriodEnd: true } }, plants: { include: { plant: { include: { photos: true } } } }, statusHistory: { orderBy: { createdAt: 'asc' } }, assignment: { include: { gardener: { include: { user: { select: { fullName: true, phone: true } } } } } }, report: { include: { checklistItems: true, photos: true, plants: { include: { plant: true } } } }, payment: { include: { refunds: true, qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } }, review: true }
    });
    if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' });
    const hydrated = await withSignedReportPhotos(booking);
    return res.json({ booking: {
      ...hydrated,
      subtotal: Number(hydrated.subtotal),
      convenienceFee: Number(hydrated.convenienceFee),
      total: Number(hydrated.total),
      payment: hydrated.payment ? serializeCustomerPayment({ ...hydrated.payment, booking: { reference: hydrated.reference, service: hydrated.service } }) : null
    } });
  } catch (error) { next(error); }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const unpaidPayment = await prisma.payment.findFirst({
      where: { bookingId: req.params.id, booking: { customerId: customer.id } },
      include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    if (unpaidPayment?.qrSessions?.[0]?.status === 'ACTIVE') {
      await cancelQrSession(unpaidPayment.id, { cancelPayment: true });
    }
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, customerId: customer.id },
      include: { assignment: { include: { gardener: { select: { userId: true } } } } }
    });
    if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' });
    if (!allowedTransitions[booking.status]?.has('CANCELLED')) return res.status(409).json({ error: 'BOOKING_CANNOT_CANCEL', message: `Booking cannot be cancelled from ${booking.status}.` });
    const { updated } = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${booking.id} FOR UPDATE`;
      const current = await tx.booking.findUnique({
        where: { id: booking.id },
        include: { assignment: { select: { startedAt: true } }, subscriptionVisitCredit: true }
      });
      if (!current || !allowedTransitions[current.status]?.has('CANCELLED')) {
        throw Object.assign(new Error('This booking cannot be cancelled in its current state.'), { statusCode: 409, code: 'BOOKING_CANNOT_CANCEL' });
      }
      const payment = await tx.payment.findUnique({ where: { bookingId: booking.id }, select: { status: true } });
      if (payment?.status === 'PENDING' || payment?.status === 'AUTHORIZED') {
        throw Object.assign(new Error('A pending payment must be resolved before this booking can be cancelled.'), { statusCode: 409, code: 'PAYMENT_PENDING' });
      }
      if (payment?.status === 'PAID' || payment?.status === 'PARTIALLY_REFUNDED') {
        throw Object.assign(new Error('This booking has a processed payment and must go through the refund workflow before cancellation.'), { statusCode: 409, code: 'REFUND_REQUIRED' });
      }
      let creditRestored = false;
      if (current.subscriptionVisitCreditId && canRestoreVisitCredit({
        bookingStatus: current.status,
        assignmentStartedAt: current.assignment?.startedAt,
        creditRestoredAt: current.creditRestoredAt
      })) {
        await tx.$queryRaw`SELECT "id" FROM "SubscriptionVisitCredit" WHERE "id" = ${current.subscriptionVisitCreditId} FOR UPDATE`;
        const restored = await tx.subscriptionVisitCredit.updateMany({
          where: { id: current.subscriptionVisitCreditId, visitsUsed: { gt: 0 } },
          data: { visitsUsed: { decrement: 1 } }
        });
        if (restored.count !== 1) throw Object.assign(new Error('The subscription visit credit could not be restored safely. Contact T-CARE support.'), { statusCode: 409, code: 'VISIT_CREDIT_RESTORE_CONFLICT' });
        creditRestored = true;
      }
      const nextBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', ...(creditRestored ? { creditRestoredAt: new Date() } : {}) } });
      if (booking.assignment) {
        await tx.gardenerAssignment.update({ where: { id: booking.assignment.id }, data: { status: 'CANCELLED' } });
      }
      await tx.bookingStatusHistory.create({ data: { bookingId: booking.id, fromStatus: current.status, toStatus: 'CANCELLED', changedBy: req.auth.id, note: 'Cancelled by customer.' } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Booking', entityId: booking.id, metadata: { from: current.status, to: 'CANCELLED', subscriptionVisitCreditRestored: creditRestored } } });
      return { updated: nextBooking };
    });
    await notifyUserSafely({ userId: req.auth.id, type: 'BOOKING', channel: 'IN_APP', title: 'Booking cancelled', body: `Booking ${booking.reference} has been cancelled.` });
    if (booking.assignment?.gardener?.userId) {
      await notifyUserSafely({ userId: booking.assignment.gardener.userId, type: 'BOOKING', channel: 'IN_APP', title: 'Assigned booking cancelled', body: `Booking ${booking.reference} was cancelled by the Customer.` });
    }
    return res.json({ booking: updated });
  } catch (error) { next(error); }
});

export function canTransitionBooking(from, to) { return allowedTransitions[from]?.has(to) ?? false; }
export default function bookingsRouter() { return router; }
