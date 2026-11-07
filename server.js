// Modified from the upstream project by saiprasad00700.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import analyzeWinner from './api/analyze-winner.js';
import { buildPhaseTwoMetrics } from './api/analytics-phase2.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const requestsByIp = new Map();
const WINDOW_MS = 60_000;
const MAX_ANALYSIS_REQUESTS_PER_MINUTE = 5;

function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(bytes);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 220_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function allowAnalysis(ip) {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_ANALYSIS_REQUESTS_PER_MINUTE) {
    requestsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  requestsByIp.set(ip, recent);
  if (requestsByIp.size > 2000) {
    for (const [key, values] of requestsByIp) {
      if (!values.some(t => now - t < WINDOW_MS)) requestsByIp.delete(key);
    }
  }
  return true;
}

const analyticsRequestsByUid = new Map();
const MAX_ANALYTICS_REQUESTS_PER_MINUTE = 120;

function allowAnalyticsRequest(uid) {
  const now = Date.now();
  const recent = (analyticsRequestsByUid.get(uid) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_ANALYTICS_REQUESTS_PER_MINUTE) {
    analyticsRequestsByUid.set(uid, recent);
    return false;
  }
  recent.push(now);
  analyticsRequestsByUid.set(uid, recent);
  if (analyticsRequestsByUid.size > 5000) {
    for (const [key, values] of analyticsRequestsByUid) {
      if (!values.some((time) => now - time < WINDOW_MS)) analyticsRequestsByUid.delete(key);
    }
  }
  return true;
}

async function serveStatic(req, res, pathname) {
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding in a request path must not crash the server.
    sendJson(res, 400, { error: 'Malformed URL path' });
    return;
  }
  let relative = decodedPathname.replace(/^\/+/, '');
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  let filePath = path.resolve(DIST, relative);
  if (!filePath.startsWith(DIST + path.sep) && filePath !== path.join(DIST, 'index.html')) {
    sendJson(res, 400, { error: 'Invalid path' });
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
  } catch {
    // Vite SPA routes should resolve to index.html; missing assets remain 404.
    if (path.extname(relative)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    filePath = path.join(DIST, 'index.html');
  }
  try {
    const bytes = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    res.end(bytes);
  } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Application is building or unavailable');
  }
}

// LiveKit voice-room token endpoint. Requires server-only Firebase Admin credentials.
let firebaseAdminServicesPromise;
async function getFirebaseAdminServices() {
  if (!firebaseAdminServicesPromise) firebaseAdminServicesPromise = (async () => {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Voice chat authentication is not configured');
    const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL;
    if (!databaseURL) throw new Error('Firebase Realtime Database URL is not configured');
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getDatabase } = await import('firebase-admin/database');
    const serviceAccount = JSON.parse(raw);
    const app = getApps().find((item) => item.name === '[DEFAULT]') ||
      initializeApp({ credential: cert(serviceAccount), databaseURL });
    return { auth: getAuth(app), database: getDatabase(app) };
  })();
  return firebaseAdminServicesPromise;
}

// Remove idle waiting rooms after 15 minutes and idle started auctions after 30 minutes.
// Presence alone does not count as activity for started auctions.
const WAITING_ROOM_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVE_ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 60 * 1000;
let roomCleanupStarted = false;

