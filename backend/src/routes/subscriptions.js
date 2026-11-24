import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { hasValidClientSubscriptionSignature } from '../lib/paymentValidation.js';
import { addBillingPeriod, isSupportedBillingCycle } from '../lib/billingPeriod.js';
import { notifyUserSafely } from '../lib/notifications.js';
import { getBillingCycleForPlanType, getMaxAllowedRenewals, getPlanCancellationPolicy, getPlanRenewalMode, getPlanTypeLabel, getRazorpayPlanSchedule, getRazorpayTotalCount, hasConfiguredVisitEntitlements, isEligibleForUpiAutopay, isUpiAutopayPlanType } from '../lib/subscriptionPlanRules.js';

const router = Router();

const planInclude = {
  serviceLinks: {
    include: {
      service: { select: { id: true, name: true, description: true, category: true, durationLabel: true, status: true } }
    },
    orderBy: { service: { name: 'asc' } }
  }
};

const planCreateInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  planType: z.enum(['ONE_TIME_SERVICE', 'WEEKLY', 'ONE_MONTH', 'ONE_YEAR']),
  serviceFrequency: z.string().trim().min(2).max(160),
  includedServiceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(40),
  plantLimit: z.number().int().positive().nullable().optional(),
  includedVisitsPerPeriod: z.number().int().positive(),
  minimumVisitIntervalDays: z.number().int().positive().nullable().optional(),
  maxRenewalCycles: z.number().int().min(0).nullable().optional(),
  price: z.number().finite().positive().multipleOf(0.01),
  benefits: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  limitations: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict();

const planPatchInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  planType: z.enum(['ONE_TIME_SERVICE', 'WEEKLY', 'ONE_MONTH', 'ONE_YEAR', 'LEGACY_RECURRING']).optional(),
  billingCycle: z.string().trim().min(1).max(40).optional(),
  serviceFrequency: z.string().trim().min(2).max(160).optional(),
  includedServiceIds: z.array(z.string().trim().min(1).max(128)).max(40).optional(),
  plantLimit: z.number().int().positive().nullable().optional(),
  includedVisitsPerPeriod: z.number().int().positive().optional(),
  minimumVisitIntervalDays: z.number().int().positive().nullable().optional(),
  maxRenewalCycles: z.number().int().min(0).nullable().optional(),
  price: z.number().finite().nonnegative().multipleOf(0.01).optional(),
  benefits: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  limitations: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
}).strict();

function serializePlan(plan) {
  if (!plan) return plan;
  const { serviceLinks = [], ...record } = plan;
  const includedServices = serviceLinks.map(link => link.service).filter(Boolean);
  const planType = record.planType || 'LEGACY_RECURRING';
  return {
    ...record,
    price: Number(record.price),
    planType,
    planTypeLabel: getPlanTypeLabel(planType),
    billingCycle: record.billingCycle,
    includedServices,
    includedServiceIds: includedServices.map(service => service.id),
    renewalMode: getPlanRenewalMode(planType),
    autoRenew: isUpiAutopayPlanType(planType),
    upiAutopayEligible: isUpiAutopayPlanType(planType) && isEligibleForUpiAutopay(record.price),
    cancellationPolicy: getPlanCancellationPolicy(planType),
    providerPlanReady: Boolean(record.razorpayPlanId),
    totalProviderCycles: isUpiAutopayPlanType(planType) ? getRazorpayTotalCount(record.maxRenewalCycles) : null,
    bookingReady: hasConfiguredVisitEntitlements({ ...record, planType }) && includedServices.length > 0,
    autoPayCheckoutEnabled: env.PAYMENTS_ENABLED && env.RAZORPAY_SUBSCRIPTIONS_ENABLED && Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
  };
}

