export function assertPaymentConfiguration(config) {
  const liveKeyConfigured = config.RAZORPAY_KEY_ID?.startsWith('rzp_live_') === true;
  if (config.NODE_ENV !== 'production' && liveKeyConfigured) {
    throw new Error('Live Razorpay credentials may only be configured in production.');
  }

  if (config.PAYMENTS_ENABLED !== true) return;

  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET || !config.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('PAYMENTS_ENABLED requires Razorpay API and webhook credentials.');
  }

  const expectedKeyPrefix = config.NODE_ENV === 'production' ? 'rzp_live_' : 'rzp_test_';
  if (!config.RAZORPAY_KEY_ID.startsWith(expectedKeyPrefix)) {
    throw new Error(`PAYMENTS_ENABLED requires a ${config.NODE_ENV === 'production' ? 'live' : 'test'} Razorpay key in this environment.`);
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
