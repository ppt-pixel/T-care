import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStorageObjectInfoUrl, probeStorageObjectExists, probeStorageObjectInfo } from '../src/lib/storageObjectProbe.js';

test('Supabase metadata probe uses the object-info HEAD endpoint and encodes each path segment', () => {
  assert.equal(
    buildStorageObjectInfoUrl({ baseUrl: 'https://project.supabase.co/storage/v1/', bucket: 'tcare media', objectKey: 'user-1/plants/a b.webp' }),
    'https://project.supabase.co/storage/v1/object/info/tcare%20media/user-1/plants/a%20b.webp'
  );
});

test('Storage existence probe uses the object-info JSON endpoint with the server API key', async () => {
  const calls = [];
  const exists = await probeStorageObjectExists({
    url: 'https://project.supabase.co/storage/v1/object/info/tcare-media/user-1/a.webp',
    apiKey: 'server-secret',
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({ metadata: { size: 123, mimetype: 'image/webp' } }) };
    }
  });
  assert.equal(exists, true);
  assert.deepEqual(calls, [[
    'https://project.supabase.co/storage/v1/object/info/tcare-media/user-1/a.webp',
    { method: 'GET', headers: { apikey: 'server-secret', Accept: 'application/json' } }
  ]]);
});

test('Storage metadata probe parses size and MIME type from the Supabase info response', async () => {
  const info = await probeStorageObjectInfo({
    url: 'https://project.supabase.co/storage/v1/object/info/tcare-media/user-1/a.webp',
    apiKey: 'server-secret',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ metadata: { size: 123, mimetype: 'image/webp' } })
    })
  });
  assert.deepEqual(info, { sizeBytes: 123, contentType: 'image/webp' });
});

test('Storage metadata probe accepts numeric strings and alternate metadata field names', async () => {
  const info = await probeStorageObjectInfo({
    url: 'https://storage.test/object/info/bucket/key',
    apiKey: 'server-secret',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ metadata: { content_length: '456', content_type: 'application/pdf' } })
    })
  });
  assert.deepEqual(info, { sizeBytes: 456, contentType: 'application/pdf' });
});

test('Storage existence probe treats only HTTP 404 as a missing object', async () => {
  const missing = await probeStorageObjectExists({ url: 'https://storage.test/object/info/bucket/key', apiKey: 'key', fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(missing, false);
  await assert.rejects(
    () => probeStorageObjectExists({ url: 'https://storage.test/object/info/bucket/key', apiKey: 'key', fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'InvalidRequest' }) }),
    /failed \(400\): InvalidRequest/
  );
  await assert.rejects(
    () => probeStorageObjectExists({ url: 'https://storage.test/object/info/bucket/key', apiKey: 'key', fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'AccessDenied' }) }),
    /failed \(403\): AccessDenied/
  );
});

test('Storage probe rejects incomplete configuration', async () => {
  assert.throws(() => buildStorageObjectInfoUrl({ baseUrl: '', bucket: 'bucket', objectKey: 'path' }), TypeError);
  await assert.rejects(() => probeStorageObjectExists({ url: '', apiKey: 'key' }), TypeError);
  await assert.rejects(() => probeStorageObjectExists({ url: 'https://storage.test/path', apiKey: '' }), TypeError);
});