function normalizePlanData(input, existing = null) {
  const planType = input.planType ?? existing?.planType ?? 'LEGACY_RECURRING';
  const suppliedCycle = input.billingCycle ?? existing?.billingCycle;
  const billingCycle = getBillingCycleForPlanType(planType, suppliedCycle);
  if (!billingCycle || (planType === 'LEGACY_RECURRING' && !isSupportedBillingCycle(billingCycle))) {
    throw httpError(400, 'UNSUPPORTED_BILLING_CYCLE', 'Choose One-Time Service, Weekly, One-Month or One-Year. Existing custom cycles must use a supported billing duration.');
  }
  const price = input.price ?? (existing ? Number(existing.price) : undefined);
  const status = input.status ?? existing?.status ?? 'ACTIVE';
  const includedVisitsPerPeriod = input.includedVisitsPerPeriod ?? existing?.includedVisitsPerPeriod ?? null;
  const minimumVisitIntervalDays = Object.hasOwn(input, 'minimumVisitIntervalDays') ? input.minimumVisitIntervalDays : existing?.minimumVisitIntervalDays ?? null;
  const maxRenewalCycles = Object.hasOwn(input, 'maxRenewalCycles') ? input.maxRenewalCycles : existing?.maxRenewalCycles ?? null;
  const entitlementFields = ['includedVisitsPerPeriod', 'minimumVisitIntervalDays', 'maxRenewalCycles'];
  const entitlementConfigurationChanged = !existing
    || entitlementFields.some(field => Object.hasOwn(input, field))
    || (Object.hasOwn(input, 'planType') && input.planType !== existing.planType)
    || (Object.hasOwn(input, 'status') && input.status === 'ACTIVE' && existing.status !== 'ACTIVE');

  if (entitlementConfigurationChanged && planType === 'ONE_TIME_SERVICE') {
    if (includedVisitsPerPeriod !== 1 || minimumVisitIntervalDays != null || maxRenewalCycles != null) {
      throw httpError(400, 'INVALID_ONE_TIME_ENTITLEMENTS', 'One-Time Service plans include exactly one visit and do not have a recurring visit interval or renewal count.');
    }
  } else if (entitlementConfigurationChanged && isUpiAutopayPlanType(planType)) {
    if (!Number.isInteger(includedVisitsPerPeriod) || includedVisitsPerPeriod < 1) throw httpError(400, 'PLAN_VISIT_QUOTA_REQUIRED', 'Set the number of included visits in each billing period.');
    if (!Number.isInteger(minimumVisitIntervalDays) || minimumVisitIntervalDays < 1) throw httpError(400, 'PLAN_VISIT_FREQUENCY_REQUIRED', 'Set the minimum number of days between included visits.');
    if (!Number.isInteger(maxRenewalCycles) || maxRenewalCycles < 0 || maxRenewalCycles > getMaxAllowedRenewals(planType)) {
      throw httpError(400, 'INVALID_MAX_RENEWALS', `Maximum renewals after the first paid period must be between 0 and ${getMaxAllowedRenewals(planType)} for this plan type.`);
    }
  }

  if (status === 'ACTIVE' && isUpiAutopayPlanType(planType) && !isEligibleForUpiAutopay(price)) {
    throw httpError(400, 'UPI_AUTOPAY_AMOUNT_LIMIT', 'This plan is outside the currently configured UPI AutoPay per-charge amount limit. Save it as inactive until the merchant account limit is confirmed.');
  }
  const data = { ...input, planType, billingCycle, includedVisitsPerPeriod, minimumVisitIntervalDays, maxRenewalCycles };
  delete data.includedServiceIds;
  return data;
}

async function assertActiveServices(tx, ids) {
  const uniqueIds = [...new Set(ids || [])];
  if (uniqueIds.length !== (ids || []).length) throw httpError(400, 'DUPLICATE_PLAN_SERVICE', 'Choose each included service only once.');
  if (!uniqueIds.length) throw httpError(400, 'PLAN_SERVICES_REQUIRED', 'Select at least one included service.');
  const services = await tx.service.findMany({ where: { id: { in: uniqueIds }, status: 'ACTIVE' }, select: { id: true } });
  if (services.length !== uniqueIds.length) throw httpError(400, 'INVALID_PLAN_SERVICE', 'One or more selected services are unavailable. Refresh the service list and try again.');
  return uniqueIds;
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function requireAutoPayConfig() {
  if (!env.PAYMENTS_ENABLED) throw httpError(503, 'PAYMENTS_DISABLED', 'Payment checkout is temporarily unavailable.');
  if (!env.RAZORPAY_SUBSCRIPTIONS_ENABLED) throw httpError(503, 'UPI_AUTOPAY_NOT_ENABLED', 'UPI AutoPay checkout has not been enabled for this T-CARE deployment.');
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw httpError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Razorpay credentials are not configured on the server.');
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  requireAutoPayConfig();
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const error = httpError(response.status >= 500 ? 502 : 400, 'RAZORPAY_SUBSCRIPTION_API_ERROR', data?.error?.description || data?.error?.reason || 'Razorpay Subscriptions API request failed.');
      error.providerStatus = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw httpError(504, 'RAZORPAY_SUBSCRIPTION_TIMEOUT', 'Razorpay did not respond in time. The provider may have received the request; this attempt will not be repeated automatically.');
    throw error;
  } finally { clearTimeout(timeout); }
}

