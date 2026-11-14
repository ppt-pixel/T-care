import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeCustomerPayment } from '../src/lib/paymentView.js';

test('customer payment view exposes account-safe payment fields only', () => {
  const input = {
    id: 'pay_1', bookingId: 'book_1', subscriptionId: null,
    amount: '1299.00', currency: 'INR', method: 'ONLINE', status: 'PAID',
    provider: 'razorpay', providerOrderId: 'order_private', providerPaymentId: 'payment_private',
    idempotencyKey: 'client-secretish-idempotency-token',
    createdAt: new Date('2026-11-13T10:00:00Z'), updatedAt: new Date('2026-11-13T10:01:00Z'), paidAt: new Date('2026-11-13T10:01:00Z'),
    booking: { reference: 'TC-123', service: { name: 'Plant Care' } },
    subscription: null,
    refunds: [{ id: 'ref_1', amount: '100.00', reason: 'Partial adjustment', status: 'PARTIALLY_REFUNDED', createdAt: new Date('2026-11-13T11:00:00Z'), processedAt: new Date('2026-11-13T11:02:00Z'), providerRefundId: 'provider_ref_private', idempotencyKey: 'refund_key_private' }],
    events: [{ payload: { sensitive: true } }]
  };
  const view = serializeCustomerPayment(input);
  assert.equal(view.amount, 1299);
  assert.equal(view.booking.reference, 'TC-123');
  assert.equal(view.booking.service.name, 'Plant Care');
  assert.equal(view.refunds[0].amount, 100);
  for (const forbidden of ['provider', 'providerOrderId', 'providerPaymentId', 'idempotencyKey', 'events']) {
    assert.equal(Object.hasOwn(view, forbidden), false, `${forbidden} should not be exposed`);
  }
  assert.equal(Object.hasOwn(view.refunds[0], 'providerRefundId'), false);
  assert.equal(Object.hasOwn(view.refunds[0], 'idempotencyKey'), false);
});

test('customer payment view handles null records and optional relations safely', () => {
  assert.equal(serializeCustomerPayment(null), null);
  const result = serializeCustomerPayment({ id: 'pay_2', amount: 0, currency: 'INR', method: 'ONLINE', status: 'PENDING' });
  assert.equal(result.booking, null);
  assert.equal(result.subscription, null);
  assert.deepEqual(result.refunds, []);
});
