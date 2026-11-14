export function assertPaymentsEnabled(enabled) {
  if (enabled !== true) {
    const error = new Error('Payment processing is disabled on this deployment.');
    error.statusCode = 503;
    error.code = 'PAYMENTS_DISABLED';
    throw error;
  }
}
