import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPaymentConfiguration, assertPaymentsEnabled, isFinalPaymentStatus } from '../src/lib/paymentPolicy.js';

const paymentConfig = overrides => ({
  NODE_ENV: 'development',
  PAYMENTS_ENABLED: false,
  RAZORPAY_MODE: undefined,
  RAZORPAY_KEY_ID: undefined,
  RAZORPAY_KEY_SECRET: undefined,
  RAZORPAY_WEBHOOK_SECRET: undefined,
  ...overrides
});

test('payment processing stays disabled unless the feature flag is explicitly true', () => {
  for (const value of [undefined, false, null, 'false', '']) {
    assert.throws(() => assertPaymentsEnabled(value), error => error.code === 'PAYMENTS_DISABLED' && error.statusCode === 503);
  }
  assert.doesNotThrow(() => assertPaymentsEnabled(true));
});

test('payment configuration requires environment-matched credentials before enabling', () => {
  assert.doesNotThrow(() => assertPaymentConfiguration(paymentConfig({})));
  assert.doesNotThrow(() => assertPaymentConfiguration(paymentConfig({
    PAYMENTS_ENABLED: true,
    RAZORPAY_KEY_ID: 'rzp_test_example',
    RAZORPAY_KEY_SECRET: 'test-secret',
    RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret'
  })));
  assert.doesNotThrow(() => assertPaymentConfiguration(paymentConfig({
    NODE_ENV: 'production',
    PAYMENTS_ENABLED: true,
    RAZORPAY_KEY_ID: 'rzp_live_example',
    RAZORPAY_KEY_SECRET: 'live-secret',
    RAZORPAY_WEBHOOK_SECRET: 'live-webhook-secret'
  })));
  assert.doesNotThrow(() => assertPaymentConfiguration(paymentConfig({
    NODE_ENV: 'production',
    PAYMENTS_ENABLED: false,
    RAZORPAY_KEY_ID: 'rzp_live_example'
  })));

  // Production-like staging can retain Secure/SameSite=None cookies and
  // trusted-origin enforcement while explicitly using Razorpay Test Mode.
  assert.doesNotThrow(() => assertPaymentConfiguration(paymentConfig({
    NODE_ENV: 'production',
    RAZORPAY_MODE: 'test',
    PAYMENTS_ENABLED: true,
    RAZORPAY_KEY_ID: 'rzp_test_example',
    RAZORPAY_KEY_SECRET: 'test-secret',
    RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret'
  })));
  assert.throws(
    () => assertPaymentConfiguration(paymentConfig({ RAZORPAY_MODE: 'sandbox' })),
    /RAZORPAY_MODE must be either test or live/
  );
  assert.throws(
    () => assertPaymentConfiguration(paymentConfig({ NODE_ENV: 'production', RAZORPAY_MODE: 'live', PAYMENTS_ENABLED: true, RAZORPAY_KEY_ID: 'rzp_test_example', RAZORPAY_KEY_SECRET: 'secret', RAZORPAY_WEBHOOK_SECRET: 'webhook' })),
    /RAZORPAY_MODE=live requires a live Razorpay key/
  );
  assert.throws(
    () => assertPaymentConfiguration(paymentConfig({ RAZORPAY_KEY_ID: 'rzp_live_example' })),
    /RAZORPAY_MODE=test requires a test Razorpay key/
  );
  assert.throws(
    () => assertPaymentConfiguration(paymentConfig({ RAZORPAY_MODE: 'live', PAYMENTS_ENABLED: true, RAZORPAY_KEY_ID: 'rzp_live_example', RAZORPAY_KEY_SECRET: 'secret', RAZORPAY_WEBHOOK_SECRET: 'webhook' })),
    /Live Razorpay mode may only be configured in production/
  );
  assert.throws(
    () => assertPaymentConfiguration(paymentConfig({ NODE_ENV: 'production', RAZORPAY_MODE: 'live', PAYMENTS_ENABLED: true, RAZORPAY_KEY_ID: 'rzp_live_example' })),
    /requires Razorpay API and webhook credentials/
  );
});

test('provider events cannot regress completed or refunded payment states', () => {
  for (const status of ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']) {
    assert.equal(isFinalPaymentStatus(status), true);
  }
  for (const status of ['PENDING', 'AUTHORIZED', 'FAILED', 'CANCELLED', undefined]) {
    assert.equal(isFinalPaymentStatus(status), false);
  }
});
