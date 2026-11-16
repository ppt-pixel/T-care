import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { notifyUserSafely } from '../lib/notifications.js';
import { createSignedDownloadUrl } from '../lib/supabaseStorage.js';
import { serializeCustomerPayment } from '../lib/paymentView.js';

const router = Router();
router.use(requireAuth, requireRole('CUSTOMER'));

const createBookingSchema = z.object({
  serviceId: z.string().min(1),
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
    const customer = await getCustomer(req.auth.id);
    const now = new Date();
    if (input.scheduledStart <= now) return res.status(400).json({ error: 'INVALID_SCHEDULE', message: 'scheduledStart must be in the future.' });

    const uniquePlantIds = [...new Set(input.plantIds)];
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${customer.id} FOR UPDATE`;

      const [service, address, plants] = await Promise.all([
        tx.service.findFirst({ where: { id: input.serviceId, status: 'ACTIVE' } }),
        tx.address.findFirst({ where: { id: input.addressId, customerId: customer.id } }),
        tx.plant.findMany({ where: { id: { in: uniquePlantIds }, customerId: customer.id }, select: { id: true } })
      ]);
      if (!service) throw Object.assign(new Error('Service not found or inactive.'), { statusCode: 404, code: 'SERVICE_NOT_FOUND' });
      if (!address) throw Object.assign(new Error('Address not found.'), { statusCode: 404, code: 'ADDRESS_NOT_FOUND' });
      if (plants.length !== uniquePlantIds.length) throw Object.assign(new Error('One or more selected plants do not belong to this customer.'), { statusCode: 403, code: 'PLANT_OWNERSHIP_VIOLATION' });

      const price = await getCurrentPrice(tx, service.id, plants.length, now);
      const subtotal = Number(price.amount);
      const convenienceFee = Number(env.BOOKING_CONVENIENCE_FEE);
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
          subtotal,
          convenienceFee,
          total,
          plants: { create: plants.map(p => ({ plantId: p.id })) },
          statusHistory: { create: { toStatus: 'CONFIRMED', note: 'Booking created by customer.', changedBy: req.auth.id } }
        },
        include: { service: true, address: true, plants: { include: { plant: true } }, statusHistory: { orderBy: { createdAt: 'asc' } } }
      });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'Booking', entityId: booking.id, metadata: { reference: booking.reference, serviceId: booking.serviceId, plantCount: booking.plants.length } } });
      return booking;
    });

    await notifyUserSafely({ userId: req.auth.id, type: 'BOOKING', channel: 'IN_APP', title: 'Booking request received', body: `Your ${result.service?.name || 'T-CARE service'} booking ${result.reference} is confirmed as a request. T-CARE will assign a verified Gardener.` });
    return res.status(201).json({ booking: { ...result, subtotal: Number(result.subtotal), convenienceFee: Number(result.convenienceFee), total: Number(result.total) } });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const bookings = await prisma.booking.findMany({
      where: { customerId: customer.id },
      include: { service: true, address: true, plants: { include: { plant: true } }, assignment: { include: { gardener: { include: { user: { select: { fullName: true, phone: true } } } } } }, payment: { include: { refunds: true } } },
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
      include: { service: true, address: true, plants: { include: { plant: { include: { photos: true } } } }, statusHistory: { orderBy: { createdAt: 'asc' } }, assignment: { include: { gardener: { include: { user: { select: { fullName: true, phone: true } } } } } }, report: { include: { checklistItems: true, photos: true, plants: { include: { plant: true } } } }, payment: { include: { refunds: true } }, review: true }
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
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, customerId: customer.id },
      include: { assignment: { include: { gardener: { select: { userId: true } } } } }
    });
    if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' });
    if (!allowedTransitions[booking.status]?.has('CANCELLED')) return res.status(409).json({ error: 'BOOKING_CANNOT_CANCEL', message: `Booking cannot be cancelled from ${booking.status}.` });
    const { updated } = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${booking.id} FOR UPDATE`;
      const current = await tx.booking.findUnique({ where: { id: booking.id }, select: { status: true } });
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
      const nextBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
      if (booking.assignment) {
        await tx.gardenerAssignment.update({ where: { id: booking.assignment.id }, data: { status: 'CANCELLED' } });
      }
      await tx.bookingStatusHistory.create({ data: { bookingId: booking.id, fromStatus: current.status, toStatus: 'CANCELLED', changedBy: req.auth.id, note: 'Cancelled by customer.' } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Booking', entityId: booking.id, metadata: { from: current.status, to: 'CANCELLED' } } });
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
