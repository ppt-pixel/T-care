import test from 'node:test';
import assert from 'node:assert/strict';
import { runWebhookTransaction } from '../src/lib/paymentWebhookTransaction.js';

test('concurrent duplicate provider events are acknowledged after a unique-key race', async () => {
  let lookupCount = 0;
  const result = await runWebhookTransaction({
    run: async () => { throw Object.assign(new Error('Unique constraint conflict'), { code: 'P2002' }); },
    eventExists: async () => { lookupCount += 1; return { id: 'existing-event' }; }
  });
  assert.deepEqual(result, { duplicate: true });
  assert.equal(lookupCount, 1);
});

test('unrelated unique conflicts and non-unique errors remain visible', async () => {
  const uniqueConflict = Object.assign(new Error('Unique conflict'), { code: 'P2002' });
  await assert.rejects(runWebhookTransaction({
    run: async () => { throw uniqueConflict; },
    eventExists: async () => null
  }), error => error === uniqueConflict);

  const providerError = new Error('Database unavailable');
  await assert.rejects(runWebhookTransaction({
    run: async () => { throw providerError; },
    eventExists: async () => { assert.fail('Event lookup must not run for unrelated errors.'); }
  }), error => error === providerError);
});
