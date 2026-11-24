import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Customer payment outcomes use a protected reconciliation return route', () => {
  const frontend = read('../src/phase5.jsx');
  const routes = read('../src/main.jsx');
  assert.match(frontend, /handler:\s*async result\s*=>/);
  assert.match(frontend, /openPaymentReturn\(verification\.verified \? 'success' : 'pending'\)/);
  assert.match(frontend, /ondismiss:\s*\(\)\s*=>\s*openPaymentReturn\('cancelled'\)/);
  assert.match(frontend, /instance\.on\('payment\.failed'/);
  assert.match(frontend, /payments\/customer\/\$\{encodeURIComponent\(id\)\}\/reconcile/);
  assert.match(routes, /\/garden\/payments\/return\/:id/);
});

test('Customer booking submissions persist one idempotency key across safe retries', () => {
  const frontend = read('../src/phase5.jsx');
  const backend = read('../backend/src/routes/bookings.js');
  assert.match(frontend, /tcare:booking:create-idempotency:v2/);
  assert.match(frontend, /'Idempotency-Key':\s*bookingIdempotencyKey\.current\.key/);
  assert.match(frontend, /window\.sessionStorage\.setItem\(storageKey/);
  assert.match(backend, /isValidIdempotencyKey\(idempotencyKey\)/);
  assert.match(backend, /idempotencyFingerprint:\s*fingerprint/);
  assert.match(backend, /IDEMPOTENCY_KEY_REUSED/);
});
