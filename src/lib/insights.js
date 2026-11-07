import { auth } from './firebase';

const SESSION_KEY = 'ssauction_insights_session_v1';
let sessionId = null;
let sessionUid = null;
let startPromise = null;

function getSessionId() {
  if (sessionId) return sessionId;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) sessionId = stored;
  } catch {}
  if (!sessionId) {
    sessionId = globalThis.crypto?.randomUUID?.();
    if (!sessionId) return null;
    try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch {}
  }
  return sessionId;
}

async function post(action, payload = {}, keepalive = false) {
  const user = auth.currentUser;
  if (!user || /^(bot[_-]|auctionbot[_-])/i.test(user.uid)) return null;
  const token = await user.getIdToken();
  return fetch('/api/insights/track', {
    method: 'POST',
    keepalive,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, sessionId: getSessionId(), ...payload })
  });
}

export async function ensureAnalyticsSession() {
  const user = auth.currentUser;
  if (!user || /^(bot[_-]|auctionbot[_-])/i.test(user.uid)) return null;
  if (sessionUid !== user.uid) {
    sessionUid = user.uid;
    startPromise = null;
    sessionId = null;
  }
  if (!startPromise) {
    startPromise = post('session_start').then((response) => {
      if (response && !response.ok) {
        startPromise = null;
        console.warn('[Insights] Session start was rejected:', response.status);
      }
      return response;
    }).catch((error) => {
      console.warn('[Insights] Session start skipped:', error?.message || error);
      startPromise = null;
      return null;
    });
  }
  return startPromise;
}

export async function trackAnalyticsEvent(eventName, roomId = null, metadata = {}) {
  try {
    await ensureAnalyticsSession();
    const response = await post('event', { eventName, roomId, metadata });
    if (response && !response.ok) {
      console.warn('[Insights] Event was not recorded:', response.status);
    }
  } catch (error) {
    // Analytics must never interrupt auction functionality.
    console.warn('[Insights] Event tracking skipped:', error?.message || error);
  }
}

export async function heartbeatAnalyticsSession() {
  try {
    await ensureAnalyticsSession();
    await post('heartbeat');
  } catch (error) {
    console.warn('[Insights] Session heartbeat skipped:', error?.message || error);
  }
}

export function endAnalyticsSession() {
  const id = getSessionId();
  const user = auth.currentUser;
  if (!id || !user || /^(bot[_-]|auctionbot[_-])/i.test(user.uid)) return;
  user.getIdToken().then((token) => {
    fetch('/api/insights/track', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'session_end', sessionId: id })
    }).catch(() => {});
  }).catch(() => {});
}
