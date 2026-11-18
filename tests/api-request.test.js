import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRequest, restoreAuthSession, logoutAuthSession } from '../src/apiRequest.js';

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
        ? response(401, { error: 'UNAUTHENTICATED', message: 'Authentication required.' })
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
        ? response(401, { error: 'UNAUTHENTICATED', message: 'Authentication required.' })
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
      : response(401, { error: 'UNAUTHENTICATED', message: 'Authentication required.' })
  });

  await assert.rejects(request('/subscriptions/admin'), { status: 401 });
  assert.equal(expiredCount, 1);
});

test('does not refresh for invalid login credentials', async () => {
  const calls = [];
  const request = createApiRequest({
    apiV1: '/api/v1',
    fetchImpl: async (url) => {
      calls.push(url);
      return response(401, { error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    }
  });

  await assert.rejects(request('/auth/login', { method: 'POST', body: '{}' }), {
    status: 401,
    code: 'INVALID_CREDENTIALS'
  });
  assert.deepEqual(calls, ['/api/v1/auth/login']);
});

test('does not refresh for an incorrect current password', async () => {
  const calls = [];
  const request = createApiRequest({
    apiV1: '/api/v1',
    fetchImpl: async (url) => {
      calls.push(url);
      return response(401, { error: 'CURRENT_PASSWORD_INCORRECT', message: 'Current password is incorrect.' });
    }
  });

  await assert.rejects(request('/auth/change-password', { method: 'POST', body: '{}' }), {
    status: 401,
    code: 'CURRENT_PASSWORD_INCORRECT'
  });
  assert.deepEqual(calls, ['/api/v1/auth/change-password']);
});

test('coordinates refresh across tabs with Web Locks and reuses the rotated session', async () => {
  let authenticated = false;
  let refreshCount = 0;
  let lockTail = Promise.resolve();
  const lockManager = {
    request: async (_name, _options, callback) => {
      const previous = lockTail;
      let release;
      lockTail = new Promise(resolve => { release = resolve; });
      await previous;
      try { return await callback(); }
      finally { release(); }
    }
  };
  const fetchImpl = async (url) => {
    if (url.endsWith('/auth/session')) {
      return response(200, { authenticated, refreshRequired: !authenticated });
    }
    if (url.endsWith('/auth/refresh')) {
      refreshCount += 1;
      authenticated = true;
      return response(200, { authenticated: true });
    }
    return authenticated
      ? response(200, { ok: true })
      : response(401, { error: 'UNAUTHENTICATED', message: 'Authentication required.' });
  };
  const firstTabRequest = createApiRequest({ apiV1: '/api/v1', fetchImpl, lockManager });
  const secondTabRequest = createApiRequest({ apiV1: '/api/v1', fetchImpl, lockManager });

  const [first, second] = await Promise.all([
    firstTabRequest('/customer/profile'),
    secondTabRequest('/customer/plants')
  ]);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(refreshCount, 1);
});


test('session bootstrap is serialized across tabs and reuses the first tab refresh', async () => {
  let authenticated = false;
  let refreshCount = 0;
  let lockTail = Promise.resolve();
  const lockManager = {
    request: async (_name, _options, callback) => {
      const previous = lockTail;
      let release;
      lockTail = new Promise(resolve => { release = resolve; });
      await previous;
      try { return await callback(); }
      finally { release(); }
    }
  };
  const fetchImpl = async (url) => {
    if (url.endsWith('/auth/session')) {
      return response(200, authenticated
        ? { authenticated: true, user: { id: 'customer-1' } }
        : { authenticated: false, refreshRequired: true });
    }
    if (url.endsWith('/auth/refresh')) {
      refreshCount += 1;
      authenticated = true;
      return response(200, { authenticated: true, user: { id: 'customer-1' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const [first, second] = await Promise.all([
    restoreAuthSession({ apiV1: '/api/v1', fetchImpl, lockManager }),
    restoreAuthSession({ apiV1: '/api/v1', fetchImpl, lockManager })
  ]);
  assert.deepEqual(first, { id: 'customer-1' });
  assert.deepEqual(second, { id: 'customer-1' });
  assert.equal(refreshCount, 1);
});

test('logout waits for the same cross-tab session lock', async () => {
  const order = [];
  let releaseFirst;
  let lockTail = Promise.resolve();
  const lockManager = {
    request: async (_name, _options, callback) => {
      const previous = lockTail;
      let release;
      lockTail = new Promise(resolve => { release = resolve; });
      await previous;
      try { return await callback(); }
      finally { release(); }
    }
  };
  const first = lockManager.request('tcare-auth-refresh', { mode: 'exclusive' }, async () => {
    order.push('refresh-start');
    await new Promise(resolve => { releaseFirst = resolve; });
    order.push('refresh-end');
  });
  const second = logoutAuthSession({
    apiV1: '/api/v1',
    lockManager,
    fetchImpl: async (url, options) => {
      order.push('logout');
      assert.equal(url, '/api/v1/auth/logout');
      assert.equal(options.method, 'POST');
      return response(204, null);
    }
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(order, ['refresh-start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['refresh-start', 'refresh-end', 'logout']);
});

test('reports server failure when logout cannot be confirmed', async () => {
  const logout = logoutAuthSession({
    apiV1: '/api/v1',
    lockManager: null,
    fetchImpl: async () => response(503, { error: 'SERVICE_UNAVAILABLE', message: 'Try again later.' })
  });

  await assert.rejects(logout, { status: 503, code: 'SERVICE_UNAVAILABLE' });
});
