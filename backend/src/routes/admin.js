import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { canTransitionBooking } from './bookings.js';
import { notifyUserSafely } from '../lib/notifications.js';

const router = Router();
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

router.use(requireAuth, requireRole('ADMIN'));

const pageQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional()
});

async function audit(actorUserId, action, entityType, entityId, metadata = {}) {
    await prisma.auditLog.create({ data: { actorUserId, action, entityType, entityId, metadata } });
}

function serializeMoney(value) { return value == null ? value : Number(value); }

// ---------- Dashboard / operational overview ----------
router.get('/overview', async(req, res, next) => {
    try {
        const [users, gardeners, customers, activeBookings, pendingKyc, pendingPayments, openIssues, pendingReviews] = await prisma.$transaction([
            prisma.user.count(),
            prisma.user.count({ where: { role: 'GARDENER' } }),
            prisma.user.count({ where: { role: 'CUSTOMER' } }),
            prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'GARDENER_ASSIGNED', 'GARDENER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED'] } } }),
            prisma.gardenerProfile.count({ where: { kycStatus: 'PENDING' } }),
            prisma.payment.count({ where: { status: { in: ['PENDING', 'AUTHORIZED'] } } }),
            prisma.issueReport.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
            prisma.review.count({ where: { status: 'PENDING' } })
        ]);
        res.json({ overview: { users, customers, gardeners, activeBookings, pendingKyc, pendingPayments, openIssues, pendingReviews } });
    } catch (error) { next(error); }
});

// ---------- Users / customer access management ----------
router.get('/users', async(req, res, next) => {
    try {
        const q = pageQuery.extend({
            role: z.enum(['CUSTOMER', 'GARDENER', 'ADMIN']).optional(),
            status: z.enum(['ACTIVE', 'BLOCKED', 'PENDING', 'INACTIVE']).optional()
        }).parse(req.query);
        const where = {
            ...(q.role ? { role: q.role } : {}),
            ...(q.status ? { status: q.status } : {}),
            ...(q.search ? {
                OR: [
                    { email: { contains: q.search, mode: 'insensitive' } },
                    { fullName: { contains: q.search, mode: 'insensitive' } },
                    { phone: { contains: q.search, mode: 'insensitive' } }
                ]
            } : {})
        };
        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({ where, select: { id: true, email: true, fullName: true, phone: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, updatedAt: true, lastLoginAt: true, customerProfile: { select: { id: true } }, gardenerProfile: { select: { id: true, kycStatus: true, rating: true, serviceArea: true } }, _count: { select: { notifications: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.user.count({ where })
        ]);
        res.json({ users, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

router.get('/users/:id', async(req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, email: true, fullName: true, phone: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, updatedAt: true, lastLoginAt: true, customerProfile: { include: { addresses: true, plants: { include: { photos: true } } } }, gardenerProfile: { include: { availability: true, kycDocuments: { select: { id: true, documentType: true, originalFileName: true, contentType: true, sizeBytes: true, status: true, reviewNote: true, reviewedAt: true, mediaAssetId: true, createdAt: true } } } } }
        });
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found.' });
        res.json({ user });
    } catch (error) { next(error); }
});

router.patch('/users/:id/status', async(req, res, next) => {
    try {
        const input = z.object({ status: z.enum(['ACTIVE', 'BLOCKED', 'PENDING', 'INACTIVE']) }).strict().parse(req.body);
        if (req.params.id === req.auth.id) return res.status(409).json({ error: 'SELF_STATUS_CHANGE_FORBIDDEN', message: 'An administrator cannot change their own account status.' });
        const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, status: true, email: true } });
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found.' });
        const updated = await prisma.$transaction(async tx => {
            const changed = await tx.user.update({ where: { id: user.id }, data: { status: input.status }, select: { id: true, email: true, role: true, status: true } });
            await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
            await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'User', entityId: user.id, metadata: { from: user.status, to: input.status, refreshSessionsRevoked: true } } });
            return changed;
        });
        await notifyUserSafely({ userId: user.id, type: 'SYSTEM', channel: 'IN_APP', title: 'Account status updated', body: `Your T-CARE account status is now ${input.status}.` });
        res.json({ user: updated });
    } catch (error) { next(error); }
});

