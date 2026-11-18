import React from 'react';
import { API_V1 } from './phase5Api.js';
import { createApiRequest } from './apiRequest.js';

const request = createApiRequest({
  apiV1: API_V1,
  onSessionExpired: () => window.dispatchEvent(new Event('tcare:session-expired'))
});

let snapshot = Object.freeze({ items: [], unreadCount: 0, status: 'idle', error: '' });
let activeUserId = null;
let pollTimer = null;
let inFlight = null;
let queuedRefreshPromise = null;
let currentController = null;
let lastFetchedAt = 0;
const listeners = new Set();

function publish(next) {
  snapshot = Object.freeze(next);
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotificationFeed() {
  return React.useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export async function refreshNotificationFeed({ force = false } = {}) {
  if (!activeUserId || document.visibilityState === 'hidden') return null;
  const now = Date.now();
  if (!force && now - lastFetchedAt < 5000) return snapshot;
  if (inFlight) {
    if (!force) return inFlight;
    if (!queuedRefreshPromise) {
      const userAtQueue = activeUserId;
      queuedRefreshPromise = inFlight.then(() => {
        queuedRefreshPromise = null;
        if (!userAtQueue || userAtQueue !== activeUserId) return null;
        return refreshNotificationFeed({ force: true });
      }, () => {
        queuedRefreshPromise = null;
        if (!userAtQueue || userAtQueue !== activeUserId) return null;
        return refreshNotificationFeed({ force: true });
      });
    }
    return queuedRefreshPromise;
  }
  lastFetchedAt = now;
  currentController = new AbortController();
  const requestController = currentController;
  publish({ ...snapshot, status: snapshot.items.length ? 'refreshing' : 'loading', error: '' });
  inFlight = request('/notifications?limit=5', { signal: requestController.signal })
    .then(data => {
      if (requestController !== currentController || !activeUserId) return null;
      const items = Array.isArray(data?.notifications) ? data.notifications : [];
      publish({ items, unreadCount: Number(data?.unreadCount) || 0, status: 'ready', error: '' });
      return snapshot;
    })
    .catch(error => {
      if (error?.name === 'AbortError' || requestController !== currentController) return null;
      publish({ ...snapshot, status: 'error', error: error?.message || 'Notifications could not be loaded.' });
      return null;
    })
    .finally(() => {
      if (requestController === currentController) {
        currentController = null;
        inFlight = null;
      }
    });
  return inFlight;
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('tcare:notifications-changed', onNotificationsChanged);
  currentController?.abort();
  currentController = null;
  inFlight = null;
  queuedRefreshPromise = null;
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') refreshNotificationFeed();
}

function onNotificationsChanged() {
  refreshNotificationFeed({ force: true });
}

export function setNotificationUser(user) {
  const nextId = user && ['CUSTOMER', 'GARDENER'].includes(user.role) ? user.id : null;
  if (nextId === activeUserId) return;
  stopPolling();
  activeUserId = nextId;
  lastFetchedAt = 0;
  publish({ items: [], unreadCount: 0, status: nextId ? 'loading' : 'idle', error: '' });
  if (!nextId) return;
  refreshNotificationFeed({ force: true });
  pollTimer = setInterval(() => refreshNotificationFeed(), 60_000);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('tcare:notifications-changed', onNotificationsChanged);
}
