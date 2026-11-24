import test from 'node:test';
import assert from 'node:assert/strict';
import { selectReconciliationPayment } from '../src/lib/paymentReconciliation.js';

const local = { providerOrderId: 'order_123', amount: 125.5, currency: 'INR' };
const payment = (overrides = {}) => ({
  id: 'pay_123', order_id: 'order_123', status: 'captured', amount: 12550, currency: 'INR', created_at: 100,
  ...overrides
});

test('reconciliation prefers captured payment over authorized or failed attempts', () => {
  const selected = selectReconciliationPayment(local, [
    payment({ id: 'pay_failed', status: 'failed', created_at: 300 }),
    payment({ id: 'pay_authorized', status: 'authorized', created_at: 400 }),
    payment({ id: 'pay_captured', status: 'captured', created_at: 100 })
  ]);
  assert.equal(selected.id, 'pay_captured');
});

test('reconciliation rejects payments for another order, amount or currency', () => {
  const selected = selectReconciliationPayment(local, [
    payment({ id: 'wrong_order', order_id: 'order_other' }),
    payment({ id: 'wrong_amount', amount: 12549 }),
    payment({ id: 'wrong_currency', currency: 'USD' })
  ]);
  assert.equal(selected, null);
});

test('reconciliation returns the newest authorized attempt when no capture exists', () => {
  const selected = selectReconciliationPayment(local, [
    payment({ id: 'auth_old', status: 'authorized', created_at: 100 }),
    payment({ id: 'auth_new', status: 'authorized', created_at: 200 })
  ]);
  assert.equal(selected.id, 'auth_new');
});

test('reconciliation handles missing provider results safely', () => {
  assert.equal(selectReconciliationPayment(local, null), null);
  assert.equal(selectReconciliationPayment({ ...local, providerOrderId: null }, []), null);
});
