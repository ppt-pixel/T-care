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

export function createApiRequest({ apiV1, fetchImpl = globalThis.fetch, onSessionExpired = () => {} }) {
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

  const refreshSession = () => {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
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
      })().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  };

  return async function request(path, options = {}) {
    let response = await send(path, options);
    if (response.status === 401) {
      let authenticated;
      try {
        authenticated = await refreshSession();
      } catch (error) {
        error.authRefreshFailed = true;
        throw error;
      }

      if (authenticated) response = await send(path, options);
      if (!authenticated || response.status === 401) onSessionExpired();
    }

    const data = await parseResponse(response);
    if (!response.ok) throw createRequestError(data, response.status);
    return data;
  };
}
