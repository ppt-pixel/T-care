import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notifyUserSafely } from '../lib/notifications.js';
import { addBillingPeriod } from '../lib/billingPeriod.js';
import { serializeCustomerPayment } from '../lib/paymentView.js';
import { assertPaymentsEnabled, isFinalPaymentStatus } from '../lib/paymentPolicy.js';
import { ensureAndDeliverPaymentReceipt, ensurePaymentReceipt, deliverPaymentReceipt } from '../lib/paymentReceipts.js';
import {
  hasValidClientPaymentSignature,
  hasValidWebhookSignature,
  paymentBelongsToCustomer,
  providerAmountMatches,
  providerCurrencyMatches
} from '../lib/paymentValidation.js';
import { runWebhookTransaction } from '../lib/paymentWebhookTransaction.js';
import { selectReconciliationPayment } from '../lib/paymentReconciliation.js';
import {
  closeRazorpayQr,
  createRazorpayQr,
  fetchRazorpayQr,
  fetchRazorpayQrPayments,
  razorpayQrRequest
} from '../lib/razorpayQrApi.js';
import { decimalToPaise, qrIsExpired, selectCapturedQrPayment, toQrSessionView } from '../lib/razorpayQrRules.js';
import { isUpiAutopayPlanType } from '../lib/subscriptionPlanRules.js';

const router = Router();
const provider = 'razorpay';

