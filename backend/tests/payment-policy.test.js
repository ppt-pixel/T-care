import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPaymentsEnabled } from '../src/lib/paymentPolicy.js';

test('payment processing stays disabled unless the feature flag is explicitly true', () => {
  for (const value of [undefined, false, null, 'false', '']) {
    assert.throws(() => assertPaymentsEnabled(value), error => error.code === 'PAYMENTS_DISABLED' && error.statusCode === 503);
  }
  assert.doesNotThrow(() => assertPaymentsEnabled(true));
});
