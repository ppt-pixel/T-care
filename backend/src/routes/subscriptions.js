import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const planInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  billingCycle: z.string().trim().min(1).max(40),
  plantLimit: z.number().int().positive().nullable().optional(),
  price: z.number().finite().nonnegative(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict();

const planPatch = planInput.partial();

function serializePlan(plan) {
  return { ...plan, price: Number(plan.price) };
}

function addBillingPeriod(date, billingCycle) {
  const next = new Date(date);
  const cycle = billingCycle.trim().toLowerCase();
  if (cycle.includes('year')) next.setUTCFullYear(next.getUTCFullYear() + 1);
  else if (cycle.includes('month')) next.setUTCMonth(next.getUTCMonth() + 1);
  else if (cycle.includes('week')) next.setUTCDate(next.getUTCDate() + 7);
  else if (cycle.includes('day')) next.setUTCDate(next.getUTCDate() + 1);
  else return null;
  return next;
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

async function getCustomer(req) {
  const customer = await prisma.customerProfile.findUnique({ where: { userId: req.auth.id } });
  if (!customer) throw httpError(404, 'CUSTOMER_PROFILE_NOT_FOUND', 'Customer profile not found.');
  return customer;
}

// Public subscription catalog.
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ price: 'asc' }, { name: 'asc' }]
    });
    return res.json({ plans: plans.map(serializePlan) });
  } catch (error) { next(error); }
});

const customer = Router();
customer.use(requireAuth, requireRole('CUSTOMER'));

customer.get('/', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const subscriptions = await prisma.subscription.findMany({
      where: { customerId: profile.id },
      include: { plan: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ subscriptions: subscriptions.map(item => ({ ...item, plan: serializePlan(item.plan) })) });
  } catch (error) { next(error); }
});

customer.get('/:id', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const subscription = await prisma.subscription.findFirst({
      where: { id: req.params.id, customerId: profile.id },
      include: { plan: true }
    });
    if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    return res.json({ subscription: { ...subscription, plan: serializePlan(subscription.plan) } });
  } catch (error) { next(error); }
});

customer.post('/', async (req, res, next) => {
  try {
    const input = z.object({ planId: z.string().min(1) }).strict().parse(req.body);
    const profile = await getCustomer(req);
    const plan = await prisma.subscriptionPlan.findFirst({ where: { id: input.planId, status: 'ACTIVE' } });
    if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found or inactive.');

    const existing = await prisma.subscription.findFirst({
      where: { customerId: profile.id, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } },
      select: { id: true, status: true }
    });
    if (existing) throw httpError(409, 'ACTIVE_SUBSCRIPTION_EXISTS', 'The customer already has an active or pending subscription.');

    const subscription = await prisma.$transaction(async tx => {
      const created = await tx.subscription.create({
        data: { customerId: profile.id, planId: plan.id, status: 'PENDING' },
        include: { plan: true }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: req.auth.id,
          action: 'CREATE',
          entityType: 'Subscription',
          entityId: created.id,
          metadata: { planId: plan.id, status: 'PENDING' }
        }
      });
      return created;
    });

    return res.status(201).json({
      subscription: { ...subscription, plan: serializePlan(subscription.plan) },
      paymentRequired: true,
      message: 'Subscription created in PENDING state. Activate it only after a verified payment/provider result.'
    });
  } catch (error) { next(error); }
});

customer.post('/:id/cancel', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, customerId: profile.id }, include: { plan: true } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (!['PENDING', 'ACTIVE', 'PAUSED'].includes(existing.status)) {
      throw httpError(409, 'SUBSCRIPTION_NOT_CANCELLABLE', 'This subscription cannot be cancelled in its current state.');
    }
    const updated = await prisma.$transaction(async tx => {
      const item = await tx.subscription.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
        include: { plan: true }
      });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: 'CANCELLED' } } });
      return item;
    });
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

