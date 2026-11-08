import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notifyUserSafely } from '../lib/notifications.js';

const router = Router();
const provider = 'razorpay';

function fail(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function amountToPaise(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw fail(500, 'INVALID_PAYMENT_AMOUNT', 'Payment amount is invalid.');
  const paise = Math.round(value * 100);
  if (!Number.isSafeInteger(paise) || paise <= 0) throw fail(400, 'INVALID_PAYMENT_AMOUNT', 'Payment amount must be a positive INR amount.');
  return paise;
}

function timingSafeHexEqual(expectedHex, actualHex) {
  if (!/^[a-f0-9]+$/i.test(expectedHex) || !/^[a-f0-9]+$/i.test(actualHex) || expectedHex.length !== actualHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
}

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function requireRazorpayConfig({ webhook = false } = {}) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || (webhook && !env.RAZORPAY_WEBHOOK_SECRET)) {
    throw fail(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Payment provider is not configured on the server.');
  }
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  requireRazorpayConfig();
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const providerMessage = data?.error?.description || data?.error?.reason || 'Payment provider request failed.';
      throw fail(502, 'PAYMENT_PROVIDER_ERROR', providerMessage);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw fail(504, 'PAYMENT_PROVIDER_TIMEOUT', 'Payment provider timed out. The payment record was not marked as successful.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function serializePayment(payment) {
  if (!payment) return null;
  return {
    ...payment,
    amount: Number(payment.amount),
    refunds: payment.refunds?.map(refund => ({ ...refund, amount: Number(refund.amount) }))
  };
}

async function getCustomer(req) {
  const customer = await prisma.customerProfile.findUnique({ where: { userId: req.auth.id } });
  if (!customer) throw fail(404, 'CUSTOMER_PROFILE_NOT_FOUND', 'Customer profile not found.');
  return customer;
}

async function findOrCreatePayment({ req, target, amount, idempotencyKey }) {
  const customer = await getCustomer(req);
  const existingByKey = await prisma.payment.findUnique({ where: { idempotencyKey }, include: { refunds: true } });
  if (existingByKey) {
    const ownsTarget = target.type === 'BOOKING'
      ? existingByKey.bookingId === target.id
      : existingByKey.subscriptionId === target.id;
    if (!ownsTarget) throw fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for another payment.');
    return { payment: existingByKey, customer, reused: true };
  }

  const where = target.type === 'BOOKING' ? { bookingId: target.id } : { subscriptionId: target.id };
  const existing = await prisma.payment.findFirst({ where, include: { refunds: true } });
  if (existing) {
    if (existing.status === 'PAID' || existing.status === 'AUTHORIZED') {
      throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This payment has already been processed.');
    }
    if (existing.status === 'PENDING') return { payment: existing, customer, reused: true };
    if (existing.status === 'FAILED' || existing.status === 'CANCELLED') {
      const reset = await prisma.payment.update({
        where: { id: existing.id },
        data: { status: 'PENDING', idempotencyKey, providerOrderId: null, providerPaymentId: null, paidAt: null }
      });
      return { payment: reset, customer, reused: true };
    }
  }

  const payment = await prisma.payment.create({
    data: {
      ...(target.type === 'BOOKING' ? { bookingId: target.id } : { subscriptionId: target.id }),
      amount,
      currency: 'INR',
      method: 'ONLINE',
      status: 'PENDING',
      provider,
      idempotencyKey
    }
  });
  return { payment, customer, reused: false };
}

async function createProviderOrder(payment, receipt) {
  if (payment.providerOrderId) return payment.providerOrderId;
  const order = await razorpayRequest('/orders', {
    method: 'POST',
    body: {
      amount: amountToPaise(payment.amount),
      currency: payment.currency,
      receipt,
      notes: { tcarePaymentId: payment.id }
    }
  });
  if (!order?.id || Number(order.amount) !== amountToPaise(payment.amount) || order.currency !== payment.currency) {
    throw fail(502, 'PAYMENT_PROVIDER_INVALID_ORDER', 'Payment provider returned an invalid order.');
  }
  await prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId: order.id, status: 'PENDING' } });
  return order.id;
}

