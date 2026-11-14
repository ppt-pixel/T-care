import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUploadedObjectExists } from '../src/lib/mediaUploadRules.js';

test('media completion succeeds only after the object exists in Storage', async () => {
  const calls = [];
  const result = await assertUploadedObjectExists({
    objectKey: 'user-1/plants/asset.webp',
    objectExists: async key => { calls.push(key); return true; }
  });
  assert.equal(result, true);
  assert.deepEqual(calls, ['user-1/plants/asset.webp']);
});

test('media completion rejects an upload intent when the Storage object is missing', async () => {
  await assert.rejects(
    () => assertUploadedObjectExists({ objectKey: 'user-1/plants/missing.webp', objectExists: async () => false }),
    error => error.statusCode === 409 && error.code === 'MEDIA_OBJECT_NOT_FOUND'
  );
});

test('media completion fails closed on invalid checker inputs and propagates Storage failures', async () => {
  await assert.rejects(() => assertUploadedObjectExists({ objectKey: '', objectExists: async () => true }), TypeError);
  await assert.rejects(() => assertUploadedObjectExists({ objectKey: 'user-1/x.webp' }), TypeError);
  await assert.rejects(
    () => assertUploadedObjectExists({ objectKey: 'user-1/x.webp', objectExists: async () => { throw new Error('storage unavailable'); } }),
    /storage unavailable/
  );
});
