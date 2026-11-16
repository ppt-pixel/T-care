import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPaymentsEnabled, isFinalPaymentStatus } from '../src/lib/paymentPolicy.js';

test('payment processing stays disabled unless the feature flag is explicitly true', () => {
  for (const value of [undefined, false, null, 'false', '']) {
    assert.throws(() => assertPaymentsEnabled(value), error => error.code === 'PAYMENTS_DISABLED' && error.statusCode === 503);
  }
  assert.doesNotThrow(() => assertPaymentsEnabled(true));
});

test('provider events cannot regress completed or refunded payment states', () => {
  for (const status of ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']) {
    assert.equal(isFinalPaymentStatus(status), true);
  }
  for (const status of ['PENDING', 'AUTHORIZED', 'FAILED', 'CANCELLED', undefined]) {
    assert.equal(isFinalPaymentStatus(status), false);
  }
});
