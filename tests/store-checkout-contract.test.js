import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Plant Store checkout routes and order page are registered', () => {
  const main = read('../src/main.jsx');
  assert.match(main, /StoreCheckoutRoute/);
  assert.match(main, /StoreOrderRoute/);
  assert.match(main, /StoreOrdersWorkspacePage/);
});

test('checkout submits only product IDs and quantities to server pricing', () => {
  const checkout = read('../src/store/StoreCheckout.jsx');
  assert.match(checkout, /productId: item\.id, quantity: item\.qty/);
  assert.match(checkout, /Idempotency-Key/);
  assert.match(checkout, /razorpaySignature/);
  assert.match(checkout, /verified && latest\.order\?\.payment\?\.status === 'PAID'/);
});

test('checkout does not trust client redirect and retains cart on failures', () => {
  const checkout = read('../src/store/StoreCheckout.jsx');
  assert.match(checkout, /Payment is still being confirmed/);
  assert.match(checkout, /cart\.clear\(\)/);
  assert.match(checkout, /setError\(checkoutError/);
});

test('Admin order fulfilment and pricing controls are included', () => {
  const admin = read('../src/phase5.jsx');
  assert.match(admin, /orders\/admin/);
  assert.match(admin, /orders\/admin\/settings/);
  assert.match(admin, /Mark shipped/);
  assert.match(admin, /Save store pricing/);
});

test('authorized payments retain reserved inventory through the provider capture window', () => {
  const orders = read('../backend/src/routes/orders.js');
  const payments = read('../backend/src/routes/payments.js');
  assert.match(payments, /normalizedStatus === 'AUTHORIZED'[\s\S]*?3 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(orders, /current\.payment\?\.status === 'AUTHORIZED'[\s\S]*?PAYMENT_REVIEW/);
  assert.match(payments, /current\.shopOrder\.status === 'PENDING_PAYMENT' && !current\.shopOrder\.stockReleasedAt/);
});

test('Store refund completion updates the linked order status', () => {
  const payments = read('../backend/src/routes/payments.js');
  const admin = read('../src/phase5.jsx');
  assert.match(payments, /paymentStatus === 'REFUNDED' && payment\.shopOrderId[\s\S]*?status: 'REFUNDED'/);
  assert.match(admin, /Request full refund/);
  assert.match(admin, /payments\/admin\/\$\{encodeURIComponent\(order\.payment\.id\)\}\/refund/);
});

test('Store checkout is separately disabled until migration and provider checks are complete', () => {
  const env = read('../backend/src/config/env.js');
  const orders = read('../backend/src/routes/orders.js');
  const sample = read('../backend/.env.example');
  const render = read('../render.yaml');
  const checkout = read('../src/store/StoreCheckout.jsx');
  assert.match(env, /STORE_CHECKOUT_ENABLED:[\s\S]{0,180}default\(false\)/);
  assert.match(orders, /STORE_CHECKOUT_ENABLED !== true/);
  assert.match(sample, /STORE_CHECKOUT_ENABLED=false/);
  assert.match(render, /key:\s*STORE_CHECKOUT_ENABLED\s*\n\s*value:\s*["']false["']/);
  assert.match(checkout, /Checkout unavailable/);
});

test('disabling new Store checkout does not hide existing Customer orders or block Admin fulfilment', () => {
  const orders = read('../backend/src/routes/orders.js');
  assert.match(orders, /customer\.use\(requireAuth, requireRole\('CUSTOMER'\)\);\s*customer\.post\('\/checkout', requireStoreFeature/);
  assert.match(orders, /admin\.use\(requireAuth, requireRole\('ADMIN'\)\);[\s\S]*?admin\.get\('\/',/);
  assert.doesNotMatch(orders, /admin\.use\(requireStoreFeature\)/);
});
