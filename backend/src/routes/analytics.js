import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
}).superRefine((v, ctx) => {
  if (v.from && v.to && v.from >= v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be after from.' });
});

router.get('/overview', async (req, res, next) => {
  try {
    const q = rangeQuery.parse(req.query);
    const createdAt = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) };
    const [users, customers, gardeners, bookings, completed, cancelled, payments, paidRevenue, refunds, subscriptions, issues, reviews] = await prisma.$transaction([
      prisma.user.count({ where: { createdAt } }),
      prisma.customerProfile.count({ where: { createdAt } }),
      prisma.gardenerProfile.count({ where: { createdAt } }),
      prisma.booking.count({ where: { createdAt } }),
      prisma.booking.count({ where: { createdAt, status: 'SERVICE_COMPLETED' } }),
      prisma.booking.count({ where: { createdAt, status: 'CANCELLED' } }),
      prisma.payment.count({ where: { createdAt } }),
      prisma.payment.aggregate({ where: { createdAt, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, _sum: { amount: true } }),
      prisma.refund.aggregate({ where: { createdAt, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, _sum: { amount: true } }),
      prisma.subscription.count({ where: { createdAt } }),
      prisma.issueReport.count({ where: { createdAt } }),
      prisma.review.count({ where: { createdAt } })
    ]);
    res.json({ overview: {
      users, customers, gardeners, bookings, completedBookings: completed, cancelledBookings: cancelled,
      paymentAttempts: payments, grossPaid: Number(paidRevenue._sum.amount ?? 0),
      refunded: Number(refunds._sum.amount ?? 0), subscriptions, issues, reviews
    }});
  } catch (error) { next(error); }
});

router.get('/bookings', async (req, res, next) => {
  try {
    const q = rangeQuery.extend({ limit: z.coerce.number().int().min(1).max(366).default(90) }).parse(req.query);
    const from = q.from ?? new Date(Date.now() - 90 * 86400000);
    const to = q.to ?? new Date();
    const rows = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt") AS day,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'SERVICE_COMPLETED')::int AS completed,
             COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
      FROM "Booking"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1 ORDER BY 1 ASC LIMIT ${q.limit}`;
    res.json({ rows });
  } catch (error) { next(error); }
});

router.get('/revenue', async (req, res, next) => {
  try {
    const q = rangeQuery.parse(req.query);
    const from = q.from ?? new Date(Date.now() - 90 * 86400000);
    const to = q.to ?? new Date();
    const rows = await prisma.$queryRaw`
      WITH paid_by_day AS (
        SELECT DATE_TRUNC('day', "paidAt") AS day, SUM("amount") AS paid
        FROM "Payment"
        WHERE "paidAt" IS NOT NULL
          AND status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND "paidAt" >= ${from} AND "paidAt" < ${to}
        GROUP BY 1
      ),
      refunded_by_day AS (
        SELECT DATE_TRUNC('day', "processedAt") AS day, SUM("amount") AS refunded
        FROM "Refund"
        WHERE "processedAt" IS NOT NULL
          AND status IN ('REFUNDED', 'PARTIALLY_REFUNDED')
          AND "processedAt" >= ${from} AND "processedAt" < ${to}
        GROUP BY 1
      )
      SELECT COALESCE(p.day, r.day) AS day,
             COALESCE(p.paid, 0) AS paid,
             COALESCE(r.refunded, 0) AS refunded
      FROM paid_by_day p
      FULL OUTER JOIN refunded_by_day r ON p.day = r.day
      ORDER BY day ASC`;
    res.json({ rows });
  } catch (error) { next(error); }
});

router.get('/gardeners', async (req, res, next) => {
  try {
    const rows = await prisma.gardenerProfile.findMany({
      select: { id: true, rating: true, kycStatus: true, user: { select: { id: true, fullName: true, status: true } }, _count: { select: { assignments: true, payouts: true } } },
      orderBy: { rating: 'desc' }
    });
    res.json({ gardeners: rows });
  } catch (error) { next(error); }
});

export default function analyticsRouter() { return router; }
