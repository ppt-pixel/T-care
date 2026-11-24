const MIN_QR_LIFETIME_SECONDS = 120;
const MAX_QR_LIFETIME_SECONDS = 2 * 60 * 60;

export function decimalToPaise(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) {
    throw new TypeError('Payment amount must be a positive decimal with at most two fractional digits.');
  }
  const [whole, fraction = ''] = text.split('.');
  const paise = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Payment amount is outside the supported range.');
  }
  return Number(paise);
}

export function buildRazorpayQrPayload({ paymentId, amountPaise, purpose, closeBy }) {
  if (typeof paymentId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(paymentId)) {
    throw new TypeError('A valid internal payment ID is required.');
  }
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new RangeError('QR amount must be a positive integer number of paise.');
  }
  if (!Number.isSafeInteger(closeBy)) throw new TypeError('QR expiry must be a Unix timestamp in seconds.');
  const now = Math.floor(Date.now() / 1000);
  const lifetime = closeBy - now;
  if (lifetime < MIN_QR_LIFETIME_SECONDS || lifetime > MAX_QR_LIFETIME_SECONDS) {
    throw new RangeError('Razorpay QR expiry must be between two minutes and two hours from creation.');
  }
  const safePurpose = purpose === 'store' ? 'Plant Store order' : 'Service booking';
  return {
    type: 'upi_qr',
    name: 'T-CARE',
    usage: 'single_use',
    fixed_amount: true,
    payment_amount: amountPaise,
    description: `T-CARE ${safePurpose}`.slice(0, 255),
    close_by: closeBy,
    notes: { tcarePaymentId: paymentId, tcarePurpose: purpose === 'store' ? 'store' : 'booking' }
  };
}

export function validateRazorpayQrResponse(qr, { paymentId, amountPaise }) {
  if (!qr || typeof qr.id !== 'string' || !qr.id.startsWith('qr_')) return false;
  if (qr.type !== 'upi_qr' || qr.usage !== 'single_use' || qr.fixed_amount !== true) return false;
  if (!Number.isSafeInteger(Number(qr.payment_amount)) || Number(qr.payment_amount) !== amountPaise) return false;
  if (qr.status !== 'active' || qr.notes?.tcarePaymentId !== paymentId) return false;
  if (typeof qr.image_url !== 'string') return false;
  try {
    const url = new URL(qr.image_url);
    if (url.protocol !== 'https:' || url.hostname !== 'rzp.io') return false;
  } catch { return false; }
  const closeBy = Number(qr.close_by);
  return Number.isSafeInteger(closeBy) && closeBy > 0;
}

export function selectCapturedQrPayment(items, { amountPaise, currency = 'INR', paymentId = null } = {}) {
  if (!Array.isArray(items) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) return null;
  return items.find(item => item
    && typeof item.id === 'string'
    && (!paymentId || item.id === paymentId)
    && item.status === 'captured'
    && item.captured === true
    && item.method === 'upi'
    && Number(item.amount) === amountPaise
    && item.currency === currency) ?? null;
}

export function qrIsExpired(qr, now = Date.now()) {
  const closeBy = Number(qr?.close_by);
  return qr?.status === 'closed' || (Number.isSafeInteger(closeBy) && closeBy * 1000 <= now);
}

export function toQrSessionView(session) {
  if (!session) return null;
  return {
    imageUrl: session.imageUrl,
    shortUrl: session.shortUrl,
    expiresAt: session.expiresAt,
    status: session.status
  };
}
