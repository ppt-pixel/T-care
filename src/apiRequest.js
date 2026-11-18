function parseResponse(response) {
  if (response.status === 204) return Promise.resolve(null);
  return response.text().then(raw => {
    try { return raw ? JSON.parse(raw) : {}; }
    catch { return { message: raw || 'Unexpected server response.' }; }
  });
}

function createRequestError(data, status) {
  const error = new Error(data.message || data.error || `Request failed (${status}).`);
  error.status = status;
  error.code = data.error;
  error.details = data.details;
  return error;
}

// Only these backend responses mean the access session itself is invalid. Other
// 401 responses (for example INVALID_CREDENTIALS or CURRENT_PASSWORD_INCORRECT)
// are form/business errors and must not rotate or revoke sessions.
const SESSION_AUTH_ERRORS = new Set(['UNAUTHENTICATED', 'INVALID_SESSION']);
const AUTH_SESSION_LOCK = 'tcare-auth-refresh';
const defaultLockManager = typeof window === 'undefined' ? undefined : globalThis.navigator?.locks;

function withSessionLock(lockManager, task) {
  if (lockManager && typeof lockManager.request === 'function') {
    return lockManager.request(AUTH_SESSION_LOCK, { mode: 'exclusive' }, task);
  }
  return task();
}

async function readSession({ apiV1, fetchImpl }) {
  const response = await fetchImpl(`${apiV1}/auth/session`, { method: 'GET', credentials: 'include', cache: 'no-store' });
  const data = await parseResponse(response);
  if (!response.ok) throw createRequestError(data, response.status);
  return data;
}

async function rotateSession({ apiV1, fetchImpl }) {
  const response = await fetchImpl(`${apiV1}/auth/refresh`, { method: 'POST', credentials: 'include', cache: 'no-store' });
  const data = await parseResponse(response);
  if (!response.ok) throw createRequestError(data, response.status);
  if (typeof data?.authenticated !== 'boolean') throw new Error('Session refresh returned an invalid response.');
  return data;
}

// Session bootstrap and logout use the same cross-tab lock as request recovery.
// This prevents a stale refresh request in another tab from racing with logout.
export async function restoreAuthSession({ apiV1, fetchImpl = globalThis.fetch, lockManager = defaultLockManager }) {
  return withSessionLock(lockManager, async () => {
    const session = await readSession({ apiV1, fetchImpl });
    if (session?.authenticated === true) return session.user || null;
    if (session?.refreshRequired !== true) return null;
    const refreshed = await rotateSession({ apiV1, fetchImpl });
    return refreshed.authenticated ? refreshed.user || null : null;
  });
}

export async function logoutAuthSession({ apiV1, fetchImpl = globalThis.fetch, lockManager = defaultLockManager }) {
  return withSessionLock(lockManager, async () => {
    const response = await fetchImpl(`${apiV1}/auth/logout`, { method: 'POST', credentials: 'include', cache: 'no-store' });
    const data = await parseResponse(response);
    if (!response.ok) throw createRequestError(data, response.status);
    return data;
  });
}

export function createApiRequest({
  apiV1,
  fetchImpl = globalThis.fetch,
  onSessionExpired = () => {},
  lockManager = defaultLockManager
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  let refreshInFlight = null;
  const send = (path, options = {}) => fetchImpl(`${apiV1}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const performRefresh = async ({ recheckSession = false } = {}) => {
    // Browser tabs share the same HttpOnly cookie jar. Once a tab acquires the
    // Web Lock, check whether another tab has already rotated the refresh token.
    if (recheckSession) {
      const sessionResponse = await fetchImpl(`${apiV1}/auth/session`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const sessionData = await parseResponse(sessionResponse);
      if (!sessionResponse.ok) throw createRequestError(sessionData, sessionResponse.status);
      if (sessionData?.authenticated === true) return true;
      if (sessionData?.refreshRequired !== true) return false;
    }

    const response = await fetchImpl(`${apiV1}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store'
    });
    const data = await parseResponse(response);
    if (!response.ok) throw createRequestError(data, response.status);
    if (typeof data?.authenticated !== 'boolean') {
      throw new Error('Session refresh returned an invalid response.');
    }
    return data.authenticated;
  };

  const refreshSession = () => {
    if (!refreshInFlight) {
      refreshInFlight = withSessionLock(lockManager, () => performRefresh({ recheckSession: Boolean(lockManager && typeof lockManager.request === 'function') })).finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  };

  return async function request(path, options = {}) {
    let response = await send(path, options);
    if (response.status === 401) {
      const initialData = await parseResponse(response);
      if (!SESSION_AUTH_ERRORS.has(initialData?.error)) {
        throw createRequestError(initialData, response.status);
      }

      let authenticated;
      try {
        authenticated = await refreshSession();
      } catch (error) {
        error.authRefreshFailed = true;
        throw error;
      }

      if (!authenticated) {
        onSessionExpired();
        throw createRequestError(initialData, 401);
      }

      response = await send(path, options);
      if (response.status === 401) {
        const retryData = await parseResponse(response);
        if (SESSION_AUTH_ERRORS.has(retryData?.error)) onSessionExpired();
        throw createRequestError(retryData, response.status);
      }
      const data = await parseResponse(response);
      if (!response.ok) throw createRequestError(data, response.status);
      return data;
    }

    const data = await parseResponse(response);
    if (!response.ok) throw createRequestError(data, response.status);
    return data;
  };
}
