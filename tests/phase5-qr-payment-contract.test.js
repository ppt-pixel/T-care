import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const payments = read('../backend/src/routes/payments.js');
const orders = read('../backend/src/routes/orders.js');
const bookings = read('../backend/src/routes/bookings.js');
const view = read('../backend/src/lib/paymentView.js');
const storeUi = read('../src/store/StoreCheckout.jsx');
const bookingUi = read('../src/phase5.jsx');
const env = read('../backend/src/config/env.js');
const schema = read('../backend/prisma/schema.prisma');
const migration = read('../backend/prisma/migrations/20261123000600_qr_payment_sessions/migration.sql');
const render = read('../render.yaml');

 test('QR is independently feature-gated and defaults off', () => {
  assert.match(env, /RAZORPAY_QR_ENABLED:[\s\S]*?\.default\(false\)/);
  assert.match(payments, /function requireRazorpayQrEnabled\([\s\S]*?RAZORPAY_QR_ENABLED !== true/);
  assert.match(orders, /qrEnabled:[\s\S]*?RAZORPAY_QR_ENABLED === true/);
  assert.match(render, /key: RAZORPAY_QR_ENABLED\s+sync: false/);
});

test('booking QR endpoint uses server-owned booking and payment records', () => {
  assert.match(payments, /customer\.post\('\/booking\/:bookingId\/qr'/);
  assert.match(payments, /booking: \{ customerId: customerProfile\.id \}/);
  assert.match(payments, /createQrSessionForPayment\(\{ paymentId: payment\.id, purpose: 'booking'/);
});

test('store checkout and existing order retry both support explicit QR mode', () => {
  assert.match(orders, /paymentMode: z\.enum\(\['CHECKOUT', 'QR'\]\)/);
  assert.match(orders, /customer\.post\('\/:id\/payment'/);
  assert.match(orders, /purpose: 'store'/);
  assert.match(storeUi, /value="QR"/);
  assert.match(storeUi, /Generate UPI QR/);
});

test('QR webhook uses provider event and independently reconciles captured payment', () => {
  assert.match(payments, /eventType === 'qr_code\.credited'/);
  assert.match(payments, /reconcileQrSession\(session\.paymentId/);
  assert.match(payments, /remotePayment\?\.status !== 'captured'/);
  assert.match(payments, /remotePayment\?\.captured !== true/);
  assert.match(payments, /\['PAID', 'AUTHORIZED', 'PARTIALLY_REFUNDED', 'REFUNDED'\]\.includes\(current\.status\).*PAYMENT_ALREADY_PROCESSED/s);
  assert.match(payments, /reviewReason: 'CAPTURE_AFTER_BOOKING_CANCELLATION'/);
});

test('customer-facing payment projection excludes QR provider IDs', () => {
  assert.match(view, /qr: payment\.qrSessions\?\.\[0\]/);
  assert.doesNotMatch(view, /providerQrCodeId/);
  assert.match(storeUi, /result\.payment\?\.status === 'PAID'/);
  assert.match(bookingUi, /Pay with UPI QR/);
});

test('QR sessions have additive schema and migration records', () => {
  assert.match(schema, /enum QrPaymentSessionStatus/);
  assert.match(schema, /model PaymentQrSession/);
  assert.match(schema, /providerQrCodeId\s+String\s+@unique/);
  assert.match(migration, /CREATE TABLE "PaymentQrSession"/);
  assert.match(migration, /PaymentQrSession_providerQrCodeId_key/);
  assert.match(migration, /REFERENCES "Payment"\("id"\)/);
});

test('booking and store cancellation close active QR before releasing entitlement or inventory', () => {
  assert.match(bookings, /if \(unpaidPayment\?\.qrSessions\?\.\[0\]\?\.status === 'ACTIVE'\) \{\s*await cancelQrSession/);
  assert.match(orders, /if \(payable\.payment\?\.qrSessions\?\.\[0\]\?\.status === 'ACTIVE'\) await cancelQrSession/);
  assert.match(orders, /const checked = await reconcileQrSession\(candidate\.payment\.id\)/);
});

test('closing a QR for payment-method switching preserves the pending payment; full cancellation closes it', () => {
  assert.match(payments, /cancelQrSession\(paymentId, \{ cancelPayment = false \} = \{\}\)/);
  assert.match(payments, /if \(cancelPayment && current\.status === 'PENDING'\)/);
  assert.match(bookings, /cancelQrSession\(unpaidPayment\.id, \{ cancelPayment: true \}\)/);
  assert.match(orders, /cancelQrSession\(payable\.payment\.id, \{ cancelPayment: true \}\)/);
});

test('UI does not offer QR beside an already-created Checkout order', () => {
  assert.match(view, /checkoutStarted: Boolean\(payment\.providerOrderId\)/);
  assert.match(orders, /checkoutStarted: Boolean\(order\.payment\.providerOrderId\)/);
  assert.match(bookingUi, /booking\.payment\?\.checkoutStarted !== true/);
  assert.match(storeUi, /order\.payment\?\.checkoutStarted !== true/);
});