function fail(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function amountToPaise(amount) {
  try { return decimalToPaise(amount); }
  catch { throw fail(400, 'INVALID_PAYMENT_AMOUNT', 'Payment amount must be a positive INR amount with at most two decimal places.'); }
}

function requireRazorpayConfig({ webhook = false } = {}) {
  assertPaymentsEnabled(env.PAYMENTS_ENABLED);
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || (webhook && !env.RAZORPAY_WEBHOOK_SECRET)) {
    throw fail(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Payment provider is not configured on the server.');
  }
}

function requireRazorpayQrEnabled() {
  requireRazorpayConfig();
  if (env.RAZORPAY_QR_ENABLED !== true) throw fail(503, 'QR_PAYMENTS_DISABLED', 'UPI QR payments are not enabled on this deployment.');
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

async function getCustomer(req) {
  const customer = await prisma.customerProfile.findUnique({ where: { userId: req.auth.id } });
  if (!customer) throw fail(404, 'CUSTOMER_PROFILE_NOT_FOUND', 'Customer profile not found.');
  return customer;
}

async function findOrCreatePayment({ req, target, amount, idempotencyKey }) {
  const customer = await getCustomer(req);
  const createOrReuse = () => prisma.$transaction(async tx => {
    if (target.type === 'BOOKING') {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${target.id} FOR UPDATE`;
      const booking = await tx.booking.findUnique({ where: { id: target.id }, select: { status: true } });
      if (!booking || booking.status === 'CANCELLED') throw fail(409, 'BOOKING_CANCELLED', 'Cancelled bookings cannot be paid.');
    } else {
      await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${target.id} FOR UPDATE`;
      const subscription = await tx.subscription.findUnique({ where: { id: target.id }, select: { status: true } });
      if (!subscription || subscription.status !== 'PENDING') throw fail(409, 'SUBSCRIPTION_NOT_PAYABLE', 'Only pending subscriptions can be paid.');
    }

    const existingByKey = await tx.payment.findUnique({ where: { idempotencyKey }, include: { refunds: true } });
    if (existingByKey) {
      const ownsTarget = target.type === 'BOOKING'
        ? existingByKey.bookingId === target.id
        : existingByKey.subscriptionId === target.id;
      if (!ownsTarget) throw fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for another payment.');
      return { payment: existingByKey, reused: true };
    }

    const where = target.type === 'BOOKING' ? { bookingId: target.id } : { subscriptionId: target.id };
    const existing = await tx.payment.findFirst({ where, include: { refunds: true } });
    if (existing) {
      if (existing.status === 'PAID' || existing.status === 'AUTHORIZED') {
        throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This payment has already been processed.');
      }
      if (existing.status === 'PENDING') return { payment: existing, reused: true };
      if (existing.status === 'FAILED' || existing.status === 'CANCELLED') {
        const reset = await tx.payment.update({
          where: { id: existing.id },
          data: { status: 'PENDING', idempotencyKey, providerOrderId: null, providerPaymentId: null, paidAt: null }
        });
        return { payment: reset, reused: true };
      }
    }

    const payment = await tx.payment.create({
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
    return { payment, reused: false };
  });

  try {
    return { ...(await createOrReuse()), customer };
  } catch (error) {
    if (error?.code === 'P2002' && target.type === 'SUBSCRIPTION') {
      const payment = await prisma.payment.findFirst({ where: { subscriptionId: target.id }, include: { refunds: true } });
      if (payment?.status === 'PENDING') return { payment, customer, reused: true };
    }
    throw error;
  }
}

function latestQrSession(payment) {
  return payment?.qrSessions?.[0] ?? null;
}

async function fetchCapturedQrPayment(session, payment, expectedProviderPaymentId = null) {
  const qr = await fetchRazorpayQr(session.providerQrCodeId);
  const expectedAmount = amountToPaise(payment.amount);
  if (qr?.id !== session.providerQrCodeId || qr?.type !== 'upi_qr' || qr?.usage !== 'single_use'
    || qr?.fixed_amount !== true || Number(qr?.payment_amount) !== expectedAmount
    || qr?.notes?.tcarePaymentId !== payment.id || !['active', 'closed'].includes(qr?.status)) {
    throw fail(502, 'RAZORPAY_QR_MISMATCH', 'Razorpay QR details do not match this T-CARE payment.');
  }

  const listed = await fetchRazorpayQrPayments(session.providerQrCodeId);
  const listedPayment = selectCapturedQrPayment(listed, {
    amountPaise: expectedAmount,
    currency: payment.currency,
    paymentId: expectedProviderPaymentId
  });
  if (!listedPayment) return { qr, payment: null };

  const remotePayment = await razorpayQrRequest(`/payments/${encodeURIComponent(listedPayment.id)}`);
  if (remotePayment?.id !== listedPayment.id || remotePayment?.status !== 'captured'
    || remotePayment?.captured !== true || remotePayment?.method !== 'upi'
    || Number(remotePayment?.amount) !== expectedAmount || remotePayment?.currency !== payment.currency) {
    throw fail(502, 'RAZORPAY_QR_PAYMENT_MISMATCH', 'The QR payment could not be independently verified with Razorpay.');
  }
  return { qr, payment: remotePayment };
}

export async function reconcileQrSession(paymentId, { providerPaymentId = null, webhookEventId = null } = {}) {
  requireRazorpayConfig();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });
  if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
  const session = latestQrSession(payment);
  if (!session) return { payment, qrSession: null, verified: payment.status === 'PAID' };

  const inspected = await fetchCapturedQrPayment(session, payment, providerPaymentId);
  if (inspected.payment) {
    const result = await markPaymentFromProvider({
      paymentId: payment.id,
      qrSessionId: session.id,
      providerPaymentId: inspected.payment.id,
      providerStatus: inspected.payment.status,
      rawEvent: { id: webhookEventId || `qr-reconcile:${session.providerQrCodeId}:${inspected.payment.id}`, source: 'server_qr_reconciliation', payment: inspected.payment, qrCode: inspected.qr },
      eventType: 'qr_code.credited'
    });
    const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    return { payment: latest, qrSession: latestQrSession(latest), verified: latest?.status === 'PAID', duplicate: result?.ignored === true };
  }

  const expired = qrIsExpired(inspected.qr) || session.expiresAt.getTime() <= Date.now();
  if (expired && inspected.qr.status !== 'closed') {
    const closed = await closeRazorpayQr(session.providerQrCodeId);
    if (closed?.status !== 'closed') throw fail(502, 'RAZORPAY_QR_CLOSE_UNCONFIRMED', 'Razorpay has not confirmed that the expired QR code is closed.');
    const afterClose = await fetchCapturedQrPayment(session, payment, providerPaymentId);
    if (afterClose.payment) {
      const result = await markPaymentFromProvider({
        paymentId: payment.id,
        qrSessionId: session.id,
        providerPaymentId: afterClose.payment.id,
        providerStatus: afterClose.payment.status,
        rawEvent: { id: webhookEventId || `qr-reconcile:${session.providerQrCodeId}:${afterClose.payment.id}`, source: 'server_qr_reconciliation_after_close', payment: afterClose.payment, qrCode: afterClose.qr },
        eventType: 'qr_code.credited'
      });
      const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      return { payment: latest, qrSession: latestQrSession(latest), verified: latest?.status === 'PAID', duplicate: result?.ignored === true };
    }
  }

  let savedSession = session;
  if (expired || inspected.qr.status === 'closed') {
    savedSession = await prisma.paymentQrSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
  }
  const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  return { payment: latest, qrSession: savedSession, verified: latest?.status === 'PAID' };
}

export async function createQrSessionForPayment({ paymentId, purpose = 'booking', expiresAt }) {
  requireRazorpayQrEnabled();
  let payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });
  if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
  if (payment.status === 'PAID' || payment.status === 'AUTHORIZED' || payment.status === 'PARTIALLY_REFUNDED' || payment.status === 'REFUNDED') {
    throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This payment has already been processed.');
  }
  if (payment.providerOrderId) throw fail(409, 'PAYMENT_METHOD_ALREADY_SELECTED', 'Razorpay Checkout has already been started for this payment. Close or complete that checkout before choosing QR.');

  let latestSession = latestQrSession(payment);
  if (latestSession?.status === 'ACTIVE') {
    if (latestSession.expiresAt.getTime() > Date.now()) return latestSession;
    await reconcileQrSession(payment.id);
    payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    latestSession = latestQrSession(payment);
    if (latestSession?.status === 'ACTIVE') throw fail(409, 'QR_PAYMENT_STILL_PENDING', 'The previous QR payment is still active. Check its status before generating another QR.');
    if (payment.status === 'PAID') throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This payment has already been confirmed.');
  }

  const now = new Date();
  const desiredExpiry = expiresAt ? new Date(expiresAt) : new Date(now.getTime() + 20 * 60_000);
  const maximumExpiry = new Date(now.getTime() + 2 * 60 * 60_000);
  const closeBy = desiredExpiry < maximumExpiry ? desiredExpiry : maximumExpiry;
  if (!Number.isFinite(closeBy.getTime()) || closeBy.getTime() - now.getTime() < 2 * 60_000) {
    throw fail(409, 'QR_PAYMENT_WINDOW_TOO_SHORT', 'There is not enough time left to start a new QR payment. Refresh the order or booking and try again.');
  }

  let createdProviderQr = null;
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
      const current = await tx.payment.findUnique({ where: { id: paymentId }, include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      if (!current) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
      if (current.status === 'PAID' || current.status === 'AUTHORIZED' || current.status === 'PARTIALLY_REFUNDED' || current.status === 'REFUNDED') throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This payment has already been processed.');
      if (current.providerOrderId) throw fail(409, 'PAYMENT_METHOD_ALREADY_SELECTED', 'Razorpay Checkout has already been started for this payment.');
      const activeSession = latestQrSession(current);
      if (activeSession?.status === 'ACTIVE') {
        if (activeSession.expiresAt.getTime() > Date.now()) return activeSession;
        throw fail(409, 'QR_PAYMENT_RECONCILIATION_REQUIRED', 'Check the previous QR payment status before generating another QR.');
      }

      createdProviderQr = await createRazorpayQr({ paymentId: current.id, amount: current.amount, purpose, expiresAt: closeBy });
      return tx.paymentQrSession.create({
        data: {
          paymentId: current.id,
          providerQrCodeId: createdProviderQr.providerQrCodeId,
          imageUrl: createdProviderQr.imageUrl,
          shortUrl: createdProviderQr.shortUrl,
          expiresAt: createdProviderQr.expiresAt,
          status: 'ACTIVE'
        }
      });
    }, { isolationLevel: 'Serializable', timeout: 20000 });
  } catch (error) {
    if (createdProviderQr?.providerQrCodeId) {
      const persisted = await prisma.paymentQrSession.findUnique({ where: { providerQrCodeId: createdProviderQr.providerQrCodeId } }).catch(() => null);
      if (!persisted) await closeRazorpayQr(createdProviderQr.providerQrCodeId).catch(() => {});
    }
    throw error;
  }
}