async function ensureRazorpayPlan(planId) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "SubscriptionPlan" WHERE "id" = ${planId} FOR UPDATE`;
    const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found.');
    if (plan.razorpayPlanId) return plan.razorpayPlanId;
    const schedule = getRazorpayPlanSchedule(plan.planType);
    if (!schedule) throw httpError(409, 'PLAN_NOT_RECURRING', 'This plan does not use recurring billing.');
    const created = await razorpayRequest('/plans', {
      method: 'POST',
      body: {
        ...schedule,
        item: { name: plan.name, amount: Math.round(Number(plan.price) * 100), currency: 'INR', description: plan.description || `${plan.name} — T-CARE ${plan.billingCycle} plan` },
        notes: { tcarePlanId: plan.id, tcarePlanType: plan.planType }
      }
    });
    if (!created?.id || created.period !== schedule.period || Number(created.interval) !== schedule.interval || Number(created.item?.amount) !== Math.round(Number(plan.price) * 100)) {
      throw httpError(502, 'RAZORPAY_PLAN_INVALID_RESPONSE', 'Razorpay returned a plan that does not match the Admin-configured price and billing cycle.');
    }
    await tx.subscriptionPlan.update({ where: { id: plan.id }, data: { razorpayPlanId: created.id } });
    return created.id;
  }, { timeout: 20_000, maxWait: 5_000 });
}

async function ensureRazorpaySubscription(subscriptionId, planId, customerProfileId) {
  const claimed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;
    const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
    if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (subscription.customerId !== customerProfileId || subscription.planId !== planId) throw httpError(403, 'FORBIDDEN', 'This subscription does not belong to the signed-in Customer.');
    if (subscription.providerSubscriptionId) return { existing: true, providerSubscriptionId: subscription.providerSubscriptionId };
    if (subscription.providerSubscriptionCreateState === 'IN_PROGRESS' || subscription.providerSubscriptionCreateState === 'UNKNOWN') {
      throw httpError(409, 'PROVIDER_SUBSCRIPTION_CREATE_UNCERTAIN', 'Razorpay may already have received the mandate request. Do not retry or create another mandate; contact T-CARE support to reconcile this setup.');
    }
    await tx.subscription.update({ where: { id: subscription.id }, data: { providerSubscriptionCreateState: 'IN_PROGRESS' } });
    return { existing: false, subscription };
  }, { timeout: 15_000, maxWait: 5_000 });
  if (claimed.existing) return claimed.providerSubscriptionId;

  const subscription = claimed.subscription;
  let remote;
  try {
    const razorpayPlanId = await ensureRazorpayPlan(subscription.planId);
    const totalCount = getRazorpayTotalCount(subscription.plan.maxRenewalCycles);
    if (!totalCount) throw httpError(409, 'PLAN_RENEWAL_COUNT_INVALID', 'The Admin-managed renewal count is missing or invalid.');
    remote = await razorpayRequest('/subscriptions', {
      method: 'POST',
      body: {
        plan_id: razorpayPlanId,
        total_count: totalCount,
        quantity: 1,
        customer_notify: false,
        notes: {
          tcareSubscriptionId: subscription.id,
          tcarePlanId: subscription.planId,
          tcareCustomerProfileId: customerProfileId
        }
      }
    });
  } catch (error) {
    const nextState = error.providerStatus && error.providerStatus < 500 ? 'FAILED' : 'UNKNOWN';
    await prisma.subscription.update({ where: { id: subscription.id }, data: { providerSubscriptionCreateState: nextState } }).catch(() => {});
    throw error;
  }
  if (!remote?.id || remote.plan_id !== razorpayPlanId || Number(remote.total_count) !== totalCount) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { providerSubscriptionCreateState: 'UNKNOWN' } }).catch(() => {});
    throw httpError(502, 'RAZORPAY_SUBSCRIPTION_INVALID_RESPONSE', 'Razorpay returned a subscription that does not match the selected plan and renewal count. Contact T-CARE support before retrying.');
  }
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { providerSubscriptionId: remote.id, providerSubscriptionStatus: remote.status || 'created', providerSubscriptionCreateState: 'CREATED' }
  });
  return remote.id;
}

function serializeSubscription(subscription) {
  if (!subscription) return subscription;
  const now = Date.now();
  const visitCredits = (subscription.visitCredits || []).map(credit => ({
    ...credit,
    visitsAvailable: Math.max(0, credit.visitsGranted - credit.visitsUsed),
    current: new Date(credit.periodStart).getTime() <= now && now < new Date(credit.periodEnd).getTime()
  }));
  return {
    ...subscription,
    plan: serializePlan(subscription.plan),
    visitCredits,
    visitsAvailable: visitCredits.filter(credit => credit.current).reduce((sum, credit) => sum + credit.visitsAvailable, 0),
    paidThroughAt: subscription.renewsAt
  };
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
      include: planInclude,
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
      include: { plan: { include: planInclude }, visitCredits: { orderBy: { periodStart: 'desc' } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ subscriptions: subscriptions.map(serializeSubscription) });
  } catch (error) { next(error); }
});

customer.get('/:id', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const subscription = await prisma.subscription.findFirst({
      where: { id: req.params.id, customerId: profile.id },
      include: { plan: { include: planInclude }, visitCredits: { orderBy: { periodStart: 'desc' } } }
    });
    if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    return res.json({ subscription: serializeSubscription(subscription) });
  } catch (error) { next(error); }
});

customer.post('/', async (req, res, next) => {
  try {
    const input = z.object({ planId: z.string().min(1) }).strict().parse(req.body);
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw httpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const plan = await prisma.subscriptionPlan.findFirst({ where: { id: input.planId, status: 'ACTIVE' }, include: planInclude });
    if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found or inactive.');
    if (plan.planType === 'ONE_TIME_SERVICE') throw httpError(409, 'ONE_TIME_PLAN_USES_BOOKING_FLOW', 'One-Time Service plans must be selected from the booking page.');
    if (isUpiAutopayPlanType(plan.planType)) {
      requireAutoPayConfig();
      if (!hasConfiguredVisitEntitlements(plan)) throw httpError(409, 'PLAN_ENTITLEMENTS_NOT_CONFIGURED', 'This plan is not ready for purchase. T-CARE Admin must configure included visits, visit frequency and maximum renewals first.');
      if (!isEligibleForUpiAutopay(plan.price)) throw httpError(409, 'UPI_AUTOPAY_AMOUNT_LIMIT', 'This plan is outside the currently configured UPI AutoPay amount limit.');
      const profile = await getCustomer(req);
      const existingOrCreated = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${profile.id} FOR UPDATE`;
        const existing = await tx.subscription.findFirst({
          where: { customerId: profile.id, status: { in: ['PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'] } },
          include: { plan: { include: planInclude }, visitCredits: { orderBy: { periodStart: 'desc' } } },
          orderBy: { createdAt: 'desc' }
        });
        if (existing && ['CANCELLED', 'EXPIRED'].includes(existing.status) && (!existing.renewsAt || existing.renewsAt <= new Date())) {
          // Expired paid access no longer blocks a replacement subscription.
        } else if (existing) {
          if (existing.planId !== plan.id) throw httpError(409, 'ACTIVE_SUBSCRIPTION_EXISTS', 'You already have a subscription with paid access or a pending mandate. Manage that plan before starting another.');
          if (existing.idempotencyKey !== idempotencyKey && !existing.providerSubscriptionId) throw httpError(409, 'SUBSCRIPTION_SETUP_IN_PROGRESS', 'A setup for this plan already exists. Refresh your subscription history before retrying.');
          return { subscription: existing, reused: true };
        }
        const created = await tx.subscription.create({
          data: { customerId: profile.id, planId: plan.id, status: 'PENDING', idempotencyKey, providerSubscriptionCreateState: 'NOT_STARTED' },
          include: { plan: { include: planInclude }, visitCredits: true }
        });
        await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'Subscription', entityId: created.id, metadata: { planId: plan.id, status: 'PENDING', renewalMode: 'UPI_AUTOPAY', maxRenewalCycles: plan.maxRenewalCycles } } });
        return { subscription: created, reused: false };
      }, { timeout: 15_000, maxWait: 5_000 });

      const providerSubscriptionId = await ensureRazorpaySubscription(existingOrCreated.subscription.id, plan.id, profile.id);
      const latest = await prisma.subscription.findUnique({
        where: { id: existingOrCreated.subscription.id },
        include: { plan: { include: planInclude }, visitCredits: { orderBy: { periodStart: 'desc' } } }
      });
      return res.status(existingOrCreated.reused ? 200 : 201).json({
        subscription: serializeSubscription(latest),
        reused: existingOrCreated.reused,
        checkout: { keyId: env.RAZORPAY_KEY_ID, subscriptionId: providerSubscriptionId },
        message: 'Approve the UPI AutoPay mandate in your UPI app. Visit credits are issued only after Razorpay confirms the first plan charge.'
      });
    }

    // Preserve the existing manual-payment request path for legacy plans. A free-text
    // legacy billing cycle is not evidence of customer consent to an AutoPay mandate.
    if (plan.planType !== 'LEGACY_RECURRING') throw httpError(409, 'PLAN_RENEWAL_MODE_INVALID', 'This plan does not support this subscription request flow.');
    const profile = await getCustomer(req);
    const subscription = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${profile.id} FOR UPDATE`;
      const existing = await tx.subscription.findFirst({ where: { customerId: profile.id, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } }, select: { id: true } });
      if (existing) throw httpError(409, 'ACTIVE_SUBSCRIPTION_EXISTS', 'The customer already has an active or pending subscription.');
      const created = await tx.subscription.create({ data: { customerId: profile.id, planId: plan.id, status: 'PENDING', idempotencyKey } , include: { plan: { include: planInclude } } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'Subscription', entityId: created.id, metadata: { planId: plan.id, status: 'PENDING', renewalMode: 'LEGACY_MANUAL_REVIEW' } } });
      return created;
    });
    await notifyUserSafely({ userId: req.auth.id, type: 'SUBSCRIPTION', channel: 'IN_APP', title: 'Subscription request received', body: `${plan.name} (${plan.billingCycle}) is pending payment verification.` });
    return res.status(201).json({ subscription: { ...subscription, plan: serializePlan(subscription.plan) }, paymentRequired: true, message: 'Legacy subscription request created in PENDING state. It does not create a UPI AutoPay mandate.' });
  } catch (error) { next(error); }
});

customer.post('/:id/verify', async (req, res, next) => {
  try {
    requireAutoPayConfig();
    const input = z.object({
      razorpayPaymentId: z.string().min(1).max(100),
      razorpaySubscriptionId: z.string().min(1).max(100),
      razorpaySignature: z.string().min(1).max(200)
    }).strict().parse(req.body);
    const profile = await getCustomer(req);
    const subscription = await prisma.subscription.findFirst({
      where: { id: req.params.id, customerId: profile.id },
      include: { plan: true, visitCredits: { orderBy: { periodStart: 'desc' } } }
    });
    if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (!subscription.providerSubscriptionId || subscription.providerSubscriptionId !== input.razorpaySubscriptionId) throw httpError(400, 'SUBSCRIPTION_ID_MISMATCH', 'The Checkout subscription does not match the server-created mandate.');
    if (!hasValidClientSubscriptionSignature(env.RAZORPAY_KEY_SECRET || '', input.razorpayPaymentId, subscription.providerSubscriptionId, input.razorpaySignature)) {
      throw httpError(400, 'INVALID_SUBSCRIPTION_SIGNATURE', 'Razorpay subscription authorisation signature verification failed.');
    }
    const [remoteSubscription, remotePayment] = await Promise.all([
      razorpayRequest(`/subscriptions/${encodeURIComponent(subscription.providerSubscriptionId)}`),
      razorpayRequest(`/payments/${encodeURIComponent(input.razorpayPaymentId)}`)
    ]);
    if (remoteSubscription?.id !== subscription.providerSubscriptionId || remoteSubscription?.plan_id !== subscription.plan.razorpayPlanId) {
      throw httpError(400, 'SUBSCRIPTION_PROVIDER_MISMATCH', 'The Razorpay mandate does not match the configured T-CARE plan.');
    }
    if (remotePayment?.status === 'captured' && remotePayment?.subscription_id && remotePayment.subscription_id !== subscription.providerSubscriptionId) {
      throw httpError(400, 'SUBSCRIPTION_PAYMENT_MISMATCH', 'The authorisation payment is not linked to this Razorpay subscription.');
    }
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { mandateAuthorizedAt: subscription.mandateAuthorizedAt || new Date(), providerSubscriptionStatus: remoteSubscription.status || subscription.providerSubscriptionStatus },
      include: { plan: { include: planInclude }, visitCredits: { orderBy: { periodStart: 'desc' } } }
    });
    await prisma.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Subscription', entityId: subscription.id, metadata: { eventType: 'client.subscription.signature_verified', providerPaymentId: input.razorpayPaymentId, providerSubscriptionId: subscription.providerSubscriptionId, providerStatus: remoteSubscription.status || null } } });
    return res.json({ subscription: serializeSubscription(updated), mandateVerified: true, benefitsActive: updated.visitCredits.some(credit => credit.periodStart <= new Date() && credit.periodEnd > new Date() && credit.visitsUsed < credit.visitsGranted), message: 'UPI AutoPay mandate signature verified. Booking credits appear after the first recurring plan payment is confirmed by Razorpay.' });
  } catch (error) { next(error); }
});

customer.post('/:id/cancel', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, customerId: profile.id }, include: { plan: true } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (isUpiAutopayPlanType(existing.plan.planType)) {
      throw httpError(409, 'UPI_AUTOPAY_MANAGED_IN_PAYMENT_APP', 'Manage this UPI AutoPay mandate in your UPI payment app. Once cancelled, future renewals stop and already-paid benefits remain available until the paid-through date.');
    }
    if (!['PENDING', 'ACTIVE', 'PAUSED'].includes(existing.status)) {
      throw httpError(409, 'SUBSCRIPTION_NOT_CANCELLABLE', 'This subscription cannot be cancelled in its current state.');
    }
    const updated = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${existing.id} FOR UPDATE`;
      const current = await tx.subscription.findUnique({ where: { id: existing.id }, select: { status: true } });
      if (!current || !['PENDING', 'ACTIVE', 'PAUSED'].includes(current.status)) {
        throw httpError(409, 'SUBSCRIPTION_NOT_CANCELLABLE', 'This subscription cannot be cancelled in its current state.');
      }
      const payment = await tx.payment.findFirst({
        where: { subscriptionId: existing.id, status: { in: ['PENDING', 'AUTHORIZED'] } },
        select: { id: true }
      });
      if (payment) throw httpError(409, 'PAYMENT_PENDING', 'A pending payment must be resolved before this subscription can be cancelled.');
      const item = await tx.subscription.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
        include: { plan: true }
      });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: current.status, toStatus: 'CANCELLED' } } });
      return item;
    });
    await notifyUserSafely({ userId: req.auth.id, type: 'SUBSCRIPTION', channel: 'IN_APP', title: 'Subscription cancelled', body: `${existing.plan.name} has been cancelled.` });
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