async function markPaymentFromProvider({ providerOrderId, providerPaymentId, providerStatus, rawEvent, eventType }) {
  const payment = await prisma.payment.findFirst({ where: { providerOrderId }, include: { booking: true, subscription: { include: { plan: true } } } });
  if (!payment) return { ignored: true, reason: 'PAYMENT_NOT_FOUND' };

  const eventId = rawEvent?.id ? String(rawEvent.id) : `${eventType}:${providerPaymentId || providerOrderId}`;
  const existingEvent = await prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } });
  if (existingEvent) return { ignored: true, reason: 'DUPLICATE_EVENT' };

  const normalizedStatus = providerStatus === 'captured' || eventType === 'order.paid' ? 'PAID'
    : providerStatus === 'authorized' ? 'AUTHORIZED'
    : providerStatus === 'failed' ? 'FAILED'
    : null;
  if (!normalizedStatus) {
    await prisma.paymentEvent.create({ data: { paymentId: payment.id, provider, providerEventId: eventId, eventType, payload: rawEvent ?? {} } });
    return { ignored: true, reason: 'UNHANDLED_PROVIDER_STATUS' };
  }

  const result = await prisma.$transaction(async tx => {
    await tx.paymentEvent.create({ data: { paymentId: payment.id, provider, providerEventId: eventId, eventType, payload: rawEvent ?? {}, processedAt: new Date() } });

    const current = await tx.payment.findUnique({ where: { id: payment.id }, include: { subscription: { include: { plan: true } } } });
    if (!current) return null;
    if (current.status === 'PAID' && normalizedStatus !== 'PAID') return current;

    const data = {
      status: normalizedStatus,
      ...(providerPaymentId ? { providerPaymentId } : {}),
      ...(normalizedStatus === 'PAID' ? { paidAt: current.paidAt ?? new Date() } : {})
    };
    const updated = await tx.payment.update({ where: { id: current.id }, data });

    if (normalizedStatus === 'PAID' && current.subscriptionId && current.subscription?.status === 'PENDING') {
      const start = new Date();
      const renews = new Date(start);
      const cycle = current.subscription.plan.billingCycle.toLowerCase();
      if (cycle.includes('year')) renews.setUTCFullYear(renews.getUTCFullYear() + 1);
      else if (cycle.includes('month')) renews.setUTCMonth(renews.getUTCMonth() + 1);
      else if (cycle.includes('week')) renews.setUTCDate(renews.getUTCDate() + 7);
      else throw fail(409, 'UNSUPPORTED_BILLING_CYCLE', 'Subscription billing cycle is not supported.');
      await tx.subscription.update({ where: { id: current.subscriptionId }, data: { status: 'ACTIVE', startedAt: start, renewsAt: renews, cancelledAt: null, pausedAt: null } });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: 'PAYMENT_EVENT',
        entityType: 'Payment',
        entityId: current.id,
        metadata: { eventType, providerStatus, normalizedStatus, providerPaymentId: providerPaymentId ?? null }
      }
    });
    return updated;
  });
  return { payment: result };
}

async function verifyClientPayment(req, res, next) {
  try {
    const input = z.object({
      razorpayOrderId: z.string().min(1).max(100),
      razorpayPaymentId: z.string().min(1).max(100),
      razorpaySignature: z.string().min(1).max(200)
    }).strict().parse(req.body);

    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { booking: true, subscription: { include: { plan: true } } } });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    if (payment.providerOrderId !== input.razorpayOrderId) throw fail(400, 'PAYMENT_ORDER_MISMATCH', 'Payment does not belong to the expected order.');

    const customer = await getCustomer(req);
    const owns = payment.booking?.customerId === customer.id || payment.subscription?.customerId === customer.id;
    if (!owns) throw fail(403, 'FORBIDDEN', 'You cannot verify this payment.');
    if (payment.status === 'PAID') return res.json({ payment: serializePayment(payment), verified: true });

    const expected = hmacHex(env.RAZORPAY_KEY_SECRET ?? '', `${input.razorpayOrderId}|${input.razorpayPaymentId}`);
    if (!timingSafeHexEqual(expected, input.razorpaySignature)) throw fail(400, 'INVALID_PAYMENT_SIGNATURE', 'Payment signature verification failed.');

    const remote = await razorpayRequest(`/payments/${encodeURIComponent(input.razorpayPaymentId)}`);
    if (remote?.order_id !== payment.providerOrderId) throw fail(400, 'PAYMENT_ORDER_MISMATCH', 'Payment does not belong to the expected order.');
    if (Number(remote.amount) !== amountToPaise(payment.amount) || remote.currency !== payment.currency) throw fail(400, 'PAYMENT_AMOUNT_MISMATCH', 'Paid amount or currency does not match the server payment record.');

    const result = await markPaymentFromProvider({ providerOrderId: payment.providerOrderId, providerPaymentId: input.razorpayPaymentId, providerStatus: remote.status, rawEvent: { source: 'client_verification', payment: remote }, eventType: `client.payment.${remote.status}` });
    return res.json({ payment: serializePayment(result.payment), verified: result.payment?.status === 'PAID' });
  } catch (error) { next(error); }
}

