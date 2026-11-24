import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notifyUserSafely } from '../lib/notifications.js';
import { assertPaymentsEnabled } from '../lib/paymentPolicy.js';
import { cancelQrSession, createQrSessionForPayment, reconcileQrSession } from './payments.js';
import { toQrSessionView } from '../lib/razorpayQrRules.js';
import {
  calculateStoreTotals,
  canTransitionShopOrder,
  decimalToMinorUnits,
  minorUnitsToDecimal,
  normalizeOrderItems
} from '../lib/storeOrderRules.js';

const router = Router();
const customer = Router();
const admin = Router();
const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

function requireRazorpay() {
  assertPaymentsEnabled(env.PAYMENTS_ENABLED);
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw fail(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Razorpay is not configured on the server.');
}

function requireStoreCheckout() {
  if (env.STORE_CHECKOUT_ENABLED !== true) throw fail(503, 'STORE_CHECKOUT_DISABLED', 'Plant Store checkout is not enabled on this deployment yet.');
  requireRazorpay();
}

function requireStoreFeature(req, res, next) {
  if (env.STORE_CHECKOUT_ENABLED !== true) return next(fail(503, 'STORE_CHECKOUT_DISABLED', 'Plant Store orders are not enabled on this deployment yet.'));
  return next();
}

router.get('/status', (_req, res) => res.json({
  checkoutEnabled: env.STORE_CHECKOUT_ENABLED === true,
  qrEnabled: env.STORE_CHECKOUT_ENABLED === true && env.PAYMENTS_ENABLED === true && env.RAZORPAY_QR_ENABLED === true && Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
}));

async function razorpayCreateOrder(payment, order) {
  const activeQr = await prisma.paymentQrSession.findFirst({ where: { paymentId: payment.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  if (activeQr?.expiresAt && activeQr.expiresAt.getTime() <= Date.now()) await reconcileQrSession(payment.id);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!current) throw fail(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    if (current.status === 'PAID' || current.status === 'AUTHORIZED' || current.status === 'PARTIALLY_REFUNDED' || current.status === 'REFUNDED') throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This order already has a processed payment.');
    const activeQrSession = await tx.paymentQrSession.findFirst({ where: { paymentId: current.id, status: 'ACTIVE', expiresAt: { gt: new Date() } } });
    if (activeQrSession) throw fail(409, 'QR_PAYMENT_ALREADY_STARTED', 'A QR payment is already active. Cancel it or wait for it to expire before using Checkout.');
    if (current.providerOrderId) return current.providerOrderId;
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ amount: decimalToMinorUnits(current.amount), currency: current.currency, receipt: order.orderNumber, notes: { tcareOrderId: order.id, tcarePaymentId: current.id } }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id || Number(body.amount) !== decimalToMinorUnits(current.amount) || body.currency !== current.currency) {
        throw fail(502, 'RAZORPAY_ORDER_FAILED', body?.error?.description || 'Razorpay could not create the order.');
      }
      await tx.payment.update({ where: { id: current.id }, data: { provider: 'razorpay', providerOrderId: body.id, status: 'PENDING' } });
      return body.id;
    } catch (error) {
      if (error?.name === 'AbortError') throw fail(504, 'RAZORPAY_TIMEOUT', 'Razorpay timed out while creating the order. Check the order before retrying.');
      throw error;
    } finally { clearTimeout(timeout); }
  }, { timeout: 20000 });
}

async function getCustomer(req) {
  const customerProfile = await prisma.customerProfile.findUnique({ where: { userId: req.auth.id }, include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } });
  if (!customerProfile) throw fail(404, 'CUSTOMER_PROFILE_NOT_FOUND', 'Customer profile not found.');
  return customerProfile;
}

function serializeOrder(order, { adminView = false } = {}) {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    taxRateBps: order.taxRateBps,
    taxAmount: Number(order.taxAmount),
    shippingFee: Number(order.shippingFee),
    total: Number(order.total),
    recipientName: order.recipientName,
    recipientEmail: order.recipientEmail,
    recipientPhone: order.recipientPhone,
    address: { line1: order.addressLine1, line2: order.addressLine2, city: order.city, state: order.state, postalCode: order.postalCode, country: order.country },
    customerNote: order.customerNote,
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    fulfillmentNote: order.fulfillmentNote,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    processedAt: order.processedAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: (order.items || []).map(item => ({ id: item.id, productId: item.productId, sku: item.productSku, name: item.productName, imageUrl: item.imageUrl, unitPrice: Number(item.unitPrice), quantity: item.quantity, lineTotal: Number(item.lineTotal) })),
    ...(adminView && order.customer ? { customer: { name: order.customer.user.fullName, email: order.customer.user.email, phone: order.customer.user.phone } } : {}),
    payment: order.payment ? { id: order.payment.id, status: order.payment.status, checkoutStarted: Boolean(order.payment.providerOrderId), paidAt: order.payment.paidAt, qr: toQrSessionView(order.payment.qrSessions?.[0]) } : null
  };
}