customer.post('/:id/pause', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, customerId: profile.id } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (existing.status !== 'ACTIVE') throw httpError(409, 'SUBSCRIPTION_NOT_PAUSABLE', 'Only active subscriptions can be paused.');
    const updated = await prisma.$transaction(async tx => {
      const item = await tx.subscription.update({ where: { id: existing.id }, data: { status: 'PAUSED', pausedAt: new Date() }, include: { plan: true } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: 'PAUSED' } } });
      return item;
    });
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

customer.post('/:id/resume', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, customerId: profile.id } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (existing.status !== 'PAUSED') throw httpError(409, 'SUBSCRIPTION_NOT_RESUMABLE', 'Only paused subscriptions can be resumed.');
    const updated = await prisma.$transaction(async tx => {
      const item = await tx.subscription.update({ where: { id: existing.id }, data: { status: 'ACTIVE', pausedAt: null }, include: { plan: true } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: 'ACTIVE' } } });
      return item;
    });
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({ include: { _count: { select: { subscriptions: true } } }, orderBy: { createdAt: 'desc' } });
    return res.json({ plans: plans.map(serializePlan) });
  } catch (error) { next(error); }
});

admin.post('/plans', async (req, res, next) => {
  try {
    const input = planInput.parse(req.body);
    const plan = await prisma.subscriptionPlan.create({ data: input });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'SubscriptionPlan', entityId: plan.id, metadata: { name: plan.name } } });
    return res.status(201).json({ plan: serializePlan(plan) });
  } catch (error) { next(error); }
});

admin.patch('/plans/:id', async (req, res, next) => {
  try {
    const input = planPatch.parse(req.body);
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found.');
    const plan = await prisma.subscriptionPlan.update({ where: { id: existing.id }, data: input });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'SubscriptionPlan', entityId: plan.id, metadata: { changed: Object.keys(input) } } });
    return res.json({ plan: serializePlan(plan) });
  } catch (error) { next(error); }
});

admin.delete('/plans/:id', async (req, res, next) => {
  try {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found.');
    const count = await prisma.subscription.count({ where: { planId: existing.id } });
    if (count) {
      const plan = await prisma.subscriptionPlan.update({ where: { id: existing.id }, data: { status: 'INACTIVE' } });
      await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'SubscriptionPlan', entityId: plan.id, metadata: { fromStatus: existing.status, toStatus: 'INACTIVE', reason: 'subscription_history' } } });
      return res.json({ plan: serializePlan(plan), deactivated: true });
    }
    await prisma.subscriptionPlan.delete({ where: { id: existing.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'SubscriptionPlan', entityId: existing.id, metadata: {} } });
    return res.status(204).send();
  } catch (error) { next(error); }
});

admin.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING']).parse(req.query.status) : undefined;
    const subscriptions = await prisma.subscription.findMany({
      where: status ? { status } : undefined,
      include: { plan: true, customer: { include: { user: { select: { id: true, email: true, fullName: true, status: true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ subscriptions: subscriptions.map(item => ({ ...item, plan: serializePlan(item.plan) })) });
  } catch (error) { next(error); }
});

admin.patch('/:id/status', async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING']) }).strict().parse(req.body);
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    const now = new Date();
    let data = { status: input.status };
    if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      data.startedAt = existing.startedAt ?? now;
      data.cancelledAt = null;
      data.pausedAt = null;
      data.renewsAt = addBillingPeriod(data.startedAt, existing.plan.billingCycle);
    }
    if (input.status === 'CANCELLED') data.cancelledAt = now;
    if (input.status === 'PAUSED') data.pausedAt = now;
    if (input.status === 'EXPIRED') data.renewsAt = null;

    const updated = await prisma.$transaction(async tx => {
      const item = await tx.subscription.update({ where: { id: existing.id }, data, include: { plan: true } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: input.status } } });
      return item;
    });
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

admin.get('/:id', async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true, customer: { include: { user: { select: { id: true, email: true, fullName: true, status: true } } } } } });
    if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    return res.json({ subscription: { ...subscription, plan: serializePlan(subscription.plan) } });
  } catch (error) { next(error); }
});

router.use('/customer', customer);
router.use('/admin', admin);

export default function subscriptionsRouter() { return router; }
