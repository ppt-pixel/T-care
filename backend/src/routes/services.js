import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const serviceInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(80),
  durationLabel: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
});

const priceInput = z.object({
  amount: z.number().finite().nonnegative(),
  minPlants: z.number().int().positive().nullable().optional(),
  maxPlants: z.number().int().positive().nullable().optional(),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().nullable().optional()
}).superRefine((v, ctx) => {
  if (v.minPlants != null && v.maxPlants != null && v.minPlants > v.maxPlants) {
    ctx.addIssue({ code: 'custom', path: ['maxPlants'], message: 'maxPlants must be greater than or equal to minPlants.' });
  }
  if (v.effectiveTo && v.effectiveTo <= v.effectiveFrom) {
    ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'effectiveTo must be after effectiveFrom.' });
  }
});

function serializeService(service) {
  return {
    ...service,
    prices: service.prices?.map(p => ({ ...p, amount: Number(p.amount) }))
  };
}

// Public catalog. Only active services and currently applicable prices are exposed.
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const services = await prisma.service.findMany({
      where: { status: 'ACTIVE' },
      include: {
        prices: {
          where: {
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
          },
          orderBy: [{ minPlants: 'asc' }, { amount: 'asc' }]
        }
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    return res.json({ services: services.map(serializeService) });
  } catch (error) { next(error); }
});

// Administrative catalog management.
const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.get('/', async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({ include: { prices: { orderBy: { effectiveFrom: 'desc' } } }, orderBy: { createdAt: 'desc' } });
    return res.json({ services: services.map(serializeService) });
  } catch (error) { next(error); }
});

admin.post('/', async (req, res, next) => {
  try {
    const input = serviceInput.parse(req.body);
    const service = await prisma.service.create({ data: input });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'Service', entityId: service.id, metadata: { name: service.name, category: service.category, status: service.status } } });
    return res.status(201).json({ service });
  } catch (error) { next(error); }
});

admin.patch('/:id', async (req, res, next) => {
  try {
    const input = serviceInput.partial().parse(req.body);
    const existing = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'SERVICE_NOT_FOUND', message: 'Service not found.' });
    const service = await prisma.service.update({ where: { id: existing.id }, data: input });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'Service', entityId: service.id, metadata: { changedFields: Object.keys(input), fromStatus: existing.status, toStatus: service.status } } });
    return res.json({ service });
  } catch (error) { next(error); }
});

admin.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'SERVICE_NOT_FOUND', message: 'Service not found.' });
    const bookingCount = await prisma.booking.count({ where: { serviceId: existing.id } });
    if (bookingCount) {
      const service = await prisma.service.update({ where: { id: existing.id }, data: { status: 'INACTIVE' } });
      await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Service', entityId: service.id, metadata: { fromStatus: existing.status, toStatus: 'INACTIVE', reason: 'Service has booking history.' } } });
      return res.json({ service, deactivated: true, message: 'Service has booking history and was deactivated instead of deleted.' });
    }
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'Service', entityId: existing.id, metadata: { name: existing.name } } });
    await prisma.service.delete({ where: { id: existing.id } });
    return res.status(204).send();
  } catch (error) { next(error); }
});

admin.post('/:id/prices', async (req, res, next) => {
  try {
    const input = priceInput.parse(req.body);
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'SERVICE_NOT_FOUND', message: 'Service not found.' });
    const price = await prisma.servicePrice.create({ data: { ...input, serviceId: service.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'ServicePrice', entityId: price.id, metadata: { serviceId: service.id, amount: Number(price.amount), minPlants: price.minPlants, maxPlants: price.maxPlants } } });
    return res.status(201).json({ price: { ...price, amount: Number(price.amount) } });
  } catch (error) { next(error); }
});

admin.patch('/:id/prices/:priceId', async (req, res, next) => {
  try {
    const input = priceInput.partial().parse(req.body);
    const price = await prisma.servicePrice.findFirst({ where: { id: req.params.priceId, serviceId: req.params.id } });
    if (!price) return res.status(404).json({ error: 'PRICE_NOT_FOUND', message: 'Service price not found.' });
    const nextData = { ...input };
    const from = input.effectiveFrom ?? price.effectiveFrom;
    const to = input.effectiveTo === undefined ? price.effectiveTo : input.effectiveTo;
    if (to && to <= from) return res.status(400).json({ error: 'INVALID_PRICE_PERIOD', message: 'effectiveTo must be after effectiveFrom.' });
    const updated = await prisma.servicePrice.update({ where: { id: price.id }, data: nextData });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'ServicePrice', entityId: price.id, metadata: { serviceId: req.params.id, changedFields: Object.keys(input) } } });
    return res.json({ price: { ...updated, amount: Number(updated.amount) } });
  } catch (error) { next(error); }
});

admin.delete('/:id/prices/:priceId', async (req, res, next) => {
  try {
    const price = await prisma.servicePrice.findFirst({ where: { id: req.params.priceId, serviceId: req.params.id } });
    if (!price) return res.status(404).json({ error: 'PRICE_NOT_FOUND', message: 'Service price not found.' });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'ServicePrice', entityId: price.id, metadata: { serviceId: req.params.id, amount: Number(price.amount) } } });
    await prisma.servicePrice.delete({ where: { id: price.id } });
    return res.status(204).send();
  } catch (error) { next(error); }
});

router.use('/admin', admin);

router.get('/:id', async (req, res, next) => {
  try {
    const now = new Date();
    const service = await prisma.service.findFirst({
      where: { id: req.params.id, status: 'ACTIVE' },
      include: { prices: { where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, orderBy: [{ minPlants: 'asc' }, { amount: 'asc' }] } }
    });
    if (!service) return res.status(404).json({ error: 'SERVICE_NOT_FOUND', message: 'Service not found.' });
    return res.json({ service: serializeService(service) });
  } catch (error) { next(error); }
});

export default function servicesRouter() { return router; }
