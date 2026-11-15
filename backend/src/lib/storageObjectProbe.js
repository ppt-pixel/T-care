/** Build the Supabase Storage object-info endpoint for a bucket/path pair. */
export function buildStorageObjectInfoUrl({ baseUrl, bucket, objectKey }) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new TypeError('Storage base URL is required.');
  if (typeof bucket !== 'string' || !bucket.trim()) throw new TypeError('Storage bucket is required.');
  if (typeof objectKey !== 'string' || !objectKey.trim()) throw new TypeError('Storage object key is required.');
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = objectKey.split('/').map(encodeURIComponent).join('/');
  return `${normalizedBase}/object/info/${encodedBucket}/${encodedPath}`;
}

/** Read Storage object metadata without downloading its contents. */
export async function probeStorageObjectInfo({ url, apiKey, fetchImpl = fetch }) {
  if (typeof url !== 'string' || !url.trim()) throw new TypeError('Storage object-info URL is required.');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new TypeError('Storage API key is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  const response = await fetchImpl(url, { method: 'HEAD', headers: { apikey: apiKey } });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`Supabase Storage object-info check failed (${response.status}): ${detail}`);
  }
  const sizeHeader = response.headers?.get?.('content-length');
  const contentType = response.headers?.get?.('content-type');
  return {
    sizeBytes: sizeHeader && /^\d+$/.test(sizeHeader) ? Number(sizeHeader) : null,
    contentType: typeof contentType === 'string' ? contentType : null
  };
}

export async function probeStorageObjectExists(options) {
  return Boolean(await probeStorageObjectInfo(options));
}
