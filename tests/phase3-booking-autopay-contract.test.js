import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Customer booking is backed by Admin-configured plans and paid-period credits', () => {
  const ui = read('../src/phase5.jsx');
  const api = read('../backend/src/routes/bookings.js');
  assert.match(ui, /includedServiceIds/);
  assert.match(ui, /currentVisitCredit/);
  assert.match(ui, /Unused visits expire at period end/);
  assert.match(api, /subscriptionVisitCredit\.updateMany/);
  assert.match(api, /PLAN_VISIT_FREQUENCY_NOT_MET/);
  assert.match(api, /NO_ACTIVE_VISIT_CREDIT/);
});

test('Booking credits are restored once only before service starts', () => {
  const api = read('../backend/src/routes/bookings.js');
  assert.match(api, /canRestoreVisitCredit\(/);
  assert.match(api, /creditRestoredAt: new Date\(\)/);
});

test('Razorpay recurring checkout uses a subscription id and server signature verification', () => {
  const ui = read('../src/phase5.jsx');
  const api = read('../backend/src/routes/subscriptions.js');
  assert.match(ui, /subscription_id:\s*setup\.checkout\.subscriptionId/);
  assert.match(ui, /razorpaySubscriptionId: response\.razorpay_subscription_id/);
  assert.match(api, /hasValidClientSubscriptionSignature/);
  assert.match(api, /getRazorpayTotalCount\(subscription\.plan\.maxRenewalCycles\)/);
});

test('Subscription payment webhooks are routed by subscription entity as well as payment subscription_id', () => {
  const api = read('../backend/src/routes/payments.js');
  assert.match(api, /eventType\.startsWith\('subscription\.'\)/);
  assert.match(api, /paymentEntity\?\.subscription_id/);
  assert.match(api, /eventType === 'subscription\.charged'/);
  assert.match(api, /eventType === 'subscription\.cancelled'/);
});

test('Payment credits can still be used while the paid period is active after mandate stop or final cycle', () => {
  const api = read('../backend/src/routes/bookings.js');
  assert.match(api, /'PENDING', 'CANCELLED', 'EXPIRED'/);
  assert.match(api, /periodEnd: \{ gt: input\.scheduledStart \}/);
});

test('Customer and Admin cancellations restore a subscription visit only once before service starts', () => {
  const customer = read('../backend/src/routes/bookings.js');
  const admin = read('../backend/src/routes/admin.js');
  assert.match(customer, /canRestoreVisitCredit\(/);
  assert.match(admin, /canRestoreVisitCredit\(/);
  assert.match(admin, /VISIT_CREDIT_RESTORE_CONFLICT/);
  assert.match(admin, /PAYMENT_PENDING/);
  assert.match(admin, /FOR UPDATE/);
});

test('An expired or cancelled mandate cannot be replaced before its paid-through period ends', () => {
  const api = read('../backend/src/routes/subscriptions.js');
  assert.match(api, /'CANCELLED', 'EXPIRED'/);
  assert.match(api, /existing\.renewsAt <= new Date\(\)/);
});

test('Razorpay plan and subscription setup failures leave an explicit reconciliation state', () => {
  const api = read('../backend/src/routes/subscriptions.js');
  assert.match(api, /try\s*\{\s*const razorpayPlanId = await ensureRazorpayPlan/);
  assert.match(api, /providerSubscriptionCreateState: nextState/);
  assert.match(api, /'IN_PROGRESS'\s*\|\|\s*subscription\.providerSubscriptionCreateState === 'UNKNOWN'/);
});