customer.post('/:id/pause', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, customerId: profile.id } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: existing.planId }, select: { planType: true } });
    if (isUpiAutopayPlanType(plan?.planType)) throw httpError(409, 'UPI_AUTOPAY_MANAGED_IN_PAYMENT_APP', 'Manage this UPI AutoPay mandate in your UPI payment app.');
    if (existing.status !== 'ACTIVE') throw httpError(409, 'SUBSCRIPTION_NOT_PAUSABLE', 'Only active subscriptions can be paused.');
    const updated = await prisma.$transaction(async tx => {
      const item = await tx.subscription.update({ where: { id: existing.id }, data: { status: 'PAUSED', pausedAt: new Date() }, include: { plan: true } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: 'PAUSED' } } });
      return item;
    });
    await notifyUserSafely({ userId: req.auth.id, type: 'SUBSCRIPTION', channel: 'IN_APP', title: 'Subscription paused', body: 'Your subscription has been paused.' });
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

customer.post('/:id/resume', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, customerId: profile.id } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: existing.planId }, select: { planType: true } });
    if (isUpiAutopayPlanType(plan?.planType)) throw httpError(409, 'UPI_AUTOPAY_MANAGED_IN_PAYMENT_APP', 'Resume a customer-paused UPI AutoPay mandate in the same UPI payment app. T-CARE cannot resume it on your behalf.');
    if (existing.status !== 'PAUSED') throw httpError(409, 'SUBSCRIPTION_NOT_RESUMABLE', 'Only paused subscriptions can be resumed.');
    const updated = await prisma.$transaction(async tx => {
      const item = await tx.subscription.update({ where: { id: existing.id }, data: { status: 'ACTIVE', pausedAt: null }, include: { plan: true } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: 'ACTIVE' } } });
      return item;
    });
    await notifyUserSafely({ userId: req.auth.id, type: 'SUBSCRIPTION', channel: 'IN_APP', title: 'Subscription resumed', body: 'Your subscription has been resumed.' });
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({ include: { ...planInclude, _count: { select: { subscriptions: true } } }, orderBy: { createdAt: 'desc' } });
    return res.json({ plans: plans.map(serializePlan) });
  } catch (error) { next(error); }
});

