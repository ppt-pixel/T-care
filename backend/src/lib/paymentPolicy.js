export function assertPaymentConfiguration(config) {
  // Payment provider mode is independent of NODE_ENV so an isolated staging
  // deployment can use test credentials while retaining production cookie,
  // proxy, HSTS and trusted-origin behaviour.
  const mode = config.RAZORPAY_MODE ?? (config.NODE_ENV === 'production' ? 'live' : 'test');
  if (!['test', 'live'].includes(mode)) {
    throw new Error('RAZORPAY_MODE must be either test or live.');
  }
  if (mode === 'live' && config.NODE_ENV !== 'production') {
    throw new Error('Live Razorpay mode may only be configured in production.');
  }

  const expectedKeyPrefix = mode === 'live' ? 'rzp_live_' : 'rzp_test_';
  if (config.RAZORPAY_KEY_ID && !config.RAZORPAY_KEY_ID.startsWith(expectedKeyPrefix)) {
    throw new Error(`RAZORPAY_MODE=${mode} requires a ${mode} Razorpay key.`);
  }

  if (config.PAYMENTS_ENABLED !== true) return;

  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET || !config.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('PAYMENTS_ENABLED requires Razorpay API and webhook credentials.');
  }
}

export function assertPaymentsEnabled(enabled) {
  if (enabled !== true) {
    const error = new Error('Payment processing is disabled on this deployment.');
    error.statusCode = 503;
    error.code = 'PAYMENTS_DISABLED';
    throw error;
  }
}

const finalPaymentStatuses = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']);

export function isFinalPaymentStatus(status) {
  return finalPaymentStatuses.has(status);
}
