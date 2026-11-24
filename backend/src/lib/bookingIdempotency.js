import crypto from 'node:crypto';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidIdempotencyKey(value) {
  return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value);
}

export function bookingRequestFingerprint(input) {
  const scheduledStart = input?.scheduledStart instanceof Date
    ? input.scheduledStart.toISOString()
    : new Date(input?.scheduledStart).toISOString();
  const normalized = {
    serviceId: String(input?.serviceId ?? ''),
    subscriptionPlanId: String(input?.subscriptionPlanId ?? ''),
    subscriptionId: String(input?.subscriptionId ?? ''),
    plantIds: [...new Set(Array.isArray(input?.plantIds) ? input.plantIds.map(String) : [])].sort(),
    addressId: String(input?.addressId ?? ''),
    scheduledStart,
    specialInstructions: String(input?.specialInstructions ?? '').trim()
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
