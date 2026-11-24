import { env } from '../config/env.js';
import { assertPaymentsEnabled } from './paymentPolicy.js';
import { buildRazorpayQrPayload, decimalToPaise, validateRazorpayQrResponse } from './razorpayQrRules.js';

function fail(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function requireQrApi() {
  assertPaymentsEnabled(env.PAYMENTS_ENABLED);
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw fail(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Razorpay is not configured on the server.');
}

function requireQrCreationEnabled() {
  requireQrApi();
  if (env.RAZORPAY_QR_ENABLED !== true) throw fail(503, 'QR_PAYMENTS_DISABLED', 'UPI QR payments are not enabled on this deployment.');
}

export async function razorpayQrRequest(path, { method = 'GET', body } = {}) {
  requireQrApi();
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!response.ok) {
      const message = data?.error?.description || data?.error?.reason || 'Razorpay QR request failed.';
      throw fail(502, 'RAZORPAY_QR_PROVIDER_ERROR', message);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw fail(504, 'RAZORPAY_QR_TIMEOUT', 'Razorpay timed out. The payment has not been marked successful.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createRazorpayQr({ paymentId, amount, purpose, expiresAt }) {
  requireQrCreationEnabled();
  const amountPaise = decimalToPaise(amount);
  const closeBy = Math.floor(new Date(expiresAt).getTime() / 1000);
  const payload = buildRazorpayQrPayload({ paymentId, amountPaise, purpose, closeBy });
  const qr = await razorpayQrRequest('/payments/qr_codes', { method: 'POST', body: payload });
  if (!validateRazorpayQrResponse(qr, { paymentId, amountPaise })) {
    if (typeof qr?.id === 'string' && qr.id.startsWith('qr_')) {
      await razorpayQrRequest(`/payments/qr_codes/${encodeURIComponent(qr.id)}/close`, { method: 'POST' }).catch(() => {});
    }
    throw fail(502, 'RAZORPAY_QR_INVALID_RESPONSE', 'Razorpay returned a QR code that does not match the requested amount or payment.');
  }
  return {
    providerQrCodeId: qr.id,
    imageUrl: qr.image_url,
    shortUrl: qr.image_url,
    expiresAt: new Date(Number(qr.close_by) * 1000)
  };
}

export async function fetchRazorpayQr(providerQrCodeId) {
  return razorpayQrRequest(`/payments/qr_codes/${encodeURIComponent(providerQrCodeId)}`);
}

export async function fetchRazorpayQrPayments(providerQrCodeId) {
  const result = await razorpayQrRequest(`/payments/qr_codes/${encodeURIComponent(providerQrCodeId)}/payments?count=100`);
  return Array.isArray(result?.items) ? result.items : [];
}

export async function closeRazorpayQr(providerQrCodeId) {
  await razorpayQrRequest(`/payments/qr_codes/${encodeURIComponent(providerQrCodeId)}/close`, { method: 'POST' });
  return fetchRazorpayQr(providerQrCodeId);
}
