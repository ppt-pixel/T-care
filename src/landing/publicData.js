import React from 'react';
import { API_V1 } from '../phase5Api.js';

export async function publicGet(path, { signal } = {}) {
  const response = await fetch(`${API_V1}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `Public catalogue request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

// Public catalogue data refreshes while the tab is visible. This keeps About,
// plans, reviews and stock aligned with Admin updates without needless polling.
export function usePublicList(path, field, refreshMs = 30000) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    let controller;
    let pending = false;

    const load = async () => {
      if (pending || (typeof document !== 'undefined' && document.hidden)) return;
      pending = true;
      controller?.abort();
      controller = new AbortController();
      try {
        const payload = await publicGet(path, { signal: controller.signal });
        const next = payload[field];
        if (!Array.isArray(next)) throw new Error('The public API returned an unexpected catalogue format.');
        if (active) {
          setItems(next);
          setError('');
        }
      } catch (requestError) {
        if (active && requestError.name !== 'AbortError') {
          setError(requestError.message || 'Could not load live information.');
        }
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };

    const onVisibility = () => { if (!document.hidden) load(); };
    load();
    const timer = refreshMs > 0 ? window.setInterval(load, refreshMs) : null;
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      controller?.abort();
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [path, field, refreshMs, revision]);

  const retry = React.useCallback(() => {
    setLoading(true);
    setRevision(value => value + 1);
  }, []);

  return { items, loading, error, retry };
}
