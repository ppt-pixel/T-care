import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const customerOrGardener = Router();
customerOrGardener.use(requireAuth, requireRole('CUSTOMER', 'GARDENER'));

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.enum(['true', 'false']).default('false')
});

customerOrGardener.get('/', async (req, res, next) => {
  try {
    const { page, limit, unreadOnly } = pageQuery.parse(req.query);
    const where = {
      userId: req.auth.id,
      ...(unreadOnly === 'true' ? { readAt: null } : {})
    };
    const [notifications, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.auth.id, readAt: null } })
    ]);

    res.json({
      notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      unreadCount
    });
  } catch (error) { next(error); }
});

customerOrGardener.get('/:id', async (req, res, next) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.auth.id }
    });
    if (!notification) return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' });
    res.json({ notification });
  } catch (error) { next(error); }
});

customerOrGardener.post('/:id/read', async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.auth.id, readAt: null },
      data: { readAt: new Date() }
    });
    if (!result.count) return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found or already read.' });
    res.json({ success: true });
  } catch (error) { next(error); }
});

customerOrGardener.post('/read-all', async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.auth.id, readAt: null },
      data: { readAt: new Date() }
    });
    res.json({ updated: result.count });
  } catch (error) { next(error); }
});

const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.get('/', async (req, res, next) => {
  try {
    const query = z.object({
      userId: z.string().min(1).optional(),
      type: z.enum(['BOOKING', 'SERVICE', 'PLANT_CARE', 'SUBSCRIPTION', 'PAYMENT', 'SYSTEM']).optional(),
      unreadOnly: z.enum(['true', 'false']).default('false'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50)
    }).parse(req.query);

    const where = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.unreadOnly === 'true' ? { readAt: null } : {})
    };

    const [notifications, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { user: { select: { id: true, email: true, fullName: true, role: true } } }
      }),
      prisma.notification.count({ where })
    ]);

    res.json({
      notifications,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
    });
  } catch (error) { next(error); }
});

admin.post('/send', async (req, res, next) => {
  try {
    const input = z.object({
      userId: z.string().min(1),
      type: z.enum(['BOOKING', 'SERVICE', 'PLANT_CARE', 'SUBSCRIPTION', 'PAYMENT', 'SYSTEM']),
      channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH']).default('IN_APP'),
      title: z.string().trim().min(1).max(160),
      body: z.string().trim().min(1).max(4000)
    }).strict().parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, status: true } });
    if (!user || user.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Active user not found.' });
    }

    const notification = await prisma.notification.create({ data: input });
    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth.id,
        action: 'CREATE',
        entityType: 'Notification',
        entityId: notification.id,
        metadata: { userId: input.userId, type: input.type, channel: input.channel }
      }
    });

    res.status(201).json({ notification });
  } catch (error) { next(error); }
});

router.use('/admin', admin);
router.use('/', customerOrGardener);

export default function notificationsRouter() { return router; }
