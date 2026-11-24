import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingRequestFingerprint, isValidIdempotencyKey } from '../src/lib/bookingIdempotency.js';

const base = {
  serviceId: 'service-1',
  plantIds: ['plant-2', 'plant-1', 'plant-2'],
  addressId: 'address-1',
  scheduledStart: new Date('2026-12-01T10:00:00.000Z'),
  specialInstructions: '  Keep the gate closed.  '
};

test('booking idempotency keys accept only bounded safe characters', () => {
  assert.equal(isValidIdempotencyKey('tcare.booking:12345678'), true);
  assert.equal(isValidIdempotencyKey('short'), false);
  assert.equal(isValidIdempotencyKey('tcare booking 1234'), false);
  assert.equal(isValidIdempotencyKey('x'.repeat(129)), false);
  assert.equal(isValidIdempotencyKey(null), false);
});

test('booking fingerprints normalize duplicate and reordered plant identifiers', () => {
  const reordered = { ...base, plantIds: ['plant-1', 'plant-2'] };
  assert.equal(bookingRequestFingerprint(base), bookingRequestFingerprint(reordered));
});

test('booking fingerprints change when a meaningful booking field changes', () => {
  assert.notEqual(bookingRequestFingerprint(base), bookingRequestFingerprint({ ...base, addressId: 'address-2' }));
  assert.notEqual(bookingRequestFingerprint(base), bookingRequestFingerprint({ ...base, scheduledStart: new Date('2026-12-01T11:00:00.000Z') }));
  assert.notEqual(bookingRequestFingerprint(base), bookingRequestFingerprint({ ...base, specialInstructions: 'Ring the bell.' }));
});