admin.post('/plans', async (req, res, next) => {
  try {
    const input = planCreateInput.parse(req.body);
    const data = normalizePlanData(input);
    const plan = await prisma.$transaction(async tx => {
      const serviceIds = await assertActiveServices(tx, input.includedServiceIds);
      const created = await tx.subscriptionPlan.create({ data });
      await tx.subscriptionPlanService.createMany({ data: serviceIds.map(serviceId => ({ planId: created.id, serviceId })) });
      await tx.auditLog.create({
        data: {
          actorUserId: req.auth.id,
          action: 'CREATE',
          entityType: 'SubscriptionPlan',
          entityId: created.id,
          metadata: { name: created.name, planType: created.planType, billingCycle: created.billingCycle, includedServiceIds: serviceIds }
        }
      });
      return tx.subscriptionPlan.findUnique({ where: { id: created.id }, include: { ...planInclude, _count: { select: { subscriptions: true } } } });
    });
    return res.status(201).json({ plan: serializePlan(plan) });
  } catch (error) { next(error); }
});

admin.patch('/plans/:id', async (req, res, next) => {
  try {
    const input = planPatchInput.parse(req.body);
    const plan = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "SubscriptionPlan" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.subscriptionPlan.findUnique({ where: { id: req.params.id }, include: planInclude });
      if (!existing) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found.');
      const subscriptionCount = await tx.subscription.count({ where: { planId: existing.id } });
      const hasLockedTerms = subscriptionCount > 0 || Boolean(existing.razorpayPlanId);
      const existingServiceIds = existing.serviceLinks.map(link => link.serviceId).sort();
      const incomingServiceIds = input.includedServiceIds ? [...input.includedServiceIds].sort() : null;
      const sameArray = (left, right) => JSON.stringify(left || []) === JSON.stringify(right || []);
      const lockedFieldsChanged = [
        Object.hasOwn(input, 'planType') && input.planType !== existing.planType,
        Object.hasOwn(input, 'billingCycle') && input.billingCycle !== existing.billingCycle,
        Object.hasOwn(input, 'serviceFrequency') && input.serviceFrequency !== existing.serviceFrequency,
        Object.hasOwn(input, 'plantLimit') && input.plantLimit !== existing.plantLimit,
        Object.hasOwn(input, 'includedVisitsPerPeriod') && input.includedVisitsPerPeriod !== existing.includedVisitsPerPeriod,
        Object.hasOwn(input, 'minimumVisitIntervalDays') && input.minimumVisitIntervalDays !== existing.minimumVisitIntervalDays,
        Object.hasOwn(input, 'maxRenewalCycles') && input.maxRenewalCycles !== existing.maxRenewalCycles,
        Object.hasOwn(input, 'price') && input.price !== Number(existing.price),
        incomingServiceIds && !sameArray(incomingServiceIds, existingServiceIds),
        Object.hasOwn(input, 'benefits') && !sameArray(input.benefits, existing.benefits),
        Object.hasOwn(input, 'limitations') && !sameArray(input.limitations, existing.limitations)
      ].some(Boolean);
      if (hasLockedTerms && lockedFieldsChanged) {
        throw httpError(409, 'PLAN_TERMS_LOCKED', 'This plan already has subscriptions or a Razorpay plan. Its price, cycle, visit quota, visit frequency, renewal count, included services and customer terms cannot be changed. Create a new plan for revised terms; you may still update its name, description or visibility.');
      }
      const data = normalizePlanData(input, existing);
      if (incomingServiceIds && !sameArray(incomingServiceIds, existingServiceIds)) {
        const serviceIds = await assertActiveServices(tx, input.includedServiceIds);
        await tx.subscriptionPlanService.deleteMany({ where: { planId: existing.id } });
        await tx.subscriptionPlanService.createMany({ data: serviceIds.map(serviceId => ({ planId: existing.id, serviceId })) });
      }
      const updated = await tx.subscriptionPlan.update({ where: { id: existing.id }, data });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'SubscriptionPlan', entityId: updated.id, metadata: { changed: Object.keys(input), planType: updated.planType, billingCycle: updated.billingCycle } } });
      return tx.subscriptionPlan.findUnique({ where: { id: updated.id }, include: { ...planInclude, _count: { select: { subscriptions: true } } } });
    });
    return res.json({ plan: serializePlan(plan) });
  } catch (error) { next(error); }
});