async function releaseReservedStock(tx, order, actorUserId = null, reason = 'Order reservation released') {
  if (!order || order.stockReleasedAt) return false;
  const now = new Date();
  for (const item of order.items) {
    if (!item.productId) continue;
    await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
    await tx.productStockMovement.create({ data: { productId: item.productId, quantityChange: item.quantity, reason: `${reason} · ${order.orderNumber}`, actorUserId } });
  }
  await tx.shopOrder.update({ where: { id: order.id }, data: { stockReleasedAt: now } });
  return true;
}

async function expirePendingOrders(customerId = null) {
  const expired = await prisma.shopOrder.findMany({
    where: { status: 'PENDING_PAYMENT', expiresAt: { lte: new Date() }, stockReleasedAt: null, ...(customerId ? { customerId } : {}) },
    include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    orderBy: { expiresAt: 'asc' }, take: 50
  });
  for (const candidate of expired) {
    if (candidate.payment?.qrSessions?.[0]?.status === 'ACTIVE') {
      try {
        const checked = await reconcileQrSession(candidate.payment.id);
        if (checked.payment?.status === 'PAID') continue;
        if (checked.qrSession?.status === 'ACTIVE') {
          await prisma.shopOrder.updateMany({ where: { id: candidate.id, status: 'PENDING_PAYMENT' }, data: { status: 'PAYMENT_REVIEW' } });
          continue;
        }
      } catch {
        // Do not release inventory if Razorpay status cannot be verified or the QR cannot be closed.
        await prisma.shopOrder.updateMany({ where: { id: candidate.id, status: 'PENDING_PAYMENT' }, data: { status: 'PAYMENT_REVIEW' } });
        continue;
      }
    }
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ShopOrder" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const current = await tx.shopOrder.findUnique({ where: { id: candidate.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
      if (!current || current.status !== 'PENDING_PAYMENT' || current.expiresAt > new Date() || current.stockReleasedAt) return;
      if (current.payment?.status === 'AUTHORIZED') {
        // Never release reserved stock while the provider has an authorized payment
        // that may still be captured or automatically refunded. Move it to manual
        // review instead of risking a paid order against released inventory.
        await tx.shopOrder.update({ where: { id: current.id }, data: { status: 'PAYMENT_REVIEW' } });
        await tx.auditLog.create({ data: { actorUserId: null, action: 'STATUS_CHANGE', entityType: 'ShopOrder', entityId: current.id, metadata: { from: 'PENDING_PAYMENT', to: 'PAYMENT_REVIEW', reason: 'AUTHORIZED_PAYMENT_EXCEEDED_CAPTURE_WINDOW' } } });
        return;
      }
      await releaseReservedStock(tx, current, null, 'Unpaid order expired');
      await tx.shopOrder.update({ where: { id: current.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      if (current.payment && ['PENDING', 'FAILED'].includes(current.payment.status)) {
        await tx.payment.update({ where: { id: current.payment.id }, data: { status: 'CANCELLED' } });
      }
      await tx.auditLog.create({ data: { actorUserId: null, action: 'STATUS_CHANGE', entityType: 'ShopOrder', entityId: current.id, metadata: { from: 'PENDING_PAYMENT', to: 'CANCELLED', reason: 'PAYMENT_WINDOW_EXPIRED' } } });
    }).catch(error => { if (error?.code !== 'P2025') throw error; });
  }
}

const deliverySchema = z.object({
  recipientName: z.string().trim().min(2).max(100),
  recipientPhone: z.string().trim().min(7).max(20),
  addressLine1: z.string().trim().min(4).max(180),
  addressLine2: z.string().trim().max(180).optional().nullable(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(4).max(12),
  customerNote: z.string().trim().max(1000).optional().nullable()
}).strict();

customer.use(requireAuth, requireRole('CUSTOMER'));
customer.post('/checkout', requireStoreFeature, async (req, res, next) => {
  try {
    requireStoreCheckout();
    await expirePendingOrders();
    const customerProfile = await getCustomer(req);
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const input = z.object({ items: z.array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(20) }).strict()).min(1).max(30), delivery: deliverySchema, paymentMode: z.enum(['CHECKOUT', 'QR']).default('CHECKOUT') }).strict().parse(req.body);
    const items = normalizeOrderItems(input.items);
    const delivery = deliverySchema.parse(input.delivery);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ items, delivery })).digest('hex');

    let order;
    const previous = await prisma.shopOrder.findUnique({ where: { idempotencyKey }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
    if (previous) {
      if (previous.customerId !== customerProfile.id || previous.requestFingerprint !== fingerprint) throw fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This checkout key was already used for a different order.');
      if (previous.status !== 'PENDING_PAYMENT' || previous.expiresAt <= new Date()) throw fail(409, 'ORDER_NOT_PAYABLE', 'This order can no longer be paid. Create a new checkout.');
      order = previous;
    } else {
      order = await prisma.$transaction(async tx => {
        const products = [];
        for (const item of items) {
          await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${item.productId} FOR UPDATE`;
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product || product.status !== 'ACTIVE') throw fail(409, 'PRODUCT_UNAVAILABLE', 'One or more products are no longer available. Refresh your cart.');
          if (product.stockQuantity < item.quantity) throw fail(409, 'INSUFFICIENT_STOCK', `${product.name} has only ${product.stockQuantity} available.`);
          products.push({ ...product, quantity: item.quantity, unitPriceMinor: decimalToMinorUnits(product.price) });
        }
        let settings = await tx.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) settings = await tx.storeSettings.create({ data: { id: 'default' } });
        const totals = calculateStoreTotals({ itemLines: products.map(p => ({ unitPriceMinor: p.unitPriceMinor, quantity: p.quantity })), shippingFeeMinor: decimalToMinorUnits(settings.shippingFee), taxRateBps: settings.taxRateBps });
        const orderSeed = crypto.randomBytes(4).toString('hex').toUpperCase();
        const orderNumber = `TC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${orderSeed}`;
        const now = new Date();
        const created = await tx.shopOrder.create({
          data: {
            orderNumber, customerId: customerProfile.id, status: 'PENDING_PAYMENT', currency: 'INR',
            subtotal: minorUnitsToDecimal(totals.subtotalMinor), taxRateBps: totals.taxRateBps,
            taxAmount: minorUnitsToDecimal(totals.taxAmountMinor), shippingFee: minorUnitsToDecimal(totals.shippingFeeMinor),
            total: minorUnitsToDecimal(totals.totalMinor), recipientName: delivery.recipientName,
            recipientEmail: customerProfile.user.email, recipientPhone: delivery.recipientPhone,
            addressLine1: delivery.addressLine1, addressLine2: delivery.addressLine2 || null,
            city: delivery.city, state: delivery.state, postalCode: delivery.postalCode, country: 'India',
            customerNote: delivery.customerNote || null, idempotencyKey, requestFingerprint: fingerprint,
            expiresAt: new Date(now.getTime() + 30 * 60_000),
            items: { create: products.map(p => ({ productId: p.id, productSku: p.sku, productName: p.name, imageUrl: p.imageUrl, unitPrice: minorUnitsToDecimal(p.unitPriceMinor), quantity: p.quantity, lineTotal: minorUnitsToDecimal(p.unitPriceMinor * p.quantity) })) }
          }, include: { items: true }
        });
        for (const product of products) {
          const reserved = await tx.product.updateMany({ where: { id: product.id, status: 'ACTIVE', stockQuantity: { gte: product.quantity } }, data: { stockQuantity: { decrement: product.quantity } } });
          if (!reserved.count) throw fail(409, 'INSUFFICIENT_STOCK', `${product.name} is no longer available in the requested quantity.`);
          await tx.productStockMovement.create({ data: { productId: product.id, quantityChange: -product.quantity, reason: `Reserved for order ${orderNumber}` } });
        }
        await tx.payment.create({ data: { shopOrderId: created.id, amount: minorUnitsToDecimal(totals.totalMinor), currency: 'INR', method: 'ONLINE', status: 'PENDING', provider: 'razorpay', idempotencyKey: `shop-order:${created.id}` } });
        await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'ShopOrder', entityId: created.id, metadata: { orderNumber, totalMinor: totals.totalMinor, itemCount: products.length } } });
        return tx.shopOrder.findUnique({ where: { id: created.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
      }, { isolationLevel: 'Serializable', timeout: 20000 });
    }

    const payment = order.payment || await prisma.payment.findUnique({ where: { shopOrderId: order.id } });
    if (!payment) throw fail(500, 'ORDER_PAYMENT_MISSING', 'The order payment record could not be found. Contact support before retrying.');
    if (payment.status === 'FAILED') {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PENDING', providerOrderId: null, providerPaymentId: null, paidAt: null } });
    }
    const freshPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (input.paymentMode === 'QR') {
      const qrExpiry = new Date(Math.min(order.expiresAt.getTime(), Date.now() + 20 * 60_000));
      const session = await createQrSessionForPayment({ paymentId: payment.id, purpose: 'store', expiresAt: qrExpiry });
      const latest = await prisma.shopOrder.findUnique({ where: { id: order.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
      return res.status(200).json({ order: serializeOrder(latest), paymentId: payment.id, qr: toQrSessionView(session) });
    }
    const providerOrderId = await razorpayCreateOrder(freshPayment, order);
    const latest = await prisma.shopOrder.findUnique({ where: { id: order.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
    return res.status(200).json({ order: serializeOrder(latest), paymentId: payment.id, checkout: { keyId: env.RAZORPAY_KEY_ID, orderId: providerOrderId, amount: decimalToMinorUnits(latest.total), currency: latest.currency } });
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'ORDER_ALREADY_CREATED', message: 'This checkout was already submitted. Open your orders to check its status.' });
    next(error);
  }
});

customer.get('/', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    await expirePendingOrders(profile.id);
    const orders = await prisma.shopOrder.findMany({ where: { customerId: profile.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    return res.json({ orders: orders.map(order => serializeOrder(order)) });
  } catch (error) { next(error); }
});

customer.get('/:id', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    await expirePendingOrders(profile.id);
    const order = await prisma.shopOrder.findFirst({ where: { id: req.params.id, customerId: profile.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
    if (!order) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
    return res.json({ order: serializeOrder(order) });
  } catch (error) { next(error); }
});

customer.post('/:id/payment', requireStoreFeature, async (req, res, next) => {
  try {
    requireStoreCheckout();
    const profile = await getCustomer(req);
    const mode = z.object({ paymentMode: z.enum(['CHECKOUT', 'QR']) }).strict().parse(req.body).paymentMode;
    const order = await prisma.shopOrder.findFirst({
      where: { id: req.params.id, customerId: profile.id },
      include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } }
    });
    if (!order) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (order.status !== 'PENDING_PAYMENT' || order.stockReleasedAt || order.expiresAt <= new Date()) throw fail(409, 'ORDER_NOT_PAYABLE', 'This order is no longer payable. Contact support if you believe this is an error.');
    if (!order.payment) throw fail(500, 'ORDER_PAYMENT_MISSING', 'The order payment record could not be found.');
    if (['PAID', 'AUTHORIZED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.payment.status)) throw fail(409, 'PAYMENT_ALREADY_PROCESSED', 'This order already has a processed payment.');

    if (mode === 'QR') {
      const session = await createQrSessionForPayment({
        paymentId: order.payment.id,
        purpose: 'store',
        expiresAt: new Date(Math.min(order.expiresAt.getTime(), Date.now() + 20 * 60_000))
      });
      const latest = await prisma.shopOrder.findUnique({ where: { id: order.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
      return res.json({ order: serializeOrder(latest), paymentId: order.payment.id, qr: toQrSessionView(session) });
    }

    const providerOrderId = await razorpayCreateOrder(order.payment, order);
    const latest = await prisma.shopOrder.findUnique({ where: { id: order.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
    return res.json({ order: serializeOrder(latest), paymentId: order.payment.id, checkout: { keyId: env.RAZORPAY_KEY_ID, orderId: providerOrderId, amount: decimalToMinorUnits(order.total), currency: order.currency } });
  } catch (error) { next(error); }
});

customer.post('/:id/cancel', async (req, res, next) => {
  try {
    const profile = await getCustomer(req);
    const payable = await prisma.shopOrder.findFirst({ where: { id: req.params.id, customerId: profile.id }, include: { payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
    if (!payable) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (payable.payment?.qrSessions?.[0]?.status === 'ACTIVE') await cancelQrSession(payable.payment.id, { cancelPayment: true });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ShopOrder" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const order = await tx.shopOrder.findFirst({ where: { id: req.params.id, customerId: profile.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
      if (!order) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (order.status !== 'PENDING_PAYMENT' || ['PAID', 'AUTHORIZED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.payment?.status)) throw fail(409, 'ORDER_CANNOT_BE_CANCELLED', 'This order has a processed payment or is already being fulfilled. Contact support for assistance.');
      await releaseReservedStock(tx, order, req.auth.id, 'Customer cancelled unpaid order');
      await tx.shopOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      if (order.payment) await tx.payment.update({ where: { id: order.payment.id }, data: { status: 'CANCELLED' } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'ShopOrder', entityId: order.id, metadata: { from: order.status, to: 'CANCELLED' } } });
      return true;
    }, { isolationLevel: 'Serializable' });
    return res.json({ cancelled: result });
  } catch (error) { next(error); }
});

admin.use(requireAuth, requireRole('ADMIN'));
admin.get('/settings', async (req, res, next) => {
  try {
    const settings = await prisma.storeSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
    return res.json({ settings: { shippingFee: Number(settings.shippingFee), taxRateBps: settings.taxRateBps, taxRatePercent: settings.taxRateBps / 100, updatedAt: settings.updatedAt } });
  } catch (error) { next(error); }
});
admin.put('/settings', async (req, res, next) => {
  try {
    const input = z.object({ shippingFee: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/), taxRatePercent: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/) }).strict().parse(req.body);
    const shippingFeeMinor = decimalToMinorUnits(input.shippingFee);
    const taxRateBps = decimalToMinorUnits(input.taxRatePercent);
    if (shippingFeeMinor > 100000000 || taxRateBps > 10000) throw fail(400, 'INVALID_STORE_SETTINGS', 'Shipping fee or tax rate is outside the supported range.');
    const shippingFee = minorUnitsToDecimal(shippingFeeMinor);
    const settings = await prisma.storeSettings.upsert({ where: { id: 'default' }, create: { id: 'default', shippingFee, taxRateBps, updatedBy: req.auth.id }, update: { shippingFee, taxRateBps, updatedBy: req.auth.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'StoreSettings', entityId: settings.id, metadata: { shippingFeeMinor, taxRateBps } } });
    return res.json({ settings: { shippingFee: Number(settings.shippingFee), taxRateBps, taxRatePercent: taxRateBps / 100, updatedAt: settings.updatedAt } });
  } catch (error) { next(error); }
});
// Existing orders must remain visible and manageable even if new Store checkout is disabled.
admin.get('/', async (req, res, next) => {
  try {
    await expirePendingOrders();
    const status = req.query.status ? z.enum(['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).parse(req.query.status) : undefined;
    const orders = await prisma.shopOrder.findMany({ where: status ? { status } : undefined, include: { items: true, payment: true, customer: { include: { user: { select: { fullName: true, email: true, phone: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    return res.json({ orders: orders.map(order => serializeOrder(order, { adminView: true })) });
  } catch (error) { next(error); }
});
admin.patch('/:id/fulfillment', async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']), trackingNumber: z.string().trim().max(120).optional().nullable(), carrier: z.string().trim().max(120).optional().nullable(), fulfillmentNote: z.string().trim().max(1000).optional().nullable() }).strict().parse(req.body);
    const updated = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ShopOrder" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const order = await tx.shopOrder.findUnique({ where: { id: req.params.id }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
      if (!order) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (order.payment?.status !== 'PAID') throw fail(409, 'ORDER_NOT_PAID', 'Only paid orders can enter fulfilment.');
      if (!canTransitionShopOrder(order.status, input.status)) throw fail(409, 'INVALID_ORDER_TRANSITION', `Cannot move an order from ${order.status} to ${input.status}.`);
      if (input.status === 'SHIPPED' && !input.trackingNumber?.trim()) throw fail(400, 'TRACKING_REQUIRED', 'A tracking number is required before marking the order as shipped.');
      const now = new Date();
      const saved = await tx.shopOrder.update({ where: { id: order.id }, data: {
        status: input.status,
        ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber || null } : {}),
        ...(input.carrier !== undefined ? { carrier: input.carrier || null } : {}),
        ...(input.fulfillmentNote !== undefined ? { fulfillmentNote: input.fulfillmentNote || null } : {}),
        ...(input.status === 'PROCESSING' ? { processedAt: now } : {}),
        ...(input.status === 'SHIPPED' ? { shippedAt: now } : {}),
        ...(input.status === 'DELIVERED' ? { deliveredAt: now } : {})
      }, include: { items: true, payment: { include: { qrSessions: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'ShopOrder', entityId: order.id, metadata: { from: order.status, to: input.status, trackingNumber: input.trackingNumber || null } } });
      return saved;
    }, { isolationLevel: 'Serializable' });
    return res.json({ order: serializeOrder(updated) });
  } catch (error) { next(error); }
});

router.use('/customer', customer);
router.use('/admin', admin);
export default function ordersRouter() { return router; }