// ---------- Gardener KYC / access ----------
router.get('/gardeners', async(req, res, next) => {
    try {
        const q = pageQuery.extend({ kycStatus: z.enum(['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED']).optional(), status: z.enum(['ACTIVE', 'BLOCKED', 'PENDING', 'INACTIVE']).optional() }).parse(req.query);
        const where = { user: {...(q.search ? { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search, mode: 'insensitive' } }] } : {}), ...(q.status ? { status: q.status } : {}) }, ...(q.kycStatus ? { kycStatus: q.kycStatus } : {}) };
        const [gardeners, total] = await prisma.$transaction([
            prisma.gardenerProfile.findMany({ where, include: { user: { select: { id: true, fullName: true, email: true, phone: true, status: true } }, kycDocuments: { orderBy: { createdAt: 'desc' }, select: { id: true, mediaAssetId: true, documentType: true, originalFileName: true, contentType: true, sizeBytes: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.gardenerProfile.count({ where })
        ]);
        res.json({ gardeners, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

router.patch('/gardeners/:id/kyc', async(req, res, next) => {
    try {
        const input = z.object({ kycStatus: z.enum(['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED']), note: z.string().trim().max(1000).optional() }).strict().parse(req.body);
        const gardener = await prisma.gardenerProfile.findUnique({ where: { id: req.params.id }, include: { user: { select: { id: true, status: true } } } });
        if (!gardener) return res.status(404).json({ error: 'GARDENER_NOT_FOUND', message: 'Gardener not found.' });
        if (input.kycStatus === 'VERIFIED') {
            const verifiedSourceCount = await prisma.gardenerKycDocument.count({ where: { gardenerId: gardener.id, status: { in: ['PENDING', 'VERIFIED'] } } });
            if (!verifiedSourceCount) return res.status(409).json({ error: 'KYC_DOCUMENTS_REQUIRED', message: 'At least one submitted identity document is required before KYC can be verified.' });
        }
        const updated = await prisma.$transaction(async tx => {
            const profile = await tx.gardenerProfile.update({ where: { id: gardener.id }, data: { kycStatus: input.kycStatus } });
            if (input.kycStatus === 'VERIFIED') {
                await tx.gardenerKycDocument.updateMany({
                    where: { gardenerId: gardener.id, status: 'PENDING' },
                    data: { status: 'VERIFIED', reviewNote: input.note || null, reviewedAt: new Date(), reviewedByUserId: req.auth.id }
                });
            } else if (input.kycStatus === 'REJECTED') {
                await tx.gardenerKycDocument.updateMany({
                    where: { gardenerId: gardener.id, status: { in: ['PENDING', 'VERIFIED'] } },
                    data: { status: 'REJECTED', reviewNote: input.note || null, reviewedAt: new Date(), reviewedByUserId: req.auth.id }
                });
            } else if (input.kycStatus === 'PENDING') {
                await tx.gardenerKycDocument.updateMany({ where: { gardenerId: gardener.id, status: 'REJECTED' }, data: { status: 'PENDING', reviewNote: null, reviewedAt: null, reviewedByUserId: null } });
            }
            await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'GardenerProfile', entityId: gardener.id, metadata: { from: gardener.kycStatus, to: input.kycStatus, note: input.note || null } } });
            return profile;
        });
        await notifyUserSafely({ userId: gardener.user.id, type: 'SYSTEM', channel: 'IN_APP', title: 'Gardener verification updated', body: `Your professional verification status is now ${input.kycStatus}.${input.note ? ` Admin note: ${input.note}` : ''}` });
        res.json({ gardener: updated });
    } catch (error) { next(error); }
});

// ---------- Plants ----------
router.get('/plants', async(req, res, next) => {
    try {
        const q = pageQuery.parse(req.query);
        const where = q.search ? {
            OR: [
                { name: { contains: q.search, mode: 'insensitive' } },
                { type: { contains: q.search, mode: 'insensitive' } },
                { customer: { user: { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } } }
            ]
        } : {};
        const [plants, total] = await prisma.$transaction([
            prisma.plant.findMany({ where, include: { customer: { include: { user: { select: { id: true, fullName: true, email: true } } } }, photos: true }, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.plant.count({ where })
        ]);
        res.json({ plants, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

// ---------- Shared plant knowledge library ----------
const plantKnowledgeInput = z.object({
    commonName: z.string().trim().min(1).max(160),
    scientificName: z.string().trim().max(160).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    watering: z.string().trim().max(2000).nullable().optional(),
    light: z.string().trim().max(2000).nullable().optional(),
    feeding: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(10000).nullable().optional()
}).strict();

router.get('/plant-knowledge', async (req, res, next) => {
    try {
        const q = pageQuery.parse(req.query);
        const where = q.search ? { OR: [
            { commonName: { contains: q.search, mode: 'insensitive' } },
            { scientificName: { contains: q.search, mode: 'insensitive' } },
            { category: { contains: q.search, mode: 'insensitive' } }
        ] } : {};
        const [items, total] = await prisma.$transaction([
            prisma.plantKnowledge.findMany({ where, orderBy: { commonName: 'asc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.plantKnowledge.count({ where })
        ]);
        res.json({ items, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

router.post('/plant-knowledge', async (req, res, next) => {
    try {
        const input = plantKnowledgeInput.parse(req.body);
        const item = await prisma.plantKnowledge.create({ data: input });
        await audit(req.auth.id, 'CREATE', 'PlantKnowledge', item.id, { commonName: item.commonName });
        res.status(201).json({ item });
    } catch (error) { next(error); }
});

router.patch('/plant-knowledge/:id', async (req, res, next) => {
    try {
        const input = plantKnowledgeInput.partial().parse(req.body);
        const existing = await prisma.plantKnowledge.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'PLANT_KNOWLEDGE_NOT_FOUND', message: 'Plant knowledge record not found.' });
        const item = await prisma.plantKnowledge.update({ where: { id: existing.id }, data: input });
        await audit(req.auth.id, 'UPDATE', 'PlantKnowledge', item.id, { fields: Object.keys(input) });
        res.json({ item });
    } catch (error) { next(error); }
});

router.delete('/plant-knowledge/:id', async (req, res, next) => {
    try {
        const existing = await prisma.plantKnowledge.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'PLANT_KNOWLEDGE_NOT_FOUND', message: 'Plant knowledge record not found.' });
        await prisma.plantKnowledge.delete({ where: { id: existing.id } });
        await audit(req.auth.id, 'DELETE', 'PlantKnowledge', existing.id, { commonName: existing.commonName });
        res.status(204).send();
    } catch (error) { next(error); }
});

// ---------- Booking operations ----------
router.get('/bookings', async(req, res, next) => {
    try {
        const q = pageQuery.extend({ status: z.enum(['CONFIRMED', 'GARDENER_ASSIGNED', 'GARDENER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'CANCELLED']).optional(), gardenerId: z.string().optional() }).parse(req.query);
        const where = {...(q.status ? { status: q.status } : {}), ...(q.gardenerId ? { assignment: { gardenerId: q.gardenerId } } : {}), ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { customer: { user: { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } } }] } : {}) };
        const [bookings, total] = await prisma.$transaction([
            prisma.booking.findMany({ where, include: { service: true, customer: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } }, address: true, plants: { include: { plant: true } }, assignment: { include: { gardener: { include: { user: { select: { id: true, fullName: true, phone: true } } } } } }, payment: { include: { refunds: true } } }, orderBy: { scheduledStart: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.booking.count({ where })
        ]);
        res.json({ bookings: bookings.map(b => ({...b, subtotal: serializeMoney(b.subtotal), convenienceFee: serializeMoney(b.convenienceFee), total: serializeMoney(b.total), payment: b.payment ? {...b.payment, amount: serializeMoney(b.payment.amount), refunds: b.payment.refunds.map(r => ({...r, amount: serializeMoney(r.amount) })) } : null })), pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

router.get('/bookings/:id', async(req, res, next) => {
    try {
        const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { service: true, customer: { include: { user: { select: { id: true, fullName: true, email: true, phone: true, status: true } } } }, address: true, plants: { include: { plant: { include: { photos: true } } } }, statusHistory: { orderBy: { createdAt: 'asc' } }, assignment: { include: { gardener: { include: { user: { select: { id: true, fullName: true, phone: true, status: true } } } } } }, payment: { include: { refunds: true, events: { orderBy: { receivedAt: 'desc' }, take: 50 } } }, report: { include: { checklistItems: true, plants: true, photos: true } }, review: true, issues: true } });
        if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' });
        res.json({ booking: {...booking, subtotal: serializeMoney(booking.subtotal), convenienceFee: serializeMoney(booking.convenienceFee), total: serializeMoney(booking.total), payment: booking.payment ? {...booking.payment, amount: serializeMoney(booking.payment.amount), refunds: booking.payment.refunds.map(r => ({...r, amount: serializeMoney(r.amount) })) } : null } });
    } catch (error) { next(error); }
});

router.patch('/bookings/:id/status', async(req, res, next) => {
    try {
        const input = z.object({ status: z.enum(['CONFIRMED', 'GARDENER_ASSIGNED', 'GARDENER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'CANCELLED']), note: z.string().trim().max(1000).optional() }).strict().parse(req.body);
        const booking = await prisma.booking.findUnique({
            where: { id: req.params.id },
            include: {
                customer: { select: { userId: true } },
                assignment: { include: { gardener: { select: { userId: true } } } },
                payment: { select: { status: true } }
            }
        });
        if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' });
        if (!canTransitionBooking(booking.status, input.status)) return res.status(409).json({ error: 'INVALID_BOOKING_TRANSITION', message: `Booking cannot transition from ${booking.status} to ${input.status}.` });
        if (input.status === 'CANCELLED' && ['PAID', 'PARTIALLY_REFUNDED'].includes(booking.payment?.status)) {
            return res.status(409).json({ error: 'REFUND_REQUIRED', message: 'A processed payment must go through the refund workflow before this booking can be cancelled.' });
        }
        const updated = await prisma.$transaction(async tx => {
            const b = await tx.booking.update({ where: { id: booking.id }, data: { status: input.status } });
            if (input.status === 'CANCELLED' && booking.assignment) {
                await tx.gardenerAssignment.update({ where: { id: booking.assignment.id }, data: { status: 'CANCELLED' } });
            }
            await tx.bookingStatusHistory.create({ data: { bookingId: booking.id, fromStatus: booking.status, toStatus: input.status, changedBy: req.auth.id, note: input.note || 'Administrative status change.' } });
            return b;
        });
        await audit(req.auth.id, 'STATUS_CHANGE', 'Booking', booking.id, { from: booking.status, to: input.status, note: input.note });
        if (input.status === 'CANCELLED') {
            await notifyUserSafely({ userId: booking.customer.userId, type: 'BOOKING', channel: 'IN_APP', title: 'Booking cancelled', body: `Booking ${booking.reference} was cancelled by T-CARE.` });
            if (booking.assignment?.gardener?.userId) await notifyUserSafely({ userId: booking.assignment.gardener.userId, type: 'BOOKING', channel: 'IN_APP', title: 'Assigned booking cancelled', body: `Booking ${booking.reference} was cancelled by T-CARE.` });
        }
        res.json({ booking: updated });
    } catch (error) { next(error); }
});

router.post('/bookings/:id/assign', async(req, res, next) => {
    try {
        const input = z.object({ gardenerId: z.string().min(1) }).strict().parse(req.body);
        const result = await prisma.$transaction(async tx => {
            const booking = await tx.booking.findUnique({ where: { id: req.params.id }, include: { assignment: true, customer: { select: { userId: true } } } });
            if (!booking) throw Object.assign(new Error('Booking not found.'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
            if (!['CONFIRMED', 'GARDENER_ASSIGNED'].includes(booking.status)) throw Object.assign(new Error('Booking is not assignable in its current state.'), { statusCode: 409, code: 'BOOKING_NOT_ASSIGNABLE' });
            const gardener = await tx.gardenerProfile.findUnique({ where: { id: input.gardenerId }, include: { user: { select: { id: true, status: true } } } });
            if (!gardener) throw Object.assign(new Error('Gardener not found.'), { statusCode: 404, code: 'GARDENER_NOT_FOUND' });
            if (gardener.user.status !== 'ACTIVE') throw Object.assign(new Error('Gardener account is not active.'), { statusCode: 409, code: 'GARDENER_INACTIVE' });
            if (gardener.kycStatus !== 'VERIFIED') throw Object.assign(new Error('Only KYC-verified gardeners can receive assignments.'), { statusCode: 409, code: 'GARDENER_KYC_REQUIRED' });
            if (booking.assignment?.gardenerId === gardener.id && booking.assignment.status !== 'REJECTED' && booking.assignment.status !== 'CANCELLED') return { booking, assignment: booking.assignment, unchanged: true };
            const overlappingAssignment = await tx.gardenerAssignment.findFirst({
                where: {
                    gardenerId: gardener.id,
                    status: { notIn: ['REJECTED', 'COMPLETED', 'CANCELLED'] },
                    booking: { is: {
                        id: { not: booking.id },
                        status: { notIn: ['SERVICE_COMPLETED', 'CANCELLED'] },
                        scheduledStart: { lt: booking.scheduledEnd },
                        scheduledEnd: { gt: booking.scheduledStart }
                    } }
                },
                select: { id: true, booking: { select: { reference: true } } }
            });
            if (overlappingAssignment) throw Object.assign(new Error(`This Gardener already has an overlapping assignment (${overlappingAssignment.booking.reference}). Choose another Gardener or visit time.`), { statusCode: 409, code: 'GARDENER_SCHEDULE_CONFLICT' });
            if (booking.assignment) await tx.gardenerAssignment.update({ where: { id: booking.assignment.id }, data: { gardenerId: gardener.id, status: 'ASSIGNED', acceptedAt: null, startedAt: null, completedAt: null } });
            else await tx.gardenerAssignment.create({ data: { bookingId: booking.id, gardenerId: gardener.id, status: 'ASSIGNED' } });
            const updatedBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'GARDENER_ASSIGNED' } });
            await tx.bookingStatusHistory.create({ data: { bookingId: booking.id, fromStatus: booking.status, toStatus: 'GARDENER_ASSIGNED', changedBy: req.auth.id, note: 'Gardener assigned by admin.' } });
            return { booking: updatedBooking, assignment: await tx.gardenerAssignment.findUnique({ where: { bookingId: booking.id } }), gardenerUserId: gardener.user.id, customerUserId: booking.customer.userId };
        });
        await audit(req.auth.id, 'STATUS_CHANGE', 'GardenerAssignment', result.assignment.id, { bookingId: req.params.id, gardenerId: input.gardenerId, unchanged: result.unchanged ?? false });
        if (!result.unchanged) {
            await notifyUserSafely({ userId: result.gardenerUserId, type: 'BOOKING', channel: 'IN_APP', title: 'New job assignment', body: `You have been assigned booking ${result.booking.reference}. Review the job details and accept or reject the assignment.` });
            await notifyUserSafely({ userId: result.customerUserId, type: 'BOOKING', channel: 'IN_APP', title: 'Gardener assigned', body: `A verified Gardener has been assigned to booking ${result.booking.reference}.` });
        }
        res.status(result.unchanged ? 200 : 201).json(result);
    } catch (error) { next(error); }
});

// ---------- Financial visibility / payouts ----------
router.get('/payments', async(req, res, next) => {
    try {
        const q = pageQuery.extend({ status: z.enum(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED']).optional() }).parse(req.query);
        const where = {...(q.status ? { status: q.status } : {}), ...(q.search ? { OR: [{ providerOrderId: { contains: q.search, mode: 'insensitive' } }, { providerPaymentId: { contains: q.search, mode: 'insensitive' } }, { booking: { reference: { contains: q.search, mode: 'insensitive' } } }] } : {}) };
        const [payments, total] = await prisma.$transaction([
            prisma.payment.findMany({ where, include: { booking: { select: { id: true, reference: true, customer: { include: { user: { select: { fullName: true, email: true } } } } } }, subscription: { select: { id: true, customer: { include: { user: { select: { fullName: true, email: true } } } }, plan: true } }, refunds: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.payment.count({ where })
        ]);
        res.json({ payments: payments.map(p => ({...p, amount: serializeMoney(p.amount), refunds: p.refunds.map(r => ({...r, amount: serializeMoney(r.amount) })) })), pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

router.get('/payouts', async(req, res, next) => {
    try {
        const q = pageQuery.extend({ status: z.enum(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED']).optional(), gardenerId: z.string().optional() }).parse(req.query);
        const where = {...(q.status ? { status: q.status } : {}), ...(q.gardenerId ? { gardenerId: q.gardenerId } : {}) };
        const [payouts, total] = await prisma.$transaction([
            prisma.payout.findMany({ where, include: { gardener: { include: { user: { select: { id: true, fullName: true, email: true } } } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.payout.count({ where })
        ]);
        res.json({ payouts: payouts.map(p => ({...p, amount: serializeMoney(p.amount) })), pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

router.patch('/payouts/:id/status', async(req, res, next) => {
    try {
        const input = z.object({ status: z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELLED']) }).strict().parse(req.body);
        const payout = await prisma.payout.findUnique({ where: { id: req.params.id } });
        if (!payout) return res.status(404).json({ error: 'PAYOUT_NOT_FOUND', message: 'Payout not found.' });
        if (payout.status === 'PAID' && input.status !== 'PAID') return res.status(409).json({ error: 'PAID_PAYOUT_IMMUTABLE', message: 'A paid payout cannot be moved back to another state.' });
        const updated = await prisma.payout.update({ where: { id: payout.id }, data: { status: input.status, paidAt: input.status === 'PAID' ? (payout.paidAt || new Date()) : payout.paidAt } });
        await audit(req.auth.id, 'STATUS_CHANGE', 'Payout', payout.id, { from: payout.status, to: input.status });
        res.json({ payout: {...updated, amount: serializeMoney(updated.amount) } });
    } catch (error) { next(error); }
});

// ---------- Audit log ----------
router.get('/audit-logs', async(req, res, next) => {
    try {
        const q = pageQuery.extend({ entityType: z.string().trim().max(80).optional(), action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'STATUS_CHANGE', 'PAYMENT_EVENT']).optional(), actorUserId: z.string().optional() }).parse(req.query);
        const where = {...(q.entityType ? { entityType: q.entityType } : {}), ...(q.action ? { action: q.action } : {}), ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}) };
        const [logs, total] = await prisma.$transaction([
            prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, fullName: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
            prisma.auditLog.count({ where })
        ]);
        res.json({ logs, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
    } catch (error) { next(error); }
});

export default function adminRouter() { return router; }