admin.delete('/plans/:id', async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "SubscriptionPlan" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.subscriptionPlan.findUnique({ where: { id: req.params.id } });
      if (!existing) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found.');
      const count = await tx.subscription.count({ where: { planId: existing.id } });
      if (count || existing.razorpayPlanId) {
        const plan = await tx.subscriptionPlan.update({ where: { id: existing.id }, data: { status: 'INACTIVE' }, include: planInclude });
        await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'SubscriptionPlan', entityId: plan.id, metadata: { fromStatus: existing.status, toStatus: 'INACTIVE', reason: count ? 'subscription_history' : 'provider_plan_exists' } } });
        return { plan: serializePlan(plan), deactivated: true };
      }
      await tx.subscriptionPlan.delete({ where: { id: existing.id } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'SubscriptionPlan', entityId: existing.id, metadata: {} } });
      return { deleted: true };
    });
    if (result.deleted) return res.status(204).send();
    return res.json(result);
  } catch (error) { next(error); }
});

admin.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING']).parse(req.query.status) : undefined;
    const subscriptions = await prisma.subscription.findMany({
      where: status ? { status } : undefined,
      include: { plan: { include: planInclude }, customer: { include: { user: { select: { id: true, email: true, fullName: true, status: true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ subscriptions: subscriptions.map(item => ({ ...item, plan: serializePlan(item.plan) })) });
  } catch (error) { next(error); }
});

admin.patch('/:id/status', async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING']) }).strict().parse(req.body);
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: { include: planInclude }, customer: { select: { userId: true } } } });
    if (!existing) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (isUpiAutopayPlanType(existing.plan.planType)) {
      throw httpError(409, 'UPI_AUTOPAY_WEBHOOK_MANAGED', 'UPI AutoPay subscription status is controlled by verified Razorpay subscription webhooks. Do not change it manually.');
    }
    if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const verifiedPayment = await prisma.payment.findFirst({
        where: { subscriptionId: existing.id, status: 'PAID', paidAt: { not: null } },
        select: { id: true }
      });
      if (!verifiedPayment) throw httpError(409, 'SUBSCRIPTION_PAYMENT_NOT_VERIFIED', 'This subscription cannot be activated until a verified PAID payment is recorded.');
    }
    const now = new Date();
    let data = { status: input.status };
    if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      data.startedAt = existing.startedAt ?? now;
      data.cancelledAt = null;
      data.pausedAt = null;
      const renewsAt = addBillingPeriod(data.startedAt, existing.plan.billingCycle);
      if (!renewsAt) throw httpError(409, 'UNSUPPORTED_BILLING_CYCLE', 'The plan has an unsupported billing duration and cannot be activated. Update the plan duration first.');
      data.renewsAt = renewsAt;
    }
    if (input.status === 'CANCELLED') data.cancelledAt = now;
    if (input.status === 'PAUSED') data.pausedAt = now;
    if (input.status === 'EXPIRED') data.renewsAt = null;

    const updated = await prisma.$transaction(async tx => {
      const item = await tx.subscription.update({ where: { id: existing.id }, data, include: { plan: true } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'Subscription', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: input.status } } });
      return item;
    });
    if (existing.status !== input.status) {
      await notifyUserSafely({
        userId: existing.customer.userId,
        type: 'SUBSCRIPTION',
        channel: 'IN_APP',
        title: 'Subscription status updated',
        body: `Your ${existing.plan.name} subscription is now ${input.status.toLowerCase()}.`
      });
    }
    return res.json({ subscription: { ...updated, plan: serializePlan(updated.plan) } });
  } catch (error) { next(error); }
});

admin.get('/:id', async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: { include: planInclude }, customer: { include: { user: { select: { id: true, email: true, fullName: true, status: true } } } } } });
    if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    return res.json({ subscription: { ...subscription, plan: serializePlan(subscription.plan) } });
  } catch (error) { next(error); }
});

router.use('/customer', customer);
router.use('/admin', admin);

export default function subscriptionsRouter() { return router; }
