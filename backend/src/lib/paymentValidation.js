import crypto from 'node:crypto';

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function timingSafeHexEqual(expectedHex, actualHex) {
  if (!/^[a-f0-9]+$/i.test(expectedHex) || !/^[a-f0-9]+$/i.test(actualHex) || expectedHex.length !== actualHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
}

export function hasValidWebhookSignature(secret, rawBody, signature) {
  if (!secret || !Buffer.isBuffer(rawBody) || !rawBody.length || typeof signature !== 'string') return false;
  return timingSafeHexEqual(hmacHex(secret, rawBody), signature);
}

export function hasValidClientPaymentSignature(secret, orderId, paymentId, signature) {
  if (!secret || typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') return false;
  return timingSafeHexEqual(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

export function paymentBelongsToCustomer(payment, customerProfileId) {
  return payment?.booking?.customerId === customerProfileId
    || payment?.subscription?.customerId === customerProfileId;
}

export function providerAmountMatches(expectedAmountPaise, actualAmountPaise) {
  return Number.isSafeInteger(expectedAmountPaise)
    && expectedAmountPaise > 0
    && Number(actualAmountPaise) === expectedAmountPaise;
}

export function providerCurrencyMatches(expectedCurrency, actualCurrency) {
  return typeof expectedCurrency === 'string'
    && expectedCurrency.length > 0
    && actualCurrency === expectedCurrency;
}