async function markRefundFromProvider({ payment, refundEntity, rawEvent, eventType }) {
  const eventId = rawEvent?.id ? String(rawEvent.id) : `${eventType}:${refundEntity.id}`;
  const existingEvent = await prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } });
  if (existingEvent) return;

  await prisma.$transaction(async tx => {
    await tx.paymentEvent.create({ data: { paymentId: payment.id, provider, providerEventId: eventId, eventType, payload: rawEvent ?? {}, processedAt: new Date() } });
    const refund = await tx.refund.findFirst({ where: { paymentId: payment.id, OR: [{ providerRefundId: refundEntity.id }, { id: refundEntity.notes?.tcareRefundId ?? '__none__' }] } });
    if (!refund) return;

    const nextRefundStatus = refundEntity.status === 'processed' ? (Number(refund.amount) >= Number(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED')
      : refundEntity.status === 'failed' ? 'FAILED' : 'PENDING';
    const saved = await tx.refund.update({ where: { id: refund.id }, data: { status: nextRefundStatus, providerRefundId: refund.providerRefundId ?? refundEntity.id, ...(nextRefundStatus !== 'PENDING' ? { processedAt: new Date() } : {}) } });
    if (nextRefundStatus === 'FAILED') {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } });
    } else if (nextRefundStatus === 'REFUNDED' || nextRefundStatus === 'PARTIALLY_REFUNDED') {
      const successfulRefunds = await tx.refund.findMany({ where: { paymentId: payment.id, status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } } });
      const totalRefunded = successfulRefunds.reduce((sum, item) => sum + Number(item.amount), 0);
      await tx.payment.update({ where: { id: payment.id }, data: { status: totalRefunded >= Number(payment.amount) - 0.0001 ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    }
    await tx.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Refund', entityId: saved.id, metadata: { eventType, providerRefundId: refundEntity.id, status: nextRefundStatus } } });
  });
}