export async function cancelQrSession(paymentId, { cancelPayment = false } = {}) {
  requireRazorpayConfig();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
  const session = latestQrSession(payment);
  if (!session || session.status !== 'ACTIVE') return { payment, qrSession: session };

  const inspected = await fetchCapturedQrPayment(session, payment);
  if (inspected.payment) {
    await markPaymentFromProvider({
      paymentId: payment.id,
      qrSessionId: session.id,
      providerPaymentId: inspected.payment.id,
      providerStatus: inspected.payment.status,
      rawEvent: { id: `qr-cancel-check:${session.providerQrCodeId}:${inspected.payment.id}`, source: 'server_qr_cancel_reconciliation', payment: inspected.payment, qrCode: inspected.qr },
      eventType: 'qr_code.credited'
    });
    throw fail(409, 'QR_PAYMENT_ALREADY_RECEIVED', 'Razorpay has recorded this QR payment. The payment has been marked for verification; do not pay again.');
  }

  const closed = inspected.qr.status === 'closed' ? inspected.qr : await closeRazorpayQr(session.providerQrCodeId);
  if (closed?.status !== 'closed') throw fail(502, 'RAZORPAY_QR_CLOSE_UNCONFIRMED', 'Razorpay has not confirmed that the QR code is closed. The payment remains pending.');
  const afterClose = await fetchCapturedQrPayment(session, payment);
  if (afterClose.payment) {
    await markPaymentFromProvider({
      paymentId: payment.id,
      qrSessionId: session.id,
      providerPaymentId: afterClose.payment.id,
      providerStatus: afterClose.payment.status,
      rawEvent: { id: `qr-cancel-check:${session.providerQrCodeId}:${afterClose.payment.id}`, source: 'server_qr_cancel_reconciliation_after_close', payment: afterClose.payment, qrCode: afterClose.qr },
      eventType: 'qr_code.credited'
    });
    throw fail(409, 'QR_PAYMENT_ALREADY_RECEIVED', 'Razorpay has recorded this QR payment. The payment has been marked for verification; do not pay again.');
  }

  const updated = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
    const current = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!current || current.status === 'PAID') throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This payment has already been processed.');
    await tx.paymentQrSession.update({ where: { id: session.id }, data: { status: 'CANCELLED' } });
    if (cancelPayment && current.status === 'PENDING') await tx.payment.update({ where: { id: paymentId }, data: { status: 'CANCELLED' } });
    return tx.payment.findUnique({ where: { id: paymentId } });
  }, { isolationLevel: 'Serializable' });
  return { payment: updated, qrSession: { ...session, status: 'CANCELLED' } };
}

async function createProviderOrder(payment, receipt) {
  const currentQr = await prisma.paymentQrSession.findFirst({ where: { paymentId: payment.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  if (currentQr?.expiresAt && currentQr.expiresAt.getTime() <= Date.now()) await reconcileQrSession(payment.id);
  return prisma.$transaction(async tx => {
    // Keep remote order creation under the row lock so concurrent retries reuse one provider order.
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!current) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    if (['PAID', 'AUTHORIZED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(current.status)) throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This payment has already been processed.');
    if (current.providerOrderId) return current.providerOrderId;
    const activeQr = await tx.paymentQrSession.findFirst({ where: { paymentId: current.id, status: 'ACTIVE', expiresAt: { gt: new Date() } } });
    if (activeQr) throw fail(409, 'QR_PAYMENT_ALREADY_STARTED', 'A QR payment is already active. Cancel it or wait for it to expire before using Checkout.');

    const order = await razorpayRequest('/orders', {
      method: 'POST',
      body: {
        amount: amountToPaise(current.amount),
        currency: current.currency,
        receipt,
        notes: { tcarePaymentId: current.id }
      }
    });
    if (!order?.id || Number(order.amount) !== amountToPaise(current.amount) || order.currency !== current.currency) {
      throw fail(502, 'PAYMENT_PROVIDER_INVALID_ORDER', 'Payment provider returned an invalid order.');
    }
    await tx.payment.update({ where: { id: current.id }, data: { providerOrderId: order.id, status: 'PENDING' } });
    return order.id;
  });
}

async function markPaymentFromProvider({ paymentId = null, qrSessionId = null, providerOrderId = null, providerPaymentId, providerStatus, rawEvent, eventType }) {
  const payment = paymentId
    ? await prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: true, subscription: { include: { plan: true } }, shopOrder: true } })
    : await prisma.payment.findFirst({ where: { providerOrderId }, include: { booking: true, subscription: { include: { plan: true } }, shopOrder: true } });
  if (!payment) return { ignored: true, reason: 'PAYMENT_NOT_FOUND' };

  const eventId = rawEvent?.id ? String(rawEvent.id) : `${eventType}:${providerPaymentId || providerOrderId}`;
  const existingEvent = await prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } });
  if (existingEvent) {
    if (isFinalPaymentStatus(payment.status)) await ensureAndDeliverPaymentReceipt(payment.id);
    return { ignored: true, reason: 'DUPLICATE_EVENT' };
  }

  const normalizedStatus = providerStatus === 'captured' || eventType === 'order.paid' ? 'PAID'
    : providerStatus === 'authorized' ? 'AUTHORIZED'
    : providerStatus === 'failed' ? 'FAILED'
    : null;
  if (!normalizedStatus) {
    const result = await runWebhookTransaction({
      run: () => prisma.paymentEvent.create({ data: { paymentId: payment.id, provider, providerEventId: eventId, eventType, payload: rawEvent ?? {} } }),
      eventExists: () => prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } })
    });
    if (result?.duplicate) return { ignored: true, reason: 'DUPLICATE_EVENT' };
    return { ignored: true, reason: 'UNHANDLED_PROVIDER_STATUS' };
  }

  const result = await runWebhookTransaction({
    run: () => prisma.$transaction(async tx => {
      await tx.paymentEvent.create({ data: { paymentId: payment.id, provider, providerEventId: eventId, eventType, payload: rawEvent ?? {}, processedAt: new Date() } });

      const current = await tx.payment.findUnique({ where: { id: payment.id }, include: { booking: { select: { id: true, status: true } }, subscription: { include: { plan: true, customer: { select: { userId: true } } } }, shopOrder: true } });
      if (!current) return null;
      if (isFinalPaymentStatus(current.status)) {
        if (normalizedStatus === 'PAID' && current.providerPaymentId && providerPaymentId && current.providerPaymentId !== providerPaymentId) {
          await tx.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Payment', entityId: current.id, metadata: { eventType, duplicateCapturedPaymentId: providerPaymentId, existingCapturedPaymentId: current.providerPaymentId, reviewRequired: true } } });
          if (qrSessionId) await tx.paymentQrSession.updateMany({ where: { id: qrSessionId, status: { not: 'PAID' } }, data: { status: 'PAID' } });
        }
        return { payment: current, activatedSubscription: null };
      }

      const data = {
        status: normalizedStatus,
        ...(providerPaymentId ? { providerPaymentId } : {}),
        ...(normalizedStatus === 'PAID' ? { paidAt: current.paidAt ?? new Date() } : {})
      };
      const updated = await tx.payment.update({ where: { id: current.id }, data });
      if (normalizedStatus === 'PAID' && qrSessionId) {
        await tx.paymentQrSession.updateMany({ where: { id: qrSessionId, paymentId: current.id }, data: { status: 'PAID' } });
      }
      let activatedSubscription = null;

      if (normalizedStatus === 'AUTHORIZED' && current.shopOrderId && current.shopOrder?.status === 'PENDING_PAYMENT' && !current.shopOrder.stockReleasedAt) {
        // Razorpay is configured for automatic capture within a 3-day window.
        // Keep inventory reserved for that provider authorization window instead of
        // expiring a valid authorized payment after the normal 30-minute checkout hold.
        await tx.shopOrder.update({ where: { id: current.shopOrderId }, data: { expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) } });
      }

      if (normalizedStatus === 'PAID' && current.shopOrderId && current.shopOrder) {
        const nextOrderStatus = current.shopOrder.status === 'PENDING_PAYMENT' && !current.shopOrder.stockReleasedAt ? 'PAID' : 'PAYMENT_REVIEW';
        await tx.shopOrder.update({ where: { id: current.shopOrderId }, data: { status: nextOrderStatus, paidAt: current.shopOrder.paidAt ?? new Date() } });
        await tx.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'ShopOrder', entityId: current.shopOrderId, metadata: { eventType, paymentStatus: normalizedStatus, orderStatus: nextOrderStatus } } });
      }

      if (normalizedStatus === 'PAID' && current.subscriptionId && current.subscription?.status === 'PENDING') {
        const start = new Date();
        const renews = addBillingPeriod(start, current.subscription.plan.billingCycle);
        if (!renews) throw fail(409, 'UNSUPPORTED_BILLING_CYCLE', 'Subscription billing cycle is not supported.');
        activatedSubscription = await tx.subscription.update({
          where: { id: current.subscriptionId },
          data: { status: 'ACTIVE', startedAt: start, renewsAt: renews, cancelledAt: null, pausedAt: null },
          include: { plan: true, customer: { select: { userId: true } } }
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: 'PAYMENT_EVENT',
          entityType: 'Payment',
          entityId: current.id,
          metadata: { eventType, providerStatus, normalizedStatus, providerPaymentId: providerPaymentId ?? null, reviewRequired: normalizedStatus === 'PAID' && current.booking?.status === 'CANCELLED', ...(normalizedStatus === 'PAID' && current.booking?.status === 'CANCELLED' ? { reviewReason: 'CAPTURE_AFTER_BOOKING_CANCELLATION' } : {}) }
        }
      });
      return { payment: updated, activatedSubscription };
    }),
    eventExists: () => prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } })
  });
  if (result?.duplicate) return { ignored: true, reason: 'DUPLICATE_EVENT' };
  if (result?.payment && isFinalPaymentStatus(result.payment.status)) {
    await ensureAndDeliverPaymentReceipt(result.payment.id);
  }
  if (result?.activatedSubscription?.customer?.userId) {
    await notifyUserSafely({
      userId: result.activatedSubscription.customer.userId,
      type: 'SUBSCRIPTION',
      channel: 'IN_APP',
      title: 'Subscription activated',
      body: `${result.activatedSubscription.plan.name} is active. Your next renewal date is ${result.activatedSubscription.renewsAt.toISOString().slice(0, 10)}.`
    });
  }
  return { payment: result?.payment ?? null };
}

