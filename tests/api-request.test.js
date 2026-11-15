import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRequest } from '../src/apiRequest.js';

function response(status, data) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => data == null ? '' : JSON.stringify(data)
  };
}

test('refreshes an expired access session once and retries the protected request', async () => {
  const calls = [];
  const request = createApiRequest({
    apiV1: '/api/v1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/auth/refresh')) return response(200, { authenticated: true });
      return calls.filter(call => call.url.endsWith('/subscriptions/admin')).length === 1
        ? response(401, { message: 'Authentication required.' })
        : response(200, { subscriptions: [] });
    }
  });

  assert.deepEqual(await request('/subscriptions/admin'), { subscriptions: [] });
  assert.deepEqual(calls.map(call => call.url), [
    '/api/v1/subscriptions/admin',
    '/api/v1/auth/refresh',
    '/api/v1/subscriptions/admin'
  ]);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[2].options.credentials, 'include');
});

test('coalesces concurrent unauthorized requests into one refresh', async () => {
  let releaseRefresh;
  let refreshCount = 0;
  const requestCounts = new Map();
  const refreshResponse = new Promise(resolve => { releaseRefresh = resolve; });
  const request = createApiRequest({
    apiV1: '/api/v1',
    fetchImpl: async url => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return refreshResponse;
      }
      const count = (requestCounts.get(url) || 0) + 1;
      requestCounts.set(url, count);
      return count === 1
        ? response(401, { message: 'Authentication required.' })
        : response(200, { ok: true });
    }
  });

  const first = request('/first');
  const second = request('/second');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(refreshCount, 1);
  releaseRefresh(response(200, { authenticated: true }));

  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
});

test('ends the session when refresh confirms the user is unauthenticated', async () => {
  let expiredCount = 0;
  const request = createApiRequest({
    apiV1: '/api/v1',
    onSessionExpired: () => { expiredCount += 1; },
    fetchImpl: async url => url.endsWith('/auth/refresh')
      ? response(200, { authenticated: false })
      : response(401, { message: 'Authentication required.' })
  });

  await assert.rejects(request('/subscriptions/admin'), { status: 401 });
  assert.equal(expiredCount, 1);
});