// Webhook must be mounted before express.json() in app.js so req.body remains the raw bytes.
export async function razorpayWebhook(req, res) {
  try {
    requireRazorpayConfig({ webhook: true });
    const signature = req.get('x-razorpay-signature');
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!signature || !raw.length) return res.status(400).json({ error: 'INVALID_WEBHOOK', message: 'Webhook signature and raw body are required.' });

    const expected = hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
    if (!timingSafeHexEqual(expected, signature)) return res.status(400).json({ error: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature verification failed.' });

    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'INVALID_WEBHOOK_BODY', message: 'Webhook body is not valid JSON.' }); }

    const eventType = String(payload.event || '');
    const refundEntity = payload.payload?.refund?.entity;
    if (eventType.startsWith('refund.') && refundEntity?.payment_id && refundEntity?.id) {
      const payment = await prisma.payment.findFirst({ where: { providerPaymentId: refundEntity.payment_id } });
      if (payment) await markRefundFromProvider({ payment, refundEntity, rawEvent: payload, eventType });
      return res.status(200).json({ received: true });
    }
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;
    const providerOrderId = paymentEntity?.order_id || orderEntity?.id;
    const providerPaymentId = paymentEntity?.id;
    if (!providerOrderId) return res.status(200).json({ received: true, ignored: true });

    const localPayment = await prisma.payment.findUnique({ where: { providerOrderId }, select: { id: true, amount: true, currency: true } });
    if (!localPayment) return res.status(200).json({ received: true, ignored: true });
    const remoteAmount = paymentEntity?.amount ?? orderEntity?.amount;
    const remoteCurrency = paymentEntity?.currency ?? orderEntity?.currency;
    if (remoteAmount != null && Number(remoteAmount) !== amountToPaise(localPayment.amount)) {
      await prisma.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Payment', entityId: localPayment.id, metadata: { eventType, rejected: 'AMOUNT_MISMATCH' } } });
      return res.status(400).json({ error: 'PAYMENT_AMOUNT_MISMATCH', message: 'Webhook amount does not match the server payment record.' });
    }
    if (remoteCurrency && remoteCurrency !== localPayment.currency) return res.status(400).json({ error: 'PAYMENT_CURRENCY_MISMATCH', message: 'Webhook currency does not match the server payment record.' });

    await markPaymentFromProvider({ providerOrderId, providerPaymentId, providerStatus: paymentEntity?.status, rawEvent: payload, eventType });
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).json({ error: error.code || 'WEBHOOK_PROCESSING_ERROR', message: error.message || 'Webhook processing failed.' });
  }
}

const customer = Router();
customer.use(requireAuth, requireRole('CUSTOMER'));

customer.post('/booking/:bookingId/order', async (req, res, next) => {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const customerProfile = await getCustomer(req);
    const booking = await prisma.booking.findFirst({ where: { id: req.params.bookingId, customerId: customerProfile.id }, select: { id: true, reference: true, total: true, status: true } });
    if (!booking) throw fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    if (booking.status === 'CANCELLED') throw fail(409, 'BOOKING_CANCELLED', 'Cancelled bookings cannot be paid.');

    const { payment } = await findOrCreatePayment({ req, target: { type: 'BOOKING', id: booking.id }, amount: booking.total, idempotencyKey });
    const orderId = await createProviderOrder(payment, `TC-${booking.reference}-${payment.id}`);
    const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { refunds: true } });
    return res.status(200).json({ payment: serializePayment(latest), checkout: { keyId: env.RAZORPAY_KEY_ID, orderId, amount: amountToPaise(latest.amount), currency: latest.currency } });
  } catch (error) { next(error); }
});

customer.post('/subscription/:subscriptionId/order', async (req, res, next) => {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const customerProfile = await getCustomer(req);
    const subscription = await prisma.subscription.findFirst({ where: { id: req.params.subscriptionId, customerId: customerProfile.id }, include: { plan: true } });
    if (!subscription) throw fail(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (subscription.status !== 'PENDING') throw fail(409, 'SUBSCRIPTION_NOT_PAYABLE', 'Only pending subscriptions can be paid.');

    const { payment } = await findOrCreatePayment({ req, target: { type: 'SUBSCRIPTION', id: subscription.id }, amount: subscription.plan.price, idempotencyKey });
    const orderId = await createProviderOrder(payment, `TC-SUB-${subscription.id}-${payment.id}`);
    const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { refunds: true } });
    return res.status(200).json({ payment: serializePayment(latest), checkout: { keyId: env.RAZORPAY_KEY_ID, orderId, amount: amountToPaise(latest.amount), currency: latest.currency } });
  } catch (error) { next(error); }
});

customer.post('/:id/verify', verifyClientPayment);

customer.get('/', async (req, res, next) => {
  try {
    const customerProfile = await getCustomer(req);
    const payments = await prisma.payment.findMany({ where: { OR: [{ booking: { customerId: customerProfile.id } }, { subscription: { customerId: customerProfile.id } }] }, include: { refunds: true }, orderBy: { createdAt: 'desc' } });
    return res.json({ payments: payments.map(serializePayment) });
  } catch (error) { next(error); }
});

customer.get('/:id', async (req, res, next) => {
  try {
    const customerProfile = await getCustomer(req);
    const payment = await prisma.payment.findFirst({ where: { id: req.params.id, OR: [{ booking: { customerId: customerProfile.id } }, { subscription: { customerId: customerProfile.id } }] }, include: { refunds: true } });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    return res.json({ payment: serializePayment(payment) });
  } catch (error) { next(error); }
});