async function verifyClientPayment(req, res, next) {
  try {
    requireRazorpayConfig();
    const input = z.object({
      razorpayOrderId: z.string().min(1).max(100),
      razorpayPaymentId: z.string().min(1).max(100),
      razorpaySignature: z.string().min(1).max(200)
    }).strict().parse(req.body);

    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { booking: true, subscription: { include: { plan: true } }, shopOrder: true } });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    if (payment.providerOrderId !== input.razorpayOrderId) throw fail(400, 'PAYMENT_ORDER_MISMATCH', 'Payment does not belong to the expected order.');

    const customer = await getCustomer(req);
    if (!paymentBelongsToCustomer(payment, customer.id)) throw fail(403, 'FORBIDDEN', 'You cannot verify this payment.');
    if (payment.status === 'PAID') return res.json({ payment: serializeCustomerPayment(payment), verified: true });

    if (!hasValidClientPaymentSignature(env.RAZORPAY_KEY_SECRET ?? '', input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
      throw fail(400, 'INVALID_PAYMENT_SIGNATURE', 'Payment signature verification failed.');
    }

    const remote = await razorpayRequest(`/payments/${encodeURIComponent(input.razorpayPaymentId)}`);
    if (remote?.order_id !== payment.providerOrderId) throw fail(400, 'PAYMENT_ORDER_MISMATCH', 'Payment does not belong to the expected order.');
    if (!providerAmountMatches(amountToPaise(payment.amount), remote.amount) || !providerCurrencyMatches(payment.currency, remote.currency)) {
      throw fail(400, 'PAYMENT_AMOUNT_MISMATCH', 'Paid amount or currency does not match the server payment record.');
    }

    const result = await markPaymentFromProvider({ providerOrderId: payment.providerOrderId, providerPaymentId: input.razorpayPaymentId, providerStatus: remote.status, rawEvent: { source: 'client_verification', payment: remote }, eventType: `client.payment.${remote.status}` });
    return res.json({ payment: serializeCustomerPayment(result.payment), verified: result.payment?.status === 'PAID' });
  } catch (error) { next(error); }
}

async function markRefundFromProvider({ payment, refundEntity, rawEvent, eventType }) {
  const eventId = rawEvent?.id ? String(rawEvent.id) : `${eventType}:${refundEntity.id}`;
  const existingEvent = await prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } });
  if (existingEvent) return;

  const result = await runWebhookTransaction({
    run: () => prisma.$transaction(async tx => {
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
        const paymentStatus = totalRefunded >= Number(payment.amount) - 0.0001 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } });
        if (paymentStatus === 'REFUNDED' && payment.shopOrderId) await tx.shopOrder.updateMany({ where: { id: payment.shopOrderId, status: { not: 'DELIVERED' } }, data: { status: 'REFUNDED' } });
      }
      await tx.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Refund', entityId: saved.id, metadata: { eventType, providerRefundId: refundEntity.id, status: nextRefundStatus } } });
    }),
    eventExists: () => prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } })
  });
  if (result?.duplicate) return;
}

function providerTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPaidSubscriptionPeriod(providerSubscription, localSubscription, paidAt) {
  const periodStart = providerTimestamp(providerSubscription?.current_start)
    || (localSubscription.renewsAt && localSubscription.renewsAt <= paidAt ? localSubscription.renewsAt : paidAt);
  const periodEnd = providerTimestamp(providerSubscription?.current_end)
    || addBillingPeriod(periodStart, localSubscription.plan.billingCycle);
  if (!periodStart || !periodEnd || periodEnd <= periodStart) {
    throw fail(400, 'SUBSCRIPTION_PERIOD_INVALID', 'Razorpay did not provide a valid paid billing period for this subscription.');
  }
  return { periodStart, periodEnd };
}

