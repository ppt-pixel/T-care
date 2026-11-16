import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalPaymentTestDatabase } from '../src/lib/paymentTestFixtureGuard.js';

const localUrl = 'postgresql://tcare_payment_test:local-only@localhost:55432/tcare_payment_test?schema=public';

test('payment fixture guard accepts only the configured local test database', () => {
  assert.doesNotThrow(() => assertLocalPaymentTestDatabase(localUrl));
  for (const url of [
    'postgresql://user:secret@remote.example:55432/tcare_payment_test',
    'postgresql://tcare_payment_test:local-only@localhost:5432/tcare_payment_test',
    'postgresql://tcare_payment_test:local-only@localhost:55432/production',
    'postgresql://other:local-only@localhost:55432/tcare_payment_test',
    'not-a-database-url'
  ]) {
    assert.throws(() => assertLocalPaymentTestDatabase(url));
  }
});