const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.post('/:id/refund', async (req, res, next) => {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const input = z.object({ amount: z.number().positive().finite().optional(), reason: z.string().trim().max(1000).optional() }).strict().parse(req.body ?? {});
    const existingRefund = await prisma.refund.findUnique({ where: { idempotencyKey }, include: { payment: true } });
    if (existingRefund) {
      if (existingRefund.paymentId !== req.params.id) throw fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for another refund.');
      return res.status(200).json({ refund: { ...existingRefund, amount: Number(existingRefund.amount) }, paymentId: existingRefund.paymentId, reused: true });
    }
    // Reserve the refund amount atomically before contacting the provider. This prevents
    // two concurrent refund requests with different idempotency keys from both consuming
    // the same refundable balance.
    const reservation = await prisma.$transaction(async tx => {
      const payment = await tx.payment.findUnique({ where: { id: req.params.id }, include: { refunds: true } });
      if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
      if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') throw fail(409, 'PAYMENT_NOT_REFUNDABLE', 'Only captured payments can be refunded.');
      if (!payment.providerPaymentId) throw fail(409, 'PROVIDER_PAYMENT_ID_MISSING', 'Provider payment ID is missing.');

      // Lock the payment row for this reservation transaction. PENDING refunds are
      // deliberately counted as reserved funds until the provider confirms success/failure.
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
      const reserved = payment.refunds
        .filter(r => ['PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(r.status))
        .reduce((sum, r) => sum + Number(r.amount), 0);
      const remaining = Number(payment.amount) - reserved;
      const refundAmount = input.amount ?? remaining;
      if (refundAmount > remaining + 0.0001) throw fail(400, 'REFUND_EXCEEDS_REMAINING', 'Refund amount exceeds the remaining refundable amount.');
      if (refundAmount <= 0) throw fail(400, 'NO_REFUNDABLE_BALANCE', 'There is no remaining refundable balance.');

      const refund = await tx.refund.create({ data: { paymentId: payment.id, amount: refundAmount, reason: input.reason, status: 'PENDING', idempotencyKey } });
      return { payment, refund, remaining };
    }, { isolationLevel: 'Serializable' });

    const payment = reservation.payment;
    const refund = reservation.refund;
    const refundAmount = Number(refund.amount);
    const remaining = reservation.remaining;
    try {
      const remote = await razorpayRequest(`/payments/${encodeURIComponent(payment.providerPaymentId)}/refund`, { method: 'POST', body: { amount: amountToPaise(refundAmount), notes: { tcareRefundId: refund.id } } });
      const providerRefundId = remote?.id;
      if (!providerRefundId) throw fail(502, 'INVALID_REFUND_RESPONSE', 'Payment provider returned an invalid refund response.');
      const fullyRefunded = refundAmount >= remaining - 0.0001;
      const processed = remote.status === 'processed';
      const refundStatus = processed ? (fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : 'PENDING';
      const paymentStatus = processed ? (fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : payment.status;
      const updated = await prisma.$transaction(async tx => {
        const savedRefund = await tx.refund.update({ where: { id: refund.id }, data: { status: refundStatus, providerRefundId, ...(processed ? { processedAt: new Date() } : {}) } });
        if (processed) await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } });
        await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'PAYMENT_EVENT', entityType: 'Refund', entityId: refund.id, metadata: { paymentId: payment.id, amount: refundAmount, providerRefundId, status: paymentStatus } } });
        return savedRefund;
      });
      return res.status(201).json({ refund: { ...updated, amount: Number(updated.amount) }, paymentId: payment.id });
    } catch (error) {
      if (error?.code === 'PAYMENT_PROVIDER_ERROR') {
        await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } }).catch(() => {});
      }
      // Timeouts/network failures deliberately remain PENDING because the provider
      // may have accepted the refund even though our server did not receive the response.
      throw error;
    }
  } catch (error) { next(error); }
});

router.use('/customer', customer);
router.use('/admin', admin);

export default function paymentsRouter() { return router; }