async function cleanupAbandonedRooms() {
  try {
    const { database } = await getFirebaseAdminServices();
    const auctionsSnapshot = await database.ref('auctions').get();
    if (!auctionsSnapshot.exists()) return;
    const now = Date.now();
    const rooms = auctionsSnapshot.val() || {};

    for (const [roomId, roomNode] of Object.entries(rooms)) {
      const room = roomNode?.room;
      if (!room) continue;
      // The live node is updated when an auction starts; prefer it over the
      // room metadata, which may still say "waiting" for compatibility.
      const status = String(roomNode?.live?.status || room.status || 'waiting').toLowerCase();
      const isWaiting = status === 'waiting';
      const isStarted = status === 'active' || status === 'started' || status === 'in_progress';
      if (!isWaiting && !isStarted) continue;

      const presence = roomNode?.presence || {};
      const online = Object.values(presence).some((entry) => entry?.online === true);
      // Online participants protect waiting rooms, but do not keep a started auction alive.
      if (isWaiting && online) continue;

      const presenceActivity = isWaiting ? Object.values(presence).reduce((latest, entry) => {
        const seen = Number(entry?.lastSeen || 0);
        return Number.isFinite(seen) ? Math.max(latest, seen) : latest;
      }, 0) : 0;
      const messageActivity = Object.values(roomNode?.messages || {}).reduce((latest, message) => {
        const stamp = Number(message?.timestamp || message?.createdAt || 0);
        return Number.isFinite(stamp) ? Math.max(latest, stamp) : latest;
      }, 0);
      const lastActivityAt = Math.max(
        Number(room.lastActivityAt || 0),
        Number(room.createdAt || 0),
        Number(roomNode?.live?.lastActivityAt || 0),
        messageActivity,
        presenceActivity
      );
      // Do not guess when a legacy room has no trustworthy timestamp.
      if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) continue;
      const idleTimeout = isWaiting ? WAITING_ROOM_IDLE_TIMEOUT_MS : ACTIVE_ROOM_IDLE_TIMEOUT_MS;
      if (now - lastActivityAt < idleTimeout) continue;

      // Supabase is also used as a fallback for joining by room ID. Delete its
      // index first, and only delete RTDB data after that succeeds, to avoid
      // stale Supabase rows recreating an abandoned room.
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseServiceKey) {
        console.warn('[Room cleanup] Skipped cleanup: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
        return;
      }

      const supabaseHeaders = {
        apikey: supabaseServiceKey,
        Authorization: 'Bearer ' + supabaseServiceKey,
        Prefer: 'return=minimal'
      };

      // Remove child team rows first in case the database enforces a foreign key.
      const teamsQuery = new URL('/rest/v1/teams', supabaseUrl);
      teamsQuery.searchParams.set('auction_id', 'eq.' + roomId);
      const teamsResponse = await fetch(teamsQuery, {
        method: 'DELETE',
        headers: supabaseHeaders
      });
      if (!teamsResponse.ok && teamsResponse.status !== 404) {
        const detail = (await teamsResponse.text()).slice(0, 300);
        console.warn('[Room cleanup] Supabase team cleanup failed for room', roomId, teamsResponse.status, detail);
        continue;
      }
      if (teamsResponse.status === 404) {
        // Some Supabase projects do not expose a REST table named "teams".
        // Continue to the auction delete; if a foreign key blocks it, that
        // request will fail and the Firebase room will be left untouched.
        console.warn('[Room cleanup] Supabase teams endpoint returned 404; trying auction cleanup for room', roomId);
      }

      const query = new URL('/rest/v1/auctions', supabaseUrl);
      query.searchParams.set('id', 'eq.' + roomId);
      const response = await fetch(query, {
        method: 'DELETE',
        headers: supabaseHeaders
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        let errorBody = {};
        try { errorBody = JSON.parse(detail); } catch {}
        const tableMissing = response.status === 404 && errorBody.code === 'PGRST205';
        if (tableMissing) {
          // This project does not have the optional Supabase auctions table.
          // Firebase Realtime Database is the actual room store, so continue
          // with RTDB cleanup instead of blocking deletion on a missing index.
          console.warn('[Room cleanup] Supabase auctions table is missing; removing room from Firebase only:', roomId);
        } else {
          console.warn('[Room cleanup] Supabase cleanup failed for room', roomId, response.status, detail);
          continue;
        }
      }

      await database.ref('auctions/' + roomId).remove();
      await database.ref('publicRooms/' + roomId).remove();
      console.log('[Room cleanup] Removed abandoned waiting room:', roomId);
    }
  } catch (error) {
    console.warn('[Room cleanup] Cleanup pass failed:', error?.message || error);
  }
}

function startRoomCleanup() {
  if (roomCleanupStarted) return;
  roomCleanupStarted = true;
  // Run once after startup, then check at one-minute intervals.
  void cleanupAbandonedRooms();
  setInterval(() => { void cleanupAbandonedRooms(); }, ROOM_CLEANUP_INTERVAL_MS);
}

