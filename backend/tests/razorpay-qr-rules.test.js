import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decimalToPaise,
  buildRazorpayQrPayload,
  validateRazorpayQrResponse,
  selectCapturedQrPayment,
  qrIsExpired,
  toQrSessionView
} from '../src/lib/razorpayQrRules.js';

test('decimalToPaise uses exact integer minor-unit arithmetic', () => {
  assert.equal(decimalToPaise('125.90'), 12590);
  assert.equal(decimalToPaise('0.01'), 1);
  assert.equal(decimalToPaise('99999999.99'), 9999999999);
});

test('decimalToPaise rejects floating, malformed, zero and excessive precision', () => {
  for (const amount of ['1.001', '-1.00', '0', '1e2', ' 1.00x', '100000000.00']) {
    assert.throws(() => decimalToPaise(amount));
  }
});

test('QR payload is single-use, UPI-only and fixed to the exact amount', () => {
  const closeBy = Math.floor(Date.now() / 1000) + 20 * 60;
  const payload = buildRazorpayQrPayload({ paymentId: 'pay_internal_123', amountPaise: 45678, purpose: 'store', closeBy });
  assert.deepEqual({ type: payload.type, usage: payload.usage, fixed: payload.fixed_amount, amount: payload.payment_amount }, {
    type: 'upi_qr', usage: 'single_use', fixed: true, amount: 45678
  });
  assert.equal(payload.notes.tcarePaymentId, 'pay_internal_123');
  assert.equal(payload.notes.tcarePurpose, 'store');
});

test('QR payload rejects expiry outside the supported window and unsafe IDs', () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(() => buildRazorpayQrPayload({ paymentId: 'p1', amountPaise: 10, purpose: 'booking', closeBy: now + 60 }));
  assert.throws(() => buildRazorpayQrPayload({ paymentId: 'p1', amountPaise: 10, purpose: 'booking', closeBy: now + 3 * 60 * 60 }));
  assert.throws(() => buildRazorpayQrPayload({ paymentId: 'x'.repeat(81), amountPaise: 10, purpose: 'booking', closeBy: now + 20 * 60 }));
});

test('provider QR response must match ID, mode, fixed amount, notes and HTTPS short URL', () => {
  const qr = {
    id: 'qr_ABC123', type: 'upi_qr', usage: 'single_use', fixed_amount: true,
    payment_amount: 45678, status: 'active', notes: { tcarePaymentId: 'pay_123' },
    image_url: 'https://rzp.io/i/AbC123', close_by: Math.floor(Date.now() / 1000) + 1200
  };
  assert.equal(validateRazorpayQrResponse(qr, { paymentId: 'pay_123', amountPaise: 45678 }), true);
  assert.equal(validateRazorpayQrResponse({ ...qr, payment_amount: 45679 }, { paymentId: 'pay_123', amountPaise: 45678 }), false);
  assert.equal(validateRazorpayQrResponse({ ...qr, image_url: 'http://rzp.io/i/AbC123' }, { paymentId: 'pay_123', amountPaise: 45678 }), false);
  assert.equal(validateRazorpayQrResponse({ ...qr, notes: { tcarePaymentId: 'other' } }, { paymentId: 'pay_123', amountPaise: 45678 }), false);
});

test('only exact captured UPI payments are accepted as QR settlement', () => {
  const captured = { id: 'pay_1', status: 'captured', captured: true, method: 'upi', amount: 45678, currency: 'INR' };
  assert.equal(selectCapturedQrPayment([captured], { amountPaise: 45678 }), captured);
  for (const invalid of [
    { ...captured, status: 'authorized' },
    { ...captured, captured: false },
    { ...captured, method: 'card' },
    { ...captured, amount: 45677 },
    { ...captured, currency: 'USD' }
  ]) assert.equal(selectCapturedQrPayment([invalid], { amountPaise: 45678 }), null);
  assert.equal(selectCapturedQrPayment([captured], { amountPaise: 45678, paymentId: 'pay_other' }), null);
});

test('QR expiry and customer projection do not expose provider QR identifiers', () => {
  assert.equal(qrIsExpired({ status: 'closed' }), true);
  assert.equal(qrIsExpired({ status: 'active', close_by: Math.floor(Date.now() / 1000) - 1 }), true);
  const view = toQrSessionView({ imageUrl: 'https://rzp.io/i/a', shortUrl: 'https://rzp.io/i/a', expiresAt: new Date(), status: 'ACTIVE', providerQrCodeId: 'qr_secret_id' });
  assert.deepEqual(Object.keys(view).sort(), ['expiresAt', 'imageUrl', 'shortUrl', 'status']);
});
