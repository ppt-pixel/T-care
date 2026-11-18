import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  hasValidClientPaymentSignature,
  hasValidWebhookSignature,
  paymentBelongsToCustomer,
  providerAmountMatches,
  providerCurrencyMatches
} from '../src/lib/paymentValidation.js';

const secret = 'local-unit-test-webhook-secret';

test('webhook signatures bind the exact raw body and reject malformed signatures', () => {
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.equal(hasValidWebhookSignature(secret, rawBody, signature), true);
  assert.equal(hasValidWebhookSignature(secret, Buffer.from(`${rawBody.toString()} `), signature), false);
  assert.equal(hasValidWebhookSignature(secret, rawBody, 'not-a-signature'), false);
  assert.equal(hasValidWebhookSignature(secret, rawBody, ''), false);
  assert.equal(hasValidWebhookSignature('', rawBody, signature), false);
  assert.equal(hasValidWebhookSignature(secret, Buffer.alloc(0), signature), false);
});

test('client signatures bind the exact Razorpay order and payment identifiers', () => {
  const orderId = 'order_test_123';
  const paymentId = 'pay_test_456';
  const signature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  assert.equal(hasValidClientPaymentSignature(secret, orderId, paymentId, signature), true);
  assert.equal(hasValidClientPaymentSignature(secret, 'order_other', paymentId, signature), false);
  assert.equal(hasValidClientPaymentSignature(secret, orderId, 'pay_other', signature), false);
  assert.equal(hasValidClientPaymentSignature(secret, orderId, paymentId, 'bad'), false);
});

test('payment verification is restricted to the owning customer profile', () => {
  const bookingPayment = { booking: { customerId: 'customer_1' }, subscription: null };
  const subscriptionPayment = { booking: null, subscription: { customerId: 'customer_2' } };
  assert.equal(paymentBelongsToCustomer(bookingPayment, 'customer_1'), true);
  assert.equal(paymentBelongsToCustomer(bookingPayment, 'customer_2'), false);
  assert.equal(paymentBelongsToCustomer(subscriptionPayment, 'customer_2'), true);
  assert.equal(paymentBelongsToCustomer(subscriptionPayment, 'customer_1'), false);
  assert.equal(paymentBelongsToCustomer(null, 'customer_1'), false);
});

test('provider amount and currency must exactly match the server payment', () => {
  assert.equal(providerAmountMatches(1000, 1000), true);
  assert.equal(providerAmountMatches(1000, '1000'), true);
  assert.equal(providerAmountMatches(1000, 999), false);
  assert.equal(providerAmountMatches(1000, 1001), false);
  assert.equal(providerAmountMatches(Number.MAX_SAFE_INTEGER + 1, 1000), false);
  assert.equal(providerCurrencyMatches('INR', 'INR'), true);
  assert.equal(providerCurrencyMatches('INR', 'USD'), false);
  assert.equal(providerCurrencyMatches('INR', undefined), false);
});