async function processRazorpaySubscriptionEvent(payload, eventType) {
  const providerSubscription = payload?.payload?.subscription?.entity || null;
  const providerPayment = payload?.payload?.payment?.entity || null;
  const providerSubscriptionId = providerSubscription?.id || providerPayment?.subscription_id;
  if (!providerSubscriptionId) return { ignored: true, reason: 'SUBSCRIPTION_ENTITY_MISSING' };

  const local = await prisma.subscription.findUnique({
    where: { providerSubscriptionId },
    include: { plan: true, customer: { select: { userId: true } } }
  });
  if (!local) return { ignored: true, reason: 'SUBSCRIPTION_NOT_FOUND' };
  if (providerSubscription?.plan_id && local.plan.razorpayPlanId !== providerSubscription.plan_id) {
    throw fail(400, 'SUBSCRIPTION_PLAN_MISMATCH', 'Razorpay subscription event references a different plan than the T-CARE subscription.');
  }

  const eventId = payload?.id ? String(payload.id) : `${eventType}:${providerSubscriptionId}:${providerPayment?.id || providerSubscription?.updated_at || 'event'}`;
  const existingEvent = await prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } });
  if (existingEvent) return { ignored: true, reason: 'DUPLICATE_EVENT' };

  const isPaymentCaptureEvent = eventType === 'payment.captured' && Boolean(providerPayment?.subscription_id);
  const isChargeEvent = eventType === 'subscription.charged' || isPaymentCaptureEvent
    || (eventType === 'subscription.activated' && providerPayment?.status === 'captured');
  const isFailedSubscriptionPayment = eventType === 'payment.failed' && Boolean(providerPayment?.subscription_id);
  const paymentAmountMatchesPlan = Boolean(providerPayment?.amount != null && providerAmountMatches(amountToPaise(local.plan.price), providerPayment.amount));
  if (eventType === 'subscription.charged' && isChargeEvent && !paymentAmountMatchesPlan) {
    await prisma.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Subscription', entityId: local.id, metadata: { eventType, rejected: 'AMOUNT_MISMATCH', providerPaymentId: providerPayment?.id || null } } });
    throw fail(400, 'SUBSCRIPTION_PAYMENT_AMOUNT_MISMATCH', 'The captured subscription amount does not match the Admin-configured plan price.');
  }
  if (isChargeEvent && paymentAmountMatchesPlan) {
    if (!providerPayment?.id || providerPayment.status !== 'captured') {
      throw fail(400, 'SUBSCRIPTION_PAYMENT_NOT_CAPTURED', 'A subscription charge event must contain a captured Razorpay payment.');
    }
    if (providerPayment.subscription_id !== providerSubscriptionId) {
      throw fail(400, 'SUBSCRIPTION_PAYMENT_MISMATCH', 'The captured payment does not belong to this Razorpay subscription.');
    }
    if (!paymentAmountMatchesPlan) throw fail(400, 'SUBSCRIPTION_PAYMENT_AMOUNT_MISMATCH', 'The captured subscription amount does not match the Admin-configured plan price.');
    if (!providerCurrencyMatches('INR', providerPayment.currency)) {
      throw fail(400, 'SUBSCRIPTION_PAYMENT_CURRENCY_MISMATCH', 'The subscription payment currency does not match INR.');
    }
  }

  const providerEventAt = providerTimestamp(payload?.created_at) || new Date();
  let deliveredPaymentId = null;
  let chargedSubscription = null;
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${local.id} FOR UPDATE`;
      const current = await tx.subscription.findUnique({
        where: { id: local.id },
        include: { plan: true, customer: { select: { userId: true } } }
      });
      if (!current || current.providerSubscriptionId !== providerSubscriptionId) return { ignored: true };

      let payment = null;
      let period = null;
      if (isFailedSubscriptionPayment && paymentAmountMatchesPlan) {
        if (!providerPayment?.id || providerPayment.subscription_id !== providerSubscriptionId) throw fail(400, 'SUBSCRIPTION_PAYMENT_MISMATCH', 'The failed payment does not belong to this Razorpay subscription.');
        payment = await tx.payment.findUnique({ where: { providerPaymentId: providerPayment.id } });
        if (payment && payment.subscriptionId !== current.id) throw fail(409, 'PROVIDER_PAYMENT_ALREADY_LINKED', 'This Razorpay payment is already linked to a different T-CARE record.');
        if (!payment) {
          payment = await tx.payment.create({
            data: {
              subscriptionId: current.id,
              amount: Number((Number(providerPayment.amount) / 100).toFixed(2)),
              currency: providerPayment.currency || 'INR',
              method: 'ONLINE',
              status: 'FAILED',
              provider,
              providerPaymentId: providerPayment.id,
              idempotencyKey: `razorpay-subscription:${providerSubscriptionId}:${providerPayment.id}`
            }
          });
        }
      }
      if (isChargeEvent && paymentAmountMatchesPlan) {
        const paidAt = providerTimestamp(providerPayment.created_at) || providerEventAt;
        period = getPaidSubscriptionPeriod(providerSubscription, current, paidAt);
        payment = await tx.payment.findUnique({ where: { providerPaymentId: providerPayment.id } });
        if (payment && payment.subscriptionId !== current.id) {
          throw fail(409, 'PROVIDER_PAYMENT_ALREADY_LINKED', 'This Razorpay payment is already linked to a different T-CARE record.');
        }
        if (!payment) {
          payment = await tx.payment.create({
            data: {
              subscriptionId: current.id,
              amount: Number((Number(providerPayment.amount) / 100).toFixed(2)),
              currency: providerPayment.currency,
              method: 'ONLINE',
              status: 'PAID',
              provider,
              providerPaymentId: providerPayment.id,
              idempotencyKey: `razorpay-subscription:${providerSubscriptionId}:${providerPayment.id}`,
              paidAt
            }
          });
        } else if (payment.status !== 'PAID') {
          payment = await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'PAID', paidAt: payment.paidAt || paidAt }
          });
        }
        deliveredPaymentId = payment.id;

        const priorCredit = await tx.subscriptionVisitCredit.findUnique({
          where: { subscriptionId_periodStart: { subscriptionId: current.id, periodStart: period.periodStart } }
        });
        if (!priorCredit) {
          await tx.subscriptionVisitCredit.create({
            data: {
              subscriptionId: current.id,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              visitsGranted: current.plan.includedVisitsPerPeriod,
              visitsUsed: 0
            }
          });
        } else if (priorCredit.periodEnd.getTime() !== period.periodEnd.getTime()
          || priorCredit.visitsGranted !== current.plan.includedVisitsPerPeriod) {
          throw fail(409, 'SUBSCRIPTION_CREDIT_PERIOD_CONFLICT', 'A different visit-credit period is already recorded for this Razorpay billing cycle.');
        }

        const paidAccessMustRemain = ['CANCELLED', 'EXPIRED'].includes(current.status);
        const updatedSubscription = await tx.subscription.update({
          where: { id: current.id },
          data: {
            providerSubscriptionStatus: providerSubscription.status || current.providerSubscriptionStatus,
            startedAt: current.startedAt || period.periodStart,
            renewsAt: period.periodEnd,
            ...(!paidAccessMustRemain ? { status: 'ACTIVE', pausedAt: null } : {})
          },
          include: { plan: true, customer: { select: { userId: true } } }
        });
        chargedSubscription = updatedSubscription;
      }

      const update = { providerSubscriptionStatus: providerSubscription.status || current.providerSubscriptionStatus };
      if (eventType === 'subscription.authenticated') update.mandateAuthorizedAt = current.mandateAuthorizedAt || providerEventAt;
      if (eventType === 'subscription.cancelled') {
        update.status = 'CANCELLED';
        update.cancelledAt = current.cancelledAt || providerEventAt;
        update.cancelAtPeriodEnd = true;
      } else if (eventType === 'subscription.halted' || eventType === 'subscription.paused') {
        update.status = 'PAUSED';
        update.pausedAt = current.pausedAt || providerEventAt;
      } else if (eventType === 'subscription.resumed' && current.status !== 'CANCELLED') {
        update.status = current.renewsAt && current.renewsAt > new Date() ? 'ACTIVE' : 'PENDING';
        update.pausedAt = null;
      } else if (eventType === 'subscription.completed') {
        update.status = 'EXPIRED';
        update.cancelAtPeriodEnd = false;
      } else if (eventType === 'subscription.activated' && !isChargeEvent && current.status !== 'CANCELLED') {
        // Mandate activation is not proof that the plan amount was captured. Keep booking access pending.
        update.status = current.status === 'PENDING' ? 'PENDING' : current.status;
      } else if (eventType === 'subscription.pending') {
        update.status = 'PENDING';
      }
      if (Object.keys(update).length) {
        await tx.subscription.update({ where: { id: current.id }, data: update });
      }

      await tx.paymentEvent.create({
        data: {
          ...(payment ? { paymentId: payment.id } : {}),
          provider,
          providerEventId: eventId,
          eventType,
          payload,
          processedAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: 'PAYMENT_EVENT',
          entityType: 'Subscription',
          entityId: current.id,
          metadata: { eventType, providerSubscriptionId, providerPaymentId: providerPayment?.id || null, charged: isChargeEvent, periodStart: period?.periodStart?.toISOString() || null, periodEnd: period?.periodEnd?.toISOString() || null }
        }
      });
      if (isPaymentCaptureEvent && !paymentAmountMatchesPlan) {
        await tx.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Subscription', entityId: current.id, metadata: { eventType, ignored: 'CAPTURED_AMOUNT_IS_NOT_PLAN_PRICE', providerPaymentId: providerPayment?.id || null, amountPaise: providerPayment?.amount ?? null } } });
      }
    return { payment, subscription: chargedSubscription || current, charged: isChargeEvent && paymentAmountMatchesPlan, failedAttempt: isFailedSubscriptionPayment && paymentAmountMatchesPlan };s
    }, { timeout: 15_000, maxWait: 5_000 });

    if (deliveredPaymentId) await ensureAndDeliverPaymentReceipt(deliveredPaymentId);
    if (result?.charged && result.subscription?.customer?.userId) {
      await notifyUserSafely({
        userId: result.subscription.customer.userId,
        type: 'SUBSCRIPTION',
        channel: 'IN_APP',
        title: 'Subscription payment received',
        body: `${result.subscription.plan.name} payment is confirmed. ${result.subscription.plan.includedVisitsPerPeriod} visit credits have been added for the new paid period.`
      });
    } else if (result?.failedAttempt && result.subscription?.customer?.userId) {
      await notifyUserSafely({
        userId: result.subscription.customer.userId,
        type: 'SUBSCRIPTION',
        channel: 'IN_APP',
        title: 'Subscription renewal payment failed',
        body: `Razorpay could not collect the ${result.subscription.plan.name} renewal. Check your UPI app or bank mandate. Your already-paid visit credits remain valid until their period ends.`
      });
    } else if (eventType === 'subscription.cancelled' && currentCustomerUserId(local)) {
      await notifyUserSafely({
        userId: local.customer.userId,
        type: 'SUBSCRIPTION',
        channel: 'IN_APP',
        title: 'UPI AutoPay cancelled',
        body: `Future renewals for ${local.plan.name} have stopped. Your already-paid benefits remain available until ${local.renewsAt ? local.renewsAt.toISOString().slice(0, 10) : 'the end of your current paid period'}.`
      });
    }
    return { processed: true, paymentId: deliveredPaymentId };
  } catch (error) {
    if (error?.code === 'P2002') {
      const duplicateEvent = await prisma.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } });
      const duplicatePayment = providerPayment?.id ? await prisma.payment.findUnique({ where: { providerPaymentId: providerPayment.id } }) : null;
      if (duplicateEvent || (duplicatePayment && duplicatePayment.subscriptionId === local.id)) return { ignored: true, reason: 'DUPLICATE_EVENT_OR_CHARGE' };
    }
    throw error;
  }
}

function currentCustomerUserId(subscription) {
  return Boolean(subscription?.customer?.userId);
}

// Webhook must be mounted before express.json() in app.js so req.body remains the raw bytes.
export async function razorpayWebhook(req, res) {
  try {
    requireRazorpayConfig({ webhook: true });
    const signature = req.get('x-razorpay-signature');
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!signature || !raw.length) return res.status(400).json({ error: 'INVALID_WEBHOOK', message: 'Webhook signature and raw body are required.' });

    if (!hasValidWebhookSignature(env.RAZORPAY_WEBHOOK_SECRET, raw, signature)) {
      return res.status(400).json({ error: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature verification failed.' });
    }

    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'INVALID_WEBHOOK_BODY', message: 'Webhook body is not valid JSON.' }); }

    const eventType = String(payload.event || '');
    const paymentEntity = payload.payload?.payment?.entity;
    const isSubscriptionPaymentEvent = Boolean(paymentEntity?.subscription_id)
      && ['payment.authorized', 'payment.captured', 'payment.failed'].includes(eventType);
    if (eventType.startsWith('subscription.') || isSubscriptionPaymentEvent) {
      const result = await processRazorpaySubscriptionEvent(payload, eventType);
      return res.status(200).json({ received: true, ...result });
    }
    if (eventType === 'qr_code.credited') {
      const qrEntity = payload.payload?.qr_code?.entity;
      const qrPayment = payload.payload?.payment?.entity;
      if (!qrEntity?.id || !qrPayment?.id) return res.status(400).json({ error: 'INVALID_QR_WEBHOOK', message: 'QR payment and QR code details are required.' });
      const session = await prisma.paymentQrSession.findUnique({ where: { providerQrCodeId: qrEntity.id } });
      if (!session) return res.status(200).json({ received: true, ignored: true, reason: 'QR_SESSION_NOT_FOUND' });
      const result = await reconcileQrSession(session.paymentId, {
        providerPaymentId: qrPayment.id,
        webhookEventId: req.get('x-razorpay-event-id') || `qr_code.credited:${qrEntity.id}:${qrPayment.id}`
      });
      if (!result.verified) return res.status(500).json({ error: 'QR_PAYMENT_NOT_VERIFIED', message: 'Razorpay has not yet exposed a captured payment for this QR code.' });
      return res.status(200).json({ received: true, verified: true });
    }
    const refundEntity = payload.payload?.refund?.entity;
    if (eventType.startsWith('refund.') && refundEntity?.payment_id && refundEntity?.id) {
      const payment = await prisma.payment.findFirst({ where: { providerPaymentId: refundEntity.payment_id } });
      if (payment) await markRefundFromProvider({ payment, refundEntity, rawEvent: payload, eventType });
      return res.status(200).json({ received: true });
    }
    const orderEntity = payload.payload?.order?.entity;
    const providerOrderId = paymentEntity?.order_id || orderEntity?.id;
    const providerPaymentId = paymentEntity?.id;
    if (!providerOrderId) return res.status(200).json({ received: true, ignored: true });

    const localPayment = await prisma.payment.findUnique({ where: { providerOrderId }, select: { id: true, amount: true, currency: true } });
    if (!localPayment) return res.status(200).json({ received: true, ignored: true });
    const remoteAmount = paymentEntity?.amount ?? orderEntity?.amount;
    const remoteCurrency = paymentEntity?.currency ?? orderEntity?.currency;
    if (remoteAmount != null && !providerAmountMatches(amountToPaise(localPayment.amount), remoteAmount)) {
      await prisma.auditLog.create({ data: { actorUserId: null, action: 'PAYMENT_EVENT', entityType: 'Payment', entityId: localPayment.id, metadata: { eventType, rejected: 'AMOUNT_MISMATCH' } } });
      return res.status(400).json({ error: 'PAYMENT_AMOUNT_MISMATCH', message: 'Webhook amount does not match the server payment record.' });
    }
    if (remoteCurrency && !providerCurrencyMatches(localPayment.currency, remoteCurrency)) return res.status(400).json({ error: 'PAYMENT_CURRENCY_MISMATCH', message: 'Webhook currency does not match the server payment record.' });

    await markPaymentFromProvider({ providerOrderId, providerPaymentId, providerStatus: paymentEntity?.status, rawEvent: payload, eventType });
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).json({ error: error.code || 'WEBHOOK_PROCESSING_ERROR', message: error.message || 'Webhook processing failed.' });
  }
}

const customer = Router();
customer.use(requireAuth, requireRole('CUSTOMER'));

customer.get('/availability', (req, res) => {
  return res.json({
    enabled: env.PAYMENTS_ENABLED === true && Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
    qrEnabled: env.PAYMENTS_ENABLED === true && env.RAZORPAY_QR_ENABLED === true && Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
  });
});

customer.post('/booking/:bookingId/order', async (req, res, next) => {
  try {
    requireRazorpayConfig();
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const customerProfile = await getCustomer(req);
    const booking = await prisma.booking.findFirst({ where: { id: req.params.bookingId, customerId: customerProfile.id }, select: { id: true, reference: true, total: true, status: true } });
    if (!booking) throw fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    if (booking.status === 'CANCELLED') throw fail(409, 'BOOKING_CANCELLED', 'Cancelled bookings cannot be paid.');

    const { payment } = await findOrCreatePayment({ req, target: { type: 'BOOKING', id: booking.id }, amount: booking.total, idempotencyKey });
    const orderId = await createProviderOrder(payment, `TC-${payment.id}`);
    const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { refunds: true } });
    return res.status(200).json({ payment: serializeCustomerPayment(latest), checkout: { keyId: env.RAZORPAY_KEY_ID, orderId, amount: amountToPaise(latest.amount), currency: latest.currency } });
  } catch (error) { next(error); }
});

customer.post('/booking/:bookingId/qr', async (req, res, next) => {
  try {
    requireRazorpayQrEnabled();
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const customerProfile = await getCustomer(req);
    const booking = await prisma.booking.findFirst({ where: { id: req.params.bookingId, customerId: customerProfile.id }, select: { id: true, reference: true, total: true, status: true } });
    if (!booking) throw fail(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    if (booking.status === 'CANCELLED') throw fail(409, 'BOOKING_CANCELLED', 'Cancelled bookings cannot be paid.');
    const { payment } = await findOrCreatePayment({ req, target: { type: 'BOOKING', id: booking.id }, amount: booking.total, idempotencyKey });
    const qrSession = await createQrSessionForPayment({ paymentId: payment.id, purpose: 'booking', expiresAt: new Date(Date.now() + 20 * 60_000) });
    const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { refunds: true, qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    return res.status(200).json({ payment: serializeCustomerPayment(latest), qr: toQrSessionView(qrSession) });
  } catch (error) { next(error); }
});

customer.post('/subscription/:subscriptionId/order', async (req, res, next) => {
  try {
    requireRazorpayConfig();
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const customerProfile = await getCustomer(req);
    const subscription = await prisma.subscription.findFirst({ where: { id: req.params.subscriptionId, customerId: customerProfile.id }, include: { plan: true } });
    if (!subscription) throw fail(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (subscription.status !== 'PENDING') throw fail(409, 'SUBSCRIPTION_NOT_PAYABLE', 'Only pending subscriptions can be paid.');
    if (subscription.plan.planType === 'ONE_TIME_SERVICE') throw fail(409, 'ONE_TIME_PLAN_USES_BOOKING_FLOW', 'One-Time Service plans must be paid through a booking.');
    if (isUpiAutopayPlanType(subscription.plan.planType)) throw fail(409, 'UPI_AUTOPAY_REQUIRED', 'This recurring plan requires Razorpay Subscriptions and an authorised UPI AutoPay mandate. A one-time Razorpay Order cannot be used.');

    const { payment } = await findOrCreatePayment({ req, target: { type: 'SUBSCRIPTION', id: subscription.id }, amount: subscription.plan.price, idempotencyKey });
    const orderId = await createProviderOrder(payment, `TC-SUB-${subscription.id}-${payment.id}`);
    const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { refunds: true } });
    return res.status(200).json({ payment: serializeCustomerPayment(latest), checkout: { keyId: env.RAZORPAY_KEY_ID, orderId, amount: amountToPaise(latest.amount), currency: latest.currency } });
  } catch (error) { next(error); }
});

customer.get('/:id', async (req, res, next) => {
  try {
    const customerProfile = await getCustomer(req);
    const payment = await prisma.payment.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { booking: { customerId: customerProfile.id } },
          { subscription: { customerId: customerProfile.id } },
          { shopOrder: { customerId: customerProfile.id } }
        ]
      },
      include: {
        refunds: true,
        qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 },
        booking: { select: { customerId: true, reference: true, service: { select: { name: true } } } },
        subscription: { select: { customerId: true, plan: { select: { name: true, billingCycle: true } } } },
        shopOrder: { select: { id: true, customerId: true, orderNumber: true, status: true } }
      }
    });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    return res.json({ payment: serializeCustomerPayment(payment) });
  } catch (error) { next(error); }
});

customer.post('/:id/qr/cancel', async (req, res, next) => {
  try {
    const customerProfile = await getCustomer(req);
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, OR: [{ booking: { customerId: customerProfile.id } }, { shopOrder: { customerId: customerProfile.id } }] },
      select: { id: true }
    });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    const result = await cancelQrSession(payment.id);
    const latest = await prisma.payment.findUnique({ where: { id: payment.id }, include: { refunds: true, qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    return res.json({ payment: serializeCustomerPayment(latest), cancelled: result.qrSession?.status === 'CANCELLED' });
  } catch (error) { next(error); }
});

customer.post('/:id/verify', verifyClientPayment);

customer.post('/:id/reconcile', async (req, res, next) => {
  try {
    requireRazorpayConfig();
    const customerProfile = await getCustomer(req);
    const payment = await prisma.payment.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { booking: { customerId: customerProfile.id } },
          { subscription: { customerId: customerProfile.id } },
          { shopOrder: { customerId: customerProfile.id } }
        ]
      },
      include: {
        booking: { select: { customerId: true, reference: true, service: { select: { name: true } } } },
        subscription: { select: { customerId: true, plan: { select: { name: true, billingCycle: true } } } },
        shopOrder: { select: { id: true, customerId: true, orderNumber: true, status: true } },
        refunds: true,
        qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');

    const latestQr = payment.qrSessions?.[0];
    if (latestQr && latestQr.status === 'ACTIVE' && payment.status !== 'PAID') {
      await reconcileQrSession(payment.id);
    }
    const refreshed = await prisma.payment.findUnique({ where: { id: payment.id }, include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (refreshed?.status === 'PAID' || !refreshed?.providerOrderId) {
      const latest = await prisma.payment.findUnique({
        where: { id: payment.id },
        include: {
          booking: { select: { customerId: true, reference: true, service: { select: { name: true } } } },
          subscription: { select: { customerId: true, plan: { select: { name: true, billingCycle: true } } } },
          shopOrder: { select: { id: true, customerId: true, orderNumber: true, status: true } },
          refunds: true,
          qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 }
        }
      });
      return res.json({
        payment: serializeCustomerPayment(latest),
        verified: latest?.status === 'PAID',
        destination: latest?.bookingId ? `/garden/visits/${latest.bookingId}` : latest?.subscriptionId ? '/garden/plan' : latest?.shopOrderId ? `/store/orders/${latest.shopOrderId}` : '/garden/billing'
      });
    }

    if (isFinalPaymentStatus(payment.status) || !payment.providerOrderId) {
      return res.json({
        payment: serializeCustomerPayment(payment),
        verified: payment.status === 'PAID',
        destination: payment.bookingId ? `/garden/visits/${payment.bookingId}` : payment.subscriptionId ? '/garden/plan' : payment.shopOrderId ? `/store/orders/${payment.shopOrderId}` : '/garden/billing'
      });
    }

    const remote = await razorpayRequest(`/orders/${encodeURIComponent(payment.providerOrderId)}/payments`);
    const remotePayments = Array.isArray(remote?.items) ? remote.items : [];
    const providerPayment = selectReconciliationPayment(payment, remotePayments);
    if (providerPayment) {
      await markPaymentFromProvider({
        providerOrderId: payment.providerOrderId,
        providerPaymentId: providerPayment.id,
        providerStatus: providerPayment.status,
        rawEvent: {
          id: `reconcile:${payment.id}:${providerPayment.id}:${providerPayment.status}`,
          source: 'server_reconciliation',
          payment: providerPayment
        },
        eventType: `server.reconcile.payment.${providerPayment.status}`
      });
    }

    const latest = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: {
        booking: { select: { customerId: true, reference: true, service: { select: { name: true } } } },
        subscription: { select: { customerId: true, plan: { select: { name: true, billingCycle: true } } } },
        shopOrder: { select: { id: true, customerId: true, orderNumber: true, status: true } },
        refunds: true
      }
    });
    return res.json({
      payment: serializeCustomerPayment(latest),
      verified: latest?.status === 'PAID',
      destination: latest?.bookingId ? `/garden/visits/${latest.bookingId}` : latest?.subscriptionId ? '/garden/plan' : latest?.shopOrderId ? `/store/orders/${latest.shopOrderId}` : '/garden/billing'
    });
  } catch (error) { next(error); }
});

customer.get('/', async (req, res, next) => {
  try {
    const customerProfile = await getCustomer(req);
    const payments = await prisma.payment.findMany({
      where: { OR: [{ booking: { customerId: customerProfile.id } }, { subscription: { customerId: customerProfile.id } }, { shopOrder: { customerId: customerProfile.id } }] },
      include: {
        refunds: { select: { id: true, amount: true, reason: true, status: true, createdAt: true, processedAt: true } },
        booking: { select: { reference: true, service: { select: { name: true } } } },
        subscription: { select: { plan: { select: { name: true, billingCycle: true } } } },
        shopOrder: { select: { id: true, orderNumber: true, status: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ payments: payments.map(serializeCustomerPayment) });
  } catch (error) { next(error); }
});

customer.get('/:id', async (req, res, next) => {
  try {
    const customerProfile = await getCustomer(req);
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, OR: [{ booking: { customerId: customerProfile.id } }, { subscription: { customerId: customerProfile.id } }, { shopOrder: { customerId: customerProfile.id } }] },
      include: {
        refunds: { select: { id: true, amount: true, reason: true, status: true, createdAt: true, processedAt: true } },
        booking: { select: { reference: true, service: { select: { name: true } } } },
        subscription: { select: { plan: { select: { name: true, billingCycle: true } } } },
        shopOrder: { select: { id: true, orderNumber: true, status: true } }
      }
    });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    return res.json({ payment: serializeCustomerPayment(payment) });
  } catch (error) { next(error); }
});

const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.post('/:id/receipt/resend', async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!payment) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    if (!isFinalPaymentStatus(payment.status)) throw fail(409, 'PAYMENT_NOT_CONFIRMED', 'A receipt can only be issued for a provider-confirmed payment.');
    const receipt = await ensurePaymentReceipt(payment.id);
    if (!receipt) throw fail(409, 'RECEIPT_RECIPIENT_UNAVAILABLE', 'A verified customer email address is not available for this payment.');
    const delivered = await deliverPaymentReceipt(receipt.id, { forceResend: true });
    if (delivered?.deliveryStatus === 'SENDING') {
      return res.status(202).json({ receipt: delivered, message: 'Receipt delivery is already in progress.' });
    }
    if (delivered?.deliveryStatus !== 'SENT') {
      return res.status(502).json({ error: 'RECEIPT_EMAIL_FAILED', message: 'The receipt record exists, but email delivery failed. Check the email provider configuration and retry.', receipt: delivered });
    }
    return res.json({ receipt: delivered, message: 'Payment receipt sent.' });
  } catch (error) { next(error); }
});

admin.post('/:id/refund', async (req, res, next) => {
  try {
    requireRazorpayConfig();
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
        if (processed) {
          await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } });
          if (paymentStatus === 'REFUNDED' && payment.shopOrderId) {
            await tx.shopOrder.updateMany({ where: { id: payment.shopOrderId, status: { not: 'DELIVERED' } }, data: { status: 'REFUNDED' } });
          }
        }
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
