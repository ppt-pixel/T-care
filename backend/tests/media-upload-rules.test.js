import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUploadedObjectMatchesIntent } from '../src/lib/mediaUploadRules.js';

const asset = { objectKey: 'user-1/plants/asset.webp', sizeBytes: 123, contentType: 'image/webp' };

test('media completion succeeds only when Storage metadata matches the upload intent', async () => {
  const calls = [];
  const result = await assertUploadedObjectMatchesIntent({
    asset,
    objectInfo: async key => { calls.push(key); return { sizeBytes: 123, contentType: 'image/webp' }; }
  });
  assert.equal(result, true);
  assert.deepEqual(calls, ['user-1/plants/asset.webp']);
});

test('media completion rejects missing objects and mismatched size or content type', async () => {
  await assert.rejects(
    () => assertUploadedObjectMatchesIntent({ asset, objectInfo: async () => null }),
    error => error.statusCode === 409 && error.code === 'MEDIA_OBJECT_NOT_FOUND'
  );
  await assert.rejects(
    () => assertUploadedObjectMatchesIntent({ asset, objectInfo: async () => ({ sizeBytes: 124, contentType: 'image/webp' }) }),
    error => error.statusCode === 409 && error.code === 'MEDIA_SIZE_MISMATCH'
  );
  await assert.rejects(
    () => assertUploadedObjectMatchesIntent({ asset, objectInfo: async () => ({ sizeBytes: 123, contentType: 'image/png' }) }),
    error => error.statusCode === 409 && error.code === 'MEDIA_TYPE_MISMATCH'
  );
});

test('media completion fails closed on missing metadata and propagates Storage failures', async () => {
  await assert.rejects(() => assertUploadedObjectMatchesIntent({ asset: { ...asset, objectKey: '' }, objectInfo: async () => ({ sizeBytes: 123, contentType: 'image/webp' }) }), TypeError);
  await assert.rejects(() => assertUploadedObjectMatchesIntent({ asset }), TypeError);
  await assert.rejects(
    () => assertUploadedObjectMatchesIntent({ asset, objectInfo: async () => ({ sizeBytes: null, contentType: null }) }),
    error => error.statusCode === 502 && error.code === 'MEDIA_METADATA_UNAVAILABLE'
  );
  await assert.rejects(
    () => assertUploadedObjectMatchesIntent({ asset, objectInfo: async () => { throw new Error('storage unavailable'); } }),
    /storage unavailable/
  );
});