let analyticsSnapshotTimerStarted = false;
async function recordAnalyticsPresenceSnapshot() {
  try {
    const { database } = await getFirebaseAdminServices();
    const snapshot = await database.ref('auctions').get();
    const { buildLiveAnalyticsSnapshot } = await import('./api/analytics.js');
    const live = buildLiveAnalyticsSnapshot(snapshot.exists() ? snapshot.val() : {}, Date.now());
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return;
    const response = await fetch(supabaseUrl.replace(/\\/$/, '') + '/rest/v1/analytics_presence_snapshots', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        sampled_at: new Date().toISOString(),
        online_players: live.onlinePlayers,
        active_players: live.activePlayers,
        active_rooms: live.activeRooms
      })
    });
    if (!response.ok) console.warn('[Insights] Presence snapshot failed:', response.status);
  } catch (error) {
    console.warn('[Insights] Presence snapshot skipped:', error?.message || error);
  }
}

function startAnalyticsPresenceSnapshots() {
  if (analyticsSnapshotTimerStarted) return;
  analyticsSnapshotTimerStarted = true;
  void recordAnalyticsPresenceSnapshot();
  setInterval(() => { void recordAnalyticsPresenceSnapshot(); }, 60_000);
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/health') return sendJson(res, 200, { ok: true });
  if (pathname === '/api/ensure-supabase-claim') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      const userRecord = await auth.getUser(decoded.uid);
      if (userRecord.customClaims?.role !== 'authenticated') {
        await auth.setCustomUserClaims(decoded.uid, {
          ...(userRecord.customClaims || {}),
          role: 'authenticated'
        });
      }
      return sendJson(res, 200, { ok: true, refreshToken: userRecord.customClaims?.role !== 'authenticated' });
    } catch (error) {
      console.warn('[Supabase auth] Could not assign authenticated role:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not prepare your account for sticker storage' });
    }
  }
  if (pathname === '/api/insights/live') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in with the authorized Google account' });

      const expectedAdminEmail = String(process.env.ANALYTICS_ADMIN_EMAIL || '').trim().toLowerCase();
      if (!expectedAdminEmail) return sendJson(res, 503, { error: 'Analytics administrator is not configured on the server' });

      const { auth, database } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      const tokenEmail = String(decoded.email || '').trim().toLowerCase();
      const signInProvider = decoded.firebase?.sign_in_provider;
      if (
        tokenEmail !== expectedAdminEmail ||
        decoded.email_verified !== true ||
        signInProvider !== 'google.com'
      ) {
        return sendJson(res, 403, { error: 'You are not authorized to view SS AUCTION INSIGHTS' });
      }

      const { buildLiveAnalyticsSnapshot } = await import('./api/analytics.js');
      const auctionsSnapshot = await database.ref('auctions').get();
      const snapshot = buildLiveAnalyticsSnapshot(
        auctionsSnapshot.exists() ? auctionsSnapshot.val() : {},
        Date.now()
      );
      return sendJson(res, 200, snapshot);
    } catch (error) {
      console.warn('[Insights] Could not load live analytics:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not load live analytics right now' });
    }
  }
  if (pathname === '/api/insights/report') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in with the authorized Google account' });
      const expectedAdminEmail = String(process.env.ANALYTICS_ADMIN_EMAIL || '').trim().toLowerCase();
      if (!expectedAdminEmail) return sendJson(res, 503, { error: 'Analytics administrator is not configured on the server' });
      const { auth } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (
        String(decoded.email || '').trim().toLowerCase() !== expectedAdminEmail ||
        decoded.email_verified !== true ||
        decoded.firebase?.sign_in_provider !== 'google.com'
      ) return sendJson(res, 403, { error: 'You are not authorized to view SS AUCTION INSIGHTS' });

      const days = Math.min(90, Math.max(1, Number(new URL(req.url || '/', 'http://localhost').searchParams.get('days')) || 30));
      const now = new Date();
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) return sendJson(res, 503, { error: 'Analytics storage is not configured on the server' });

      const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/';
      const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };
      const readRows = async (table, select, filterColumn, since = start) => {
        const rows = [];
        for (let offset = 0; offset < 50_000; offset += 1000) {
          const url = new URL(table, baseUrl);
          url.searchParams.set('select', select);
          url.searchParams.set(filterColumn, 'gte.' + since.toISOString());
          url.searchParams.set('order', filterColumn + '.desc');
          const response = await fetch(url, { headers: { ...headers, Range: offset + '-' + (offset + 999) } });
          if (!response.ok) throw new Error('Could not read analytics ' + table + ': ' + response.status);
          const batch = await response.json();
          if (!Array.isArray(batch)) throw new Error('Invalid analytics response for ' + table);
          rows.push(...batch);
          if (batch.length < 1000) break;
        }
        return rows;
      };

      const [events, allSessions, presenceSnapshots] = await Promise.all([
        readRows('analytics_events', 'firebase_uid,event_name,room_id,occurred_at,metadata', 'occurred_at'),
        readRows('analytics_sessions', 'firebase_uid,is_anonymous,started_at,last_seen_at,ended_at', 'started_at', new Date(now.getTime() - 90 * 86400000)),
readRows('analytics_presence_snapshots', 'sampled_at,online_players,active_players,active_rooms', 'sampled_at')
      ]);
      const sessions = allSessions.filter((session) => new Date(session.started_at).getTime() >= start.getTime());
      const phaseTwo = buildPhaseTwoMetrics({ sessions: allSessions, events, snapshots: presenceSnapshots, now });
      const distinctUsers = new Set(events.map((event) => event.firebase_uid).filter(Boolean));
      const sessionUsers = new Set(sessions.map((session) => session.firebase_uid).filter(Boolean));
      const userDays = new Map();
      const eventCounts = {};
      const daily = new Map();
      const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, label: String(hour).padStart(2, '0') + ':00', events: 0, users: new Set() }));
      const roomCounts = new Map();
      const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const todayUsers = new Set();
      const dateKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

      for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date(now.getTime() - offset * 86400000);
        daily.set(dateKey(date), { date: dateKey(date), label: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(date), events: 0, users: new Set() });
      }
      for (const event of events) {
        if (!event.firebase_uid || !event.occurred_at) continue;
        const date = new Date(event.occurred_at);
        if (!Number.isFinite(date.getTime())) continue;
        const day = dateKey(date);
        const bucket = daily.get(day);
        if (bucket) { bucket.events += 1; bucket.users.add(event.firebase_uid); }
        const hourParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(date);
        const hour = Number(hourParts);
        if (Number.isInteger(hour) && hourly[hour]) { hourly[hour].events += 1; hourly[hour].users.add(event.firebase_uid); }
        eventCounts[event.event_name] = (eventCounts[event.event_name] || 0) + 1;
        if (event.room_id) roomCounts.set(event.room_id, (roomCounts.get(event.room_id) || 0) + 1);
        if (day === todayKey) todayUsers.add(event.firebase_uid);
        if (!userDays.has(event.firebase_uid)) userDays.set(event.firebase_uid, new Set());
        userDays.get(event.firebase_uid).add(day);
      }
      const durations = sessions.map((session) => {
        const begin = new Date(session.started_at).getTime();
        const end = new Date(session.ended_at || session.last_seen_at).getTime();
        return Number.isFinite(begin) && Number.isFinite(end) && end >= begin ? Math.min(end - begin, 12 * 60 * 60 * 1000) : null;
      }).filter((duration) => duration !== null);
      const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
      const registeredUsers = new Set(sessions.filter((session) => !session.is_anonymous).map((session) => session.firebase_uid));
      const anonymousUsers = new Set(sessions.filter((session) => session.is_anonymous).map((session) => session.firebase_uid));
      const dailyRows = [...daily.values()].map((item) => ({ ...item, users: item.users.size }));
      const hourlyRows = hourly.map((item) => ({ ...item, users: item.users.size }));
      const peakHour = [...hourlyRows].sort((a, b) => b.users - a.users || b.events - a.events)[0];
      return sendJson(res, 200, {
        days,
        timezone: 'Asia/Kolkata',
        generatedAt: now.toISOString(),
        totals: {
          uniquePlayers: distinctUsers.size,
          playersToday: todayUsers.size,
          sessions: sessions.length,
          events: events.length,
          returningPlayers: [...userDays.values()].filter((dates) => dates.size > 1).length,
          registeredPlayers: registeredUsers.size,
          guestPlayers: anonymousUsers.size,
          averageSessionMinutes: durations.length ? Math.round(totalDuration / durations.length / 60000) : 0
        },
        daily: dailyRows,
        hourly: hourlyRows,
        peakHour: { label: peakHour.label, players: peakHour.users, events: peakHour.events },
        eventCounts,
        topRooms: [...roomCounts.entries()].map(([roomId, count]) => ({ roomId, events: count })).sort((a, b) => b.events - a.events).slice(0, 10),
        phaseTwo
      });
    } catch (error) {
      console.warn('[Insights] Could not build analytics report:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not build analytics report right now' });
    }
  }
  if (pathname === '/api/insights/track') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth, database } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (/^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) return sendJson(res, 403, { error: 'Automated accounts are not tracked' });
      if (!allowAnalyticsRequest(decoded.uid)) return sendJson(res, 429, { error: 'Analytics event limit reached. Try again shortly.' });

      const body = await readBody(req);
      const sessionId = String(body.sessionId || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
        return sendJson(res, 400, { error: 'Invalid analytics session' });
      }
      const action = String(body.action || '');
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) return sendJson(res, 503, { error: 'Analytics storage is not configured on the server' });

      const baseUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/';
      const headers = {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      };
      const sessionUrl = baseUrl + 'analytics_sessions';
      const sessionRow = {
        session_id: sessionId,
        firebase_uid: decoded.uid,
        is_anonymous: decoded.firebase?.sign_in_provider === 'anonymous',
        last_seen_at: new Date().toISOString(),
        ended_at: null
      };

      if (action === 'session_start') {
        const response = await fetch(sessionUrl + '?on_conflict=session_id', {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(sessionRow)
        });
        if (!response.ok) {
          console.warn('[Insights] Session insert failed:', response.status, (await response.text()).slice(0, 300));
          return sendJson(res, 502, { error: 'Could not create analytics session' });
        }
        return sendJson(res, 200, { ok: true });
      }

      // Every later action must belong to the authenticated Firebase user.
      const sessionLookup = new URL(sessionUrl, 'http://localhost');
      sessionLookup.searchParams.set('session_id', 'eq.' + sessionId);
      sessionLookup.searchParams.set('firebase_uid', 'eq.' + decoded.uid);
      sessionLookup.searchParams.set('select', 'session_id');
      const lookup = await fetch(sessionLookup, { headers });
      if (!lookup.ok) return sendJson(res, 502, { error: 'Could not verify analytics session' });
      const sessions = await lookup.json();
      if (!Array.isArray(sessions) || sessions.length === 0) return sendJson(res, 404, { error: 'Analytics session not found' });

      if (action === 'session_end') {
        const response = await fetch(sessionLookup, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ ended_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
        });
        if (!response.ok) return sendJson(res, 502, { error: 'Could not close analytics session' });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'heartbeat') {
        const response = await fetch(sessionLookup, {
          method: 'PATCH', headers,
          body: JSON.stringify({ last_seen_at: new Date().toISOString() })
        });
        if (!response.ok) return sendJson(res, 502, { error: 'Could not update analytics session' });
        return sendJson(res, 200, { ok: true });
      }

      const allowedEvents = new Set(['page_view', 'room_join', 'room_leave', 'auction_start', 'bid', 'chat_message', 'voice_join', 'voice_leave', 'room_created', 'auction_completed']);
      const eventName = String(body.eventName || '');
      if (action !== 'event' || !allowedEvents.has(eventName)) return sendJson(res, 400, { error: 'Invalid analytics event' });
      const roomId = body.roomId == null ? null : String(body.roomId).trim();
      if (roomId && !/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) return sendJson(res, 400, { error: 'Invalid room' });

      if (roomId) {
        const roomSnapshot = await database.ref('auctions/' + roomId + '/room').get();
        if (!roomSnapshot.exists()) return sendJson(res, 404, { error: 'Auction room not found' });
        const roomData = roomSnapshot.val() || {};
        const roster = Array.isArray(roomData.players) ? roomData.players : Object.values(roomData.players || {});
        const isMember = roomData.hostId === decoded.uid || roster.some((player) => player && (player.id === decoded.uid || player.userId === decoded.uid));
        if (!isMember) return sendJson(res, 403, { error: 'You are not a member of this room' });
      }

      const metadata = {};
      if (eventName === 'page_view' && typeof body.metadata?.path === 'string') {
        const safePath = body.metadata.path.split('?')[0].slice(0, 160);
        if (safePath.startsWith('/')) metadata.path = safePath;
      }
      // Browser locale provides only a rough country estimate. No IP address is stored or queried.
      if (typeof body.metadata?.countryEstimate === 'string' && /^[A-Z]{2}$/.test(body.metadata.countryEstimate)) {
        metadata.countryEstimate = body.metadata.countryEstimate;
      }
      const eventResponse = await fetch(baseUrl + 'analytics_events', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          firebase_uid: decoded.uid,
          event_name: eventName,
          room_id: roomId,
          metadata
        })
      });
      if (!eventResponse.ok) {
        console.warn('[Insights] Event insert failed:', eventResponse.status, (await eventResponse.text()).slice(0, 300));
        return sendJson(res, 502, { error: 'Could not record analytics event' });
      }
      await fetch(sessionLookup, {
        method: 'PATCH', headers,
        body: JSON.stringify({ last_seen_at: new Date().toISOString() })
      }).catch(() => {});
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      console.warn('[Insights] Tracking request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not record analytics activity' });
    }
  }
  if (pathname === '/api/room-activity') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth, database } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (/^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) return sendJson(res, 403, { error: 'Automated accounts cannot record activity' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) return sendJson(res, 400, { error: 'Invalid room' });
      const roomRef = database.ref(`auctions/${roomId}/room`);
      const roomSnapshot = await roomRef.get();
      if (!roomSnapshot.exists()) return sendJson(res, 404, { error: 'Auction room not found' });
      const roomData = roomSnapshot.val() || {};
      const roster = Array.isArray(roomData.players) ? roomData.players : Object.values(roomData.players || {});
      const isHost = roomData.hostId === decoded.uid;
      const isPlayer = roster.some((player) => player && (player.id === decoded.uid || player.userId === decoded.uid));
      if (!isHost && !isPlayer) return sendJson(res, 403, { error: 'You are not a member of this room' });
      await roomRef.update({ lastActivityAt: Date.now() });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      console.warn('[Room activity] Failed to record activity:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not record room activity' });
    }
  }
  if (pathname === '/api/voice-token') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in to use voice chat' });
      const { auth, database } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) return sendJson(res, 400, { error: 'Invalid room' });
      if (/^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) {
        return sendJson(res, 403, { error: 'Automated accounts cannot use voice chat' });
      }
      const roomSnapshot = await database.ref(`auctions/${roomId}/room`).get();
      if (!roomSnapshot.exists()) return sendJson(res, 404, { error: 'Auction room not found' });
      const roomData = roomSnapshot.val() || {};
      const roster = Array.isArray(roomData.players)
        ? roomData.players
        : Object.values(roomData.players || {});
      const rosterEntry = roster.find((player) => player && (player.id === decoded.uid || player.userId === decoded.uid));
      const isHost = roomData.hostId === decoded.uid;
      if (!isHost && !rosterEntry) return sendJson(res, 403, { error: 'You must join this auction before using voice chat' });
      if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        return sendJson(res, 503, { error: 'Voice chat is not configured on the server' });
      }
      const participantName = String(rosterEntry?.name || decoded.name || 'Player').trim().slice(0, 60);
      const { AccessToken } = await import('livekit-server-sdk');
      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity: decoded.uid,
        name: participantName,
        ttl: '1h'
      });
      token.addGrant({ roomJoin: true, room: 'auction-' + roomId, canPublish: true, canSubscribe: true });
      return sendJson(res, 200, { token: await token.toJwt(), url: process.env.LIVEKIT_URL, identity: decoded.uid });
    } catch (error) {
      console.error('[Voice] Token request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not start voice chat. Check server configuration.' });
    }
  }
  if (pathname === '/api/analyze-winner') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    if (!allowAnalysis(ip)) return sendJson(res, 429, { error: 'Too many AI analysis requests. Please wait a minute and try again.' });
    try {
      req.body = await readBody(req);
    } catch (error) {
      return sendJson(res, error.message === 'Request body too large' ? 413 : 400, { error: error.message });
    }
    const responseShim = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { sendJson(res, this.statusCode, body); return res; }
    };
    try {
      const result = await analyzeWinner(req, responseShim);
      if (result && !res.writableEnded) {
        sendJson(res, result.statusCode || 500, JSON.parse(result.body || '{}'));
      }
    } catch (error) {
      if (!res.writableEnded) sendJson(res, 500, { error: 'Internal server error' });
      console.error('API request failed:', error?.message || error);
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
  return serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Crick Auction server listening on port ${PORT}`);
  startRoomCleanup();
  startAnalyticsPresenceSnapshots();
});