// Modified from the upstream project by saiprasad00700.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import analyzeWinner from './api/analyze-winner.js';
import { buildPhaseTwoMetrics } from './api/analytics-phase2.js';
import { recordGuardianError, sanitizeGuardianInput } from './api/guardian.js';
import { authorizeWinnerAnalysis } from './api/winner-analysis-auth.js';
import { validateRtcAccount } from './api/voice-token-auth.js';

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

const guardianRequestsByIp = new Map();
const roomActivityRequestsByUid = new Map();
const analyticsRequestsByUid = new Map();
const MAX_ANALYTICS_REQUESTS_PER_MINUTE = 120;
const MAX_ROOM_ACTIVITY_REQUESTS_PER_MINUTE = 30;

function allowRoomActivityRequest(uid) {
  const now = Date.now();
  const recent = (roomActivityRequestsByUid.get(uid) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_ROOM_ACTIVITY_REQUESTS_PER_MINUTE) {
    roomActivityRequestsByUid.set(uid, recent);
    return false;
  }
  recent.push(now);
  roomActivityRequestsByUid.set(uid, recent);
  if (roomActivityRequestsByUid.size > 5000) {
    for (const [key, values] of roomActivityRequestsByUid) {
      if (!values.some((time) => now - time < WINDOW_MS)) roomActivityRequestsByUid.delete(key);
    }
  }
  return true;
}

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

// Billing-free allocator: estimate SS AUCTION workload from room reservations and
// legacy public rooms. This is a load estimate, NOT Firebase's exact storage usage.
const ALLOCATOR_PATH = 'ssAuctionCapacity/rooms';
const ROOM_LOAD_WEIGHTS = { mega: 1.5, sprint11: 0.8, sprint5: 0.45 };

function roomLoadWeight(auctionType) {
  return ROOM_LOAD_WEIGHTS[String(auctionType || 'mega').toLowerCase()] || 1;
}

async function getDatabaseForServer(serverId) {
  if (String(serverId) === '2') return (await getFirebaseServer2AdminServices()).database;
  if (String(serverId) === '3') return (await getFirebaseServer3AdminServices()).database;
  return (await getFirebaseAdminServices()).database;
}

async function getEstimatedServerLoad(serverId) {
  const database = await getDatabaseForServer(serverId);
  const [reservationsSnapshot, publicRoomsSnapshot] = await Promise.all([
    database.ref(ALLOCATOR_PATH).get(),
    database.ref('publicRooms').get()
  ]);
  const reservations = reservationsSnapshot.exists() ? reservationsSnapshot.val() || {} : {};
  const publicRooms = publicRoomsSnapshot.exists() ? publicRoomsSnapshot.val() || {} : {};
  const knownRoomIds = new Set(Object.keys(reservations));
  let estimatedUnits = 0;
  let trackedRooms = 0;
  for (const reservation of Object.values(reservations)) {
    if (!reservation || reservation.released === true) continue;
    estimatedUnits += Math.max(0.1, Number(reservation.weight) || roomLoadWeight(reservation.auctionType));
    trackedRooms += 1;
  }
  let legacyPublicRooms = 0;
  for (const [roomId, room] of Object.entries(publicRooms)) {
    if (knownRoomIds.has(roomId) || !room || !['waiting', 'active'].includes(String(room.status || 'waiting'))) continue;
    estimatedUnits += roomLoadWeight(room.auctionType);
    legacyPublicRooms += 1;
  }
  return {
    serverId: String(serverId),
    estimatedUnits: Number(estimatedUnits.toFixed(2)),
    trackedRooms,
    legacyPublicRooms,
    totalKnownRooms: trackedRooms + legacyPublicRooms
  };
}

async function reserveEstimatedRoom(serverId, roomId, auctionType) {
  if (!['1', '2', '3'].includes(String(serverId))) throw new Error('Invalid Firebase server selection');
  if (!/^[123][A-Z0-9]{4,12}$/.test(String(roomId))) throw new Error('Invalid room code for server reservation');
  const database = await getDatabaseForServer(serverId);
  const weight = roomLoadWeight(auctionType);
  const reservationRef = database.ref(ALLOCATOR_PATH + '/' + roomId);
  const result = await reservationRef.transaction((current) => current || {
    roomId,
    serverId: String(serverId),
    auctionType: String(auctionType || 'mega'),
    weight,
    createdAt: Date.now(),
    released: false
  });
  if (!result.committed) throw new Error('Could not reserve estimated server capacity');
  return { serverId: String(serverId), roomId, weight };
}

async function chooseAutomaticFirebaseServer() {
  // Prefer Server 3 for all new rooms. Server 2 is the fallback.
  // Server 1 remains readable for existing rooms but is intentionally excluded
  // from new automatic allocations because it has reached its usage limit.
  const priority = ['3', '2'];
  const checks = await Promise.all(priority.map(async (serverId) => {
    try {
      return { ...(await getEstimatedServerLoad(serverId)), available: true };
    } catch (error) {
      console.warn(`[Server allocator] Server ${serverId} load check failed:`, error?.message || error);
      return { serverId, estimatedUnits: Number.POSITIVE_INFINITY, available: false };
    }
  }));
  const selected = checks.find((server) => server.available);
  if (!selected) throw new Error('Server 3 and fallback Server 2 are currently unavailable for room allocation');
  return { serverId: selected.serverId, servers: checks };
}

let firebaseServer2AdminPromise;
async function getFirebaseServer2AdminServices() {
  if (!firebaseServer2AdminPromise) firebaseServer2AdminPromise = (async () => {
    const raw = process.env.SERVER2_FIREBASE_SERVICE_ACCOUNT_JSON;
    const databaseURL = process.env.SERVER2_FIREBASE_DATABASE_URL;
    if (!raw || !databaseURL) throw new Error('Server 2 is not configured');
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getDatabase } = await import('firebase-admin/database');
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.project_id !== 'ss-auction-server-2') throw new Error('Server 2 service account project mismatch');
    const appName = 'ss-auction-server-2';
    const app = getApps().find((item) => item.name === appName) ||
      initializeApp({ credential: cert(serviceAccount), databaseURL }, appName);
    return { auth: getAuth(app), database: getDatabase(app) };
  })();
  return firebaseServer2AdminPromise;
}

let firebaseServer3AdminPromise;
async function getFirebaseServer3AdminServices() {
  if (!firebaseServer3AdminPromise) firebaseServer3AdminPromise = (async () => {
    const raw = process.env.SERVER3_FIREBASE_SERVICE_ACCOUNT_JSON;
    const databaseURL = process.env.SERVER3_FIREBASE_DATABASE_URL;
    if (!raw || !databaseURL) throw new Error('Server 3 is not configured');
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getDatabase } = await import('firebase-admin/database');
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.project_id !== 'ss-auction-server-3') throw new Error('Server 3 service account project mismatch');
    const appName = 'ss-auction-server-3';
    const app = getApps().find((item) => item.name === appName) ||
      initializeApp({ credential: cert(serviceAccount), databaseURL }, appName);
    return { auth: getAuth(app), database: getDatabase(app) };
  })();
  return firebaseServer3AdminPromise;
}

// Remove any waiting or started room after 10 minutes without recorded activity.
const ROOM_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 60 * 1000;
let roomCleanupStarted = false;

async function cleanupAbandonedRooms() {
  try {
    const { database: primaryDatabase } = await getFirebaseAdminServices();
    const databases = [primaryDatabase];
    try {
      const { database: secondaryDatabase } = await getFirebaseServer2AdminServices();
      databases.push(secondaryDatabase);
    } catch (secondaryError) {
      console.warn('[Room cleanup] Server 2 cleanup is not configured yet:', secondaryError?.message || secondaryError);
    }
    try {
      const { database: tertiaryDatabase } = await getFirebaseServer3AdminServices();
      databases.push(tertiaryDatabase);
    } catch (tertiaryError) {
      console.warn('[Room cleanup] Server 3 cleanup is not configured yet:', tertiaryError?.message || tertiaryError);
    }
    for (const database of databases) {
      const auctionsSnapshot = await database.ref('auctions').get();
      if (!auctionsSnapshot.exists()) continue;
      const now = Date.now();
      const rooms = auctionsSnapshot.val() || {};

      for (const [roomId, roomNode] of Object.entries(rooms)) {
      const room = roomNode?.room;
      if (!room) continue;
      // Completed auctions have a separate 48-hour retention period.
      // Check both room and live status, because older clients may leave stale
      // live.status values after room.status has changed to completed.
      const roomStatus = String(room.status || '').toLowerCase();
      const liveStatus = String(roomNode?.live?.status || '').toLowerCase();
      const completionStamp = Number(
        room.completedAt ||
        room.winnerAnalysisCompletedAt ||
        roomNode?.live?.completedAt ||
        0
      );
      const isCompleted = roomStatus === 'completed' ||
        liveStatus === 'completed' ||
        room.winnerAnalysisStatus === 'completed' ||
        (Number.isFinite(completionStamp) && completionStamp > 0);
      const COMPLETED_ROOM_RETENTION_MS = 48 * 60 * 60 * 1000;

      if (isCompleted) {
        // Never delete a completed room without a reliable completion time.
        if (!Number.isFinite(completionStamp) || completionStamp <= 0) {
          console.warn('[Room cleanup] Completed room has no valid completedAt; preserving it:', roomId);
          continue;
        }
        if (now - completionStamp < COMPLETED_ROOM_RETENTION_MS) continue;
      } else {
        const status = liveStatus || roomStatus || 'waiting';
        const isWaiting = status === 'waiting';
        const isStarted = status === 'active' || status === 'started' || status === 'in_progress';
        if (!isWaiting && !isStarted) continue;

        // Presence heartbeats are intentionally excluded: players may remain
        // online without using the room, and must not prevent idle-room cleanup.
        const messageActivity = Object.values(roomNode?.messages || {}).reduce((latest, message) => {
          const stamp = Number(message?.timestamp || message?.createdAt || 0);
          return Number.isFinite(stamp) ? Math.max(latest, stamp) : latest;
        }, 0);
        const lastActivityAt = Math.max(
          Number(room.lastActivityAt || 0),
          Number(room.createdAt || 0),
          Number(roomNode?.live?.lastActivityAt || 0),
          messageActivity
        );
        // Do not guess when a legacy room has no trustworthy timestamp.
        if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) continue;
        if (now - lastActivityAt < ROOM_IDLE_TIMEOUT_MS) continue;
      }

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
      await database.ref(ALLOCATOR_PATH + '/' + roomId).remove().catch(() => {});
      console.log(isCompleted ? '[Room cleanup] Removed completed room after 48-hour retention:' : '[Room cleanup] Removed abandoned room after 10-minute inactivity:', roomId);
      }

      // Also remove stale public directory entries whose auction node no longer
      // exists. The landing page reads /publicRooms directly, so an orphan here
      // remains visible even after /auctions/{roomId} has been deleted.
      const publicRoomsSnapshot = await database.ref('publicRooms').get();
      if (publicRoomsSnapshot.exists()) {
        const publicRooms = publicRoomsSnapshot.val() || {};
        for (const [roomId, publicRoom] of Object.entries(publicRooms)) {
          if (!publicRoom || typeof publicRoom !== 'object') continue;
          const auctionNode = rooms[roomId];
          if (auctionNode) continue; // Never remove a directory entry while its auction node exists.
          const createdAt = Number(publicRoom.createdAt || publicRoom.lastActivityAt || 0);
          if (!Number.isFinite(createdAt) || createdAt <= 0 || now - createdAt < ROOM_IDLE_TIMEOUT_MS) continue;

          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !supabaseServiceKey) {
            console.warn('[Room cleanup] Skipped orphan directory cleanup: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
            continue;
          }
          const supabaseHeaders = {
            apikey: supabaseServiceKey,
            Authorization: 'Bearer ' + supabaseServiceKey,
            Prefer: 'return=minimal'
          };

          const teamsQuery = new URL('/rest/v1/teams', supabaseUrl);
          teamsQuery.searchParams.set('auction_id', 'eq.' + roomId);
          const teamsResponse = await fetch(teamsQuery, { method: 'DELETE', headers: supabaseHeaders });
          if (!teamsResponse.ok && teamsResponse.status !== 404) {
            const detail = (await teamsResponse.text()).slice(0, 300);
            console.warn('[Room cleanup] Orphan Supabase team cleanup failed for room', roomId, teamsResponse.status, detail);
            continue;
          }

          const auctionQuery = new URL('/rest/v1/auctions', supabaseUrl);
          auctionQuery.searchParams.set('id', 'eq.' + roomId);
          const auctionResponse = await fetch(auctionQuery, { method: 'DELETE', headers: supabaseHeaders });
          if (!auctionResponse.ok) {
            const detail = (await auctionResponse.text()).slice(0, 500);
            let errorBody = {};
            try { errorBody = JSON.parse(detail); } catch {}
            const tableMissing = auctionResponse.status === 404 && errorBody.code === 'PGRST205';
            if (!tableMissing) {
              console.warn('[Room cleanup] Orphan Supabase auction cleanup failed for room', roomId, auctionResponse.status, detail);
              continue;
            }
          }

          await database.ref('publicRooms/' + roomId).remove();
          await database.ref(ALLOCATOR_PATH + '/' + roomId).remove().catch(() => {});
          console.log('[Room cleanup] Removed orphan public room directory entry from Firebase:', roomId);
        }
      }
    }

    // Expire only the user's history references 48 hours after an auction is
    // completed. The archived auction/results data itself is left untouched.
    const HISTORY_RETENTION_MS = 48 * 60 * 60 * 1000;
    const historyIndexRef = primaryDatabase.ref('completedRoomHistory');
    const historyIndexSnapshot = await historyIndexRef.get();
    if (historyIndexSnapshot.exists()) {
      const historyIndex = historyIndexSnapshot.val() || {};
      const now = Date.now();
      for (const [roomId, entry] of Object.entries(historyIndex)) {
        const completedAt = Number(entry?.completedAt || 0);
        if (!Number.isFinite(completedAt) || completedAt <= 0 || now - completedAt < HISTORY_RETENTION_MS) continue;
        const users = entry?.users || {};
        await Promise.all(Object.keys(users).map((userId) =>
          primaryDatabase.ref('userAuctionHistory/' + userId + '/' + roomId).remove()
        ));
        await historyIndexRef.child(roomId).remove();
        console.log('[Room cleanup] Expired 48-hour history entries for room:', roomId);
      }
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
    let allAuctions = snapshot.exists() ? (snapshot.val() || {}) : {};
    try {
      const { database: secondaryDatabase } = await getFirebaseServer2AdminServices();
      const secondarySnapshot = await secondaryDatabase.ref('auctions').get();
      if (secondarySnapshot.exists()) allAuctions = { ...allAuctions, ...(secondarySnapshot.val() || {}) };
    } catch (secondaryError) {
      console.warn('[Analytics] Server 2 snapshot unavailable:', secondaryError?.message || secondaryError);
    }
    try {
      const { database: tertiaryDatabase } = await getFirebaseServer3AdminServices();
      const tertiarySnapshot = await tertiaryDatabase.ref('auctions').get();
      if (tertiarySnapshot.exists()) allAuctions = { ...allAuctions, ...(tertiarySnapshot.val() || {}) };
    } catch (tertiaryError) {
      console.warn('[Analytics] Server 3 snapshot unavailable:', tertiaryError?.message || tertiaryError);
    }
    const { buildLiveAnalyticsSnapshot } = await import('./api/analytics.js');
    const live = buildLiveAnalyticsSnapshot(allAuctions, Date.now());
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return;
    const response = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/analytics_presence_snapshots', {
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
  if (pathname === '/api/guardian/errors') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const expectedAdminEmail = String(process.env.ANALYTICS_ADMIN_EMAIL || '').trim().toLowerCase();
      if (!expectedAdminEmail) return sendJson(res, 503, { error: 'Guardian administrator is not configured' });
      const { auth } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (String(decoded.email || '').trim().toLowerCase() !== expectedAdminEmail || decoded.email_verified !== true || decoded.firebase?.sign_in_provider !== 'google.com') {
        return sendJson(res, 403, { error: 'You are not authorized to view Guardian' });
      }
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) return sendJson(res, 503, { error: 'Guardian storage is not configured' });
      const url = new URL('/rest/v1/guardian_errors', supabaseUrl);
      url.searchParams.set('select', 'id,operation,severity,message,room_id,source,status,created_at,resolved_at');
      url.searchParams.set('order', 'created_at.desc');
      url.searchParams.set('limit', '100');
      const response = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
      if (!response.ok) throw new Error('Guardian error query failed: ' + response.status);
      return sendJson(res, 200, { errors: await response.json() });
    } catch (error) {
      console.warn('[Guardian] Could not load error history:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not load Guardian error history' });
    }
  }
  if (pathname === '/api/guardian/report') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const now = Date.now();
    const recent = (guardianRequestsByIp.get(ip) || []).filter((time) => now - time < WINDOW_MS);
    if (recent.length >= 10) return sendJson(res, 429, { error: 'Guardian report limit reached' });
    recent.push(now);
    guardianRequestsByIp.set(ip, recent);
    try {
      const body = sanitizeGuardianInput(await readBody(req));
      if (!body.message) return sendJson(res, 400, { error: 'Error message is required' });
      const saved = await recordGuardianError({ ...body, source: 'browser' });
      return sendJson(res, 202, { ok: true, id: saved?.id || null });
    } catch (error) {
      console.warn('[Guardian] Could not record browser error:', error?.message || error);
      return sendJson(res, 503, { error: 'Guardian could not store this error' });
    }
  }
  if (pathname === '/api/server-capacity') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (!decoded?.uid || /^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) {
        return sendJson(res, 403, { error: 'This account cannot allocate auction rooms' });
      }
      const body = await readBody(req);
      let serverId = String(body.serverId || '');
      let roomId = '';
      let loadSnapshot = null;
      if (body.mode === 'allocate') {
        const suffix = String(body.roomSuffix || '').toUpperCase();
        if (!/^[A-Z0-9]{4,12}$/.test(suffix)) return sendJson(res, 400, { error: 'Invalid room code suffix' });
        const allocation = await chooseAutomaticFirebaseServer();
        serverId = allocation.serverId;
        roomId = serverId + suffix;
        loadSnapshot = allocation.servers;
      } else if (body.mode === 'reserve') {
        roomId = String(body.roomId || '').toUpperCase();
      } else {
        return sendJson(res, 400, { error: 'Unsupported allocator operation' });
      }
      const reservation = await reserveEstimatedRoom(serverId, roomId, body.auctionType);
      return sendJson(res, 200, {
        ok: true,
        serverId: reservation.serverId,
        roomId: reservation.roomId,
        estimatedWeight: reservation.weight,
        loads: loadSnapshot
      });
    } catch (error) {
      console.warn('[Server allocator] Request failed:', error?.message || error);
      return sendJson(res, 503, { error: error?.message || 'Automatic server allocation is temporarily unavailable' });
    }
  }
  if (pathname === '/api/server2-token') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth: primaryAuth } = await getFirebaseAdminServices();
      const decoded = await primaryAuth.verifyIdToken(authorization.slice(7));
      if (!decoded?.uid || /^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) {
        return sendJson(res, 403, { error: 'This account cannot access auction rooms' });
      }
      const { auth: server2Auth } = await getFirebaseServer2AdminServices();
      const customToken = await server2Auth.createCustomToken(decoded.uid);
      return sendJson(res, 200, { customToken });
    } catch (error) {
      console.error('[Server 2] Token bridge failed:', error?.message || error);
      return sendJson(res, 503, { error: 'Could not authenticate with Server 2' });
    }
  }
  if (pathname === '/api/server3-token') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth: primaryAuth } = await getFirebaseAdminServices();
      const decoded = await primaryAuth.verifyIdToken(authorization.slice(7));
      if (!decoded?.uid || /^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) return sendJson(res, 403, { error: 'This account cannot access auction rooms' });
      const { auth: server3Auth } = await getFirebaseServer3AdminServices();
      return sendJson(res, 200, { customToken: await server3Auth.createCustomToken(decoded.uid) });
    } catch (error) {
      console.error('[Server 3] Token bridge failed:', error?.message || error);
      return sendJson(res, 503, { error: 'Could not authenticate with Server 3' });
    }
  }
  if (pathname === '/api/auction-feedback') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (/^(bot[_-]|auctionbot[_-])/i.test(String(decoded.uid || ''))) {
        return sendJson(res, 403, { error: 'Bots are not allowed to submit feedback' });
      }
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const { database } = await getDatabaseForServer(body.serverId || '1');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) return sendJson(res, 400, { error: 'Invalid room' });

      const rating = body.rating == null || body.rating === '' ? null : Number(body.rating);
      if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
        return sendJson(res, 400, { error: 'Rating must be between 1 and 5 stars' });
      }
      const comment = String(body.comment || '').trim().slice(0, 2000);
      const roomSnapshot = await database.ref('auctions/' + roomId + '/room').get();
      if (!roomSnapshot.exists()) return sendJson(res, 404, { error: 'Auction room not found' });
      const roomData = roomSnapshot.val() || {};
      const roster = Array.isArray(roomData.players) ? roomData.players : Object.values(roomData.players || {});
      const member = roster.find((player) => player && (player.id === decoded.uid || player.userId === decoded.uid));
      const isHost = roomData.hostId === decoded.uid;
      if (member?.isBot) return sendJson(res, 403, { error: 'Bots are not allowed to submit feedback' });
      if (!isHost && !member) return sendJson(res, 403, { error: 'You are not a member of this auction room' });

      const teamsSnapshot = await database.ref('auctions/' + roomId + '/teams').get();
      const teams = teamsSnapshot.val() || {};
      const franchise = Object.values(teams).find((entry) => entry && entry.userId === decoded.uid);
      if (!franchise?.playingXI?.submittedAt) {
        return sendJson(res, 403, { error: 'Submit your Playing XI before sending post-auction feedback' });
      }
      const userName = String(member?.name || roomData.hostName || decoded.name || 'Guest').trim().slice(0, 80);
      const feedback = {
        roomId,
        userId: decoded.uid,
        userName,
        franchiseName: String(franchise?.teamName || franchise?.teamId || '').slice(0, 80),
        rating,
        comment,
        submittedAt: Date.now(),
        source: 'post-auction'
      };
      await database.ref('auctionFeedback/' + roomId + '/' + decoded.uid).set(feedback);

      let emailSent = false;
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.GUARDIAN_EMAIL_FROM || process.env.FEEDBACK_EMAIL_FROM;
      const to = 'ssauctionforall@gmail.com';
      if (apiKey && from) {
        const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const ratingText = rating === null ? 'Not provided' : rating + ' / 5';
        const html = '<h2>New SS AUCTION feedback</h2>' +
          '<p><strong>Room:</strong> ' + escapeHtml(roomId) + '</p>' +
          '<p><strong>User:</strong> ' + escapeHtml(userName) + '</p>' +
          '<p><strong>User ID:</strong> ' + escapeHtml(decoded.uid) + '</p>' +
          '<p><strong>Franchise:</strong> ' + escapeHtml(feedback.franchiseName || 'Spectator / no franchise') + '</p>' +
          '<p><strong>Rating:</strong> ' + ratingText + '</p>' +
          '<p><strong>Suggestions:</strong><br>' + escapeHtml(comment || 'No comment provided').replace(/\n/g, '<br>') + '</p>' +
          '<p><strong>Submitted:</strong> ' + new Date(feedback.submittedAt).toISOString() + '</p>';
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject: '[SS AUCTION] New game feedback - ' + roomId, html })
        });
        if (!emailResponse.ok) {
          console.warn('[Feedback] Email delivery failed:', emailResponse.status, (await emailResponse.text()).slice(0, 300));
        } else {
          emailSent = true;
        }
      }
      return sendJson(res, 200, { ok: true, emailSent });
    } catch (error) {
      console.warn('[Feedback] Could not save auction feedback:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not submit feedback right now' });
    }
  }
  if (pathname === '/api/settle-sale') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const serverId = String(body.serverId || '1');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId) || !['1','2','3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid room/server' });
      const expectedServer = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      if (serverId !== expectedServer) return sendJson(res, 400, { error: 'Room server does not match room code' });
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      const decoded = await services.auth.verifyIdToken(authorization.slice(7));
      const uid = decoded.uid;
      if (!uid || /^(bot[_-]|auctionbot[_-])/i.test(uid)) return sendJson(res, 403, { error: 'Automated accounts cannot request settlement recovery' });
      if (!allowRoomActivityRequest(uid)) return sendJson(res, 429, { error: 'Settlement request limit reached. Please wait before retrying.' });
      const database = services.database;
      const roomRef = database.ref(`auctions/${roomId}/room`);
      const liveRef = database.ref(`auctions/${roomId}/live`);
      const roomSnap = await roomRef.get();
      const liveSnap = await liveRef.get();
      if (!roomSnap.exists() || !liveSnap.exists()) return sendJson(res, 404, { error: 'Room or live state not found' });
      const room = roomSnap.val();
      const live = liveSnap.val();
      const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
      if (!roster.some((p) => p && (p.id === uid || p.userId === uid) && !p.isBot)) return sendJson(res, 403, { error: 'Room participant required' });
      const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : Object.keys(room.bannedPlayers || {}).filter((key) => room.bannedPlayers[key] === true);
      if (banned.includes(uid)) return sendJson(res, 403, { error: 'You are banned from this room' });
      const { IPL_PLAYERS } = await import('./src/data/players.js');
      const { validateSaleSettlement } = await import('./api/sale-settlement-auth.js');
      const teamRef = database.ref(`auctions/${roomId}/teams/${roomId}_${live.highBidderId}`);
      const teamSnap = await teamRef.get();
      const existingTeam = teamSnap.exists() ? teamSnap.val() : null;
      const validation = validateSaleSettlement({ room, live, team: existingTeam, players: IPL_PLAYERS });
      if (!validation.allowed) return sendJson(res, validation.status, { error: 'Sale settlement is not valid for the current auction state', reason: validation.reason });
      const player = IPL_PLAYERS.find((p) => p.id === validation.playerId);
      const teamName = String(body.teamName || live.highBidderName || 'Unknown').slice(0, 80);
      const defaultBudget = Number(room.settings?.budget ?? 120);
      const retentionCardsDefault = 2;
      const transaction = await teamRef.transaction((currentTeam) => {
        const team = currentTeam || {};
        const squad = Array.isArray(team.squad) ? team.squad : [];
        if (squad.some((item) => (typeof item === 'string' ? item : item?.id) === validation.playerId)) return;
        if (squad.length >= Number(room.squadLimit || 25)) return;
        const overseasLimit = Number(room.overseasLimit || 8);
        const overseasCount = squad.reduce((count, item) => {
          const squadPlayerId = typeof item === 'string' ? item : item?.id;
          const squadPlayer = IPL_PLAYERS.find((candidate) => candidate.id === squadPlayerId);
          return count + (squadPlayer && squadPlayer.country !== 'IND' ? 1 : 0);
        }, 0);
        if (player.country !== 'IND' && overseasCount >= overseasLimit) return;
        const remaining = Number(team.budgetRemaining ?? defaultBudget);
        if (remaining < validation.bid) return;
        if (validation.retained && Number(team.retentionCardsRemaining ?? retentionCardsDefault) < 1) return;
        return {
          ...team,
          auctionId: roomId,
          userId: validation.uid,
          teamId: validation.teamId,
          teamName,
          budgetRemaining: Math.max(0, remaining - validation.bid),
          spent: Number(team.spent || 0) + validation.bid,
          retentionCardsRemaining: validation.retained
            ? Math.max(0, Number(team.retentionCardsRemaining ?? retentionCardsDefault) - 1)
            : Number(team.retentionCardsRemaining ?? retentionCardsDefault),
          squad: [...squad, { id: validation.playerId, bid: validation.bid, rtmUsed: validation.retained }]
        };
      });
      if (!transaction.committed) {
        const latest = transaction.snapshot?.val();
        if (latest?.squad?.some((item) => (typeof item === 'string' ? item : item?.id) === validation.playerId)) {
          return sendJson(res, 200, { ok: true, applied: false, alreadySettled: true, team: latest });
        }
        return sendJson(res, 409, { error: 'Sale settlement could not be applied. Team limits or budget may have changed.' });
      }
      return sendJson(res, 200, { ok: true, applied: true, team: transaction.snapshot.val() });
    } catch (error) {
      console.warn('[Sale settlement] Request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not settle sale securely' });
    }
  }
  if (pathname === '/api/retention-finalize') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const serverId = String(body.serverId || '1');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId) || !['1','2','3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid room/server' });
      const expectedServer = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      if (serverId !== expectedServer) return sendJson(res, 400, { error: 'Room server does not match room code' });
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      const decoded = await services.auth.verifyIdToken(authorization.slice(7));
      const uid = decoded.uid;
      if (!uid || /^(bot[_-]|auctionbot[_-])/i.test(uid)) return sendJson(res, 403, { error: 'Automated accounts cannot finalize RTM offers' });
      if (!allowRoomActivityRequest(uid)) return sendJson(res, 429, { error: 'RTM finalize request limit reached. Please wait before retrying.' });
      const database = services.database;
      const roomRef = database.ref(`auctions/${roomId}/room`);
      const liveRef = database.ref(`auctions/${roomId}/live`);
      const roomSnap = await roomRef.get();
      if (!roomSnap.exists()) return sendJson(res, 404, { error: 'Room not found' });
      const room = roomSnap.val();
      const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
      if (!roster.some((p) => p && (p.id === uid || p.userId === uid) && !p.isBot)) return sendJson(res, 403, { error: 'Room participant required' });
      const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : Object.keys(room.bannedPlayers || {}).filter((key) => room.bannedPlayers[key] === true);
      if (banned.includes(uid)) return sendJson(res, 403, { error: 'You are banned from this room' });
      const { resolveRetentionOffer } = await import('./api/retention-finalize-auth.js');
      let reason = null;
      const tx = await liveRef.transaction((current) => {
        const result = resolveRetentionOffer({ live: current, now: Date.now() });
        if (!result.allowed) { reason = result.reason; return; }
        return result.live;
      });
      if (!tx.committed) {
        return sendJson(res, 409, { error: reason === 'window_open' ? 'The RTM decision window is still open.' : 'RTM finalization was not committed.', reason: reason || 'transaction_not_committed' });
      }
      return sendJson(res, 200, { ok: true, live: tx.snapshot.val() });
    } catch (error) {
      console.warn('[RTM finalize] Request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not finalize RTM securely' });
    }
  }
  if (pathname === '/api/retention-counter-bid') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const serverId = String(body.serverId || '1');
      const amount = Number(body.amount);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId) || !['1','2','3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid room/server' });
      const expectedServer = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      if (serverId !== expectedServer) return sendJson(res, 400, { error: 'Room server does not match room code' });
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      const decoded = await services.auth.verifyIdToken(authorization.slice(7));
      const uid = decoded.uid;
      if (!uid || /^(bot[_-]|auctionbot[_-])/i.test(uid)) return sendJson(res, 403, { error: 'Automated accounts cannot submit counter-bids' });
      if (!allowRoomActivityRequest(uid)) return sendJson(res, 429, { error: 'RTM request limit reached. Please wait before retrying.' });
      const database = services.database;
      const roomRef = database.ref(`auctions/${roomId}/room`);
      const liveRef = database.ref(`auctions/${roomId}/live`);
      const teamRef = database.ref(`auctions/${roomId}/teams/${roomId}_${uid}`);
      const [roomSnap, teamSnap] = await Promise.all([roomRef.get(), teamRef.get()]);
      if (!roomSnap.exists()) return sendJson(res, 404, { error: 'Room not found' });
      const room = roomSnap.val();
      const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
      if (!roster.some((p) => p && (p.id === uid || p.userId === uid) && !p.isBot)) return sendJson(res, 403, { error: 'Room participant required' });
      const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : Object.keys(room.bannedPlayers || {}).filter((key) => room.bannedPlayers[key] === true);
      if (banned.includes(uid)) return sendJson(res, 403, { error: 'You are banned from this room' });
      const team = teamSnap.exists() ? teamSnap.val() : null;
      const { validateRetentionCounterBid } = await import('./api/retention-counter-auth.js');
      const now = Date.now();
      const validation = validateRetentionCounterBid({ offer: (await liveRef.get()).val()?.retentionOffer, uid, amount, team, now });
      if (!validation.allowed) return sendJson(res, validation.status, { error: validation.reason === 'insufficient_budget' ? 'Counter-bid exceeds your remaining budget.' : validation.reason === 'offer_expired' ? 'The counter-bid window has expired.' : 'Counter-bid is not valid for the current RTM stage.', reason: validation.reason });
      const transaction = await liveRef.transaction((current) => {
        if (!current || current.status !== 'processing_sale') return;
        const offer = current.retentionOffer;
        const currentValidation = validateRetentionCounterBid({ offer, uid, amount, team, now: Date.now() });
        if (!currentValidation.allowed || currentValidation.counterBid !== validation.counterBid) return;
        offer.counterBid = currentValidation.counterBid;
        offer.phase = 'match_decision';
        offer.decision = null;
        offer.expiresAt = Date.now() + 10000;
        current.currentBid = currentValidation.counterBid;
        return current;
      });
      if (!transaction.committed) return sendJson(res, 409, { error: 'Counter-bid was not saved. The RTM window may have changed or expired.' });
      return sendJson(res, 200, { ok: true, roomId, counterBid: validation.counterBid, expiresAt: transaction.snapshot.val()?.retentionOffer?.expiresAt });
    } catch (error) {
      console.warn('[RTM counter-bid] Request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not submit counter-bid securely' });
    }
  }
  if (pathname === '/api/retention-decision') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const serverId = String(body.serverId || '1');
      const decisionValue = String(body.decision || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId) || !['1','2','3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid room/server' });
      const expectedServer = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      if (serverId !== expectedServer) return sendJson(res, 400, { error: 'Room server does not match room code' });
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      const decoded = await services.auth.verifyIdToken(authorization.slice(7));
      const uid = decoded.uid;
      if (!uid || /^(bot[_-]|auctionbot[_-])/i.test(uid)) return sendJson(res, 403, { error: 'Automated accounts cannot make RTM decisions' });
      if (!allowRoomActivityRequest(uid)) return sendJson(res, 429, { error: 'RTM request limit reached. Please wait before retrying.' });
      const database = services.database;
      const roomRef = database.ref(`auctions/${roomId}/room`);
      const liveRef = database.ref(`auctions/${roomId}/live`);
      const roomSnap = await roomRef.get();
      if (!roomSnap.exists()) return sendJson(res, 404, { error: 'Room not found' });
      const room = roomSnap.val();
      const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
      if (!roster.some((p) => p && (p.id === uid || p.userId === uid) && !p.isBot)) return sendJson(res, 403, { error: 'Room participant required' });
      const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : Object.keys(room.bannedPlayers || {}).filter((key) => room.bannedPlayers[key] === true);
      if (banned.includes(uid)) return sendJson(res, 403, { error: 'You are banned from this room' });
      const { validateRetentionDecision } = await import('./api/retention-decision-auth.js');
      const now = Date.now();
      let decisionError = null;
      const transaction = await liveRef.transaction((current) => {
        if (!current || current.status !== 'processing_sale') return;
        const offer = current.retentionOffer;
        const validation = validateRetentionDecision({ offer, uid, decision: decisionValue, now });
        if (!validation.allowed) { decisionError = validation.reason; return; }
        if (offer.phase === 'initial_decision' && decisionValue === 'accept') {
          offer.rtmUsed = true;
          offer.phase = 'counter_bid';
          offer.decision = 'accept';
          offer.decidedBy = uid;
          offer.decidedAt = validation.now;
          offer.expiresAt = validation.now + 15000;
        } else {
          offer.decision = decisionValue;
          offer.decidedBy = uid;
          offer.decidedAt = validation.now;
        }
        return current;
      });
      if (!transaction.committed) return sendJson(res, 409, { error: decisionError === 'offer_expired' ? 'The RTM offer has expired.' : 'Your RTM decision was not saved. Please try again if the offer is still open.', reason: decisionError || 'transaction_not_committed' });
      return sendJson(res, 200, { ok: true, roomId, decision: decisionValue, phase: transaction.snapshot.val()?.retentionOffer?.phase });
    } catch (error) {
      console.warn('[RTM decision] Request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not save RTM decision securely' });
    }
  }
  if (pathname === '/api/place-bid') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const serverId = String(body.serverId || '1');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId) || !['1','2','3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid room/server' });
      const expectedServer = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      if (serverId !== expectedServer) return sendJson(res, 400, { error: 'Room server does not match room code' });
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      const decoded = await services.auth.verifyIdToken(authorization.slice(7));
      const uid = decoded.uid;
      if (!uid || /^(bot[_-]|auctionbot[_-])/i.test(uid)) return sendJson(res, 403, { error: 'Automated accounts cannot place user bids' });
      if (!allowRoomActivityRequest(uid)) return sendJson(res, 429, { error: 'Bid request limit reached. Please wait before retrying.' });
      const database = services.database;
      const roomRef = database.ref(`auctions/${roomId}/room`);
      const liveRef = database.ref(`auctions/${roomId}/live`);
      const teamRef = database.ref(`auctions/${roomId}/teams/${roomId}_${uid}`);
      const [roomSnap, liveSnap, teamSnap] = await Promise.all([roomRef.get(), liveRef.get(), teamRef.get()]);
      if (!roomSnap.exists() || !liveSnap.exists()) return sendJson(res, 404, { error: 'Room or live auction state not found' });
      const room = roomSnap.val();
      const live = liveSnap.val();
      const team = teamSnap.exists() ? teamSnap.val() : null;
      const { IPL_PLAYERS } = await import('./src/data/players.js');
      const { getNextBidAmount } = await import('./src/lib/auctionRules.js');
      const { validateBidRequest } = await import('./api/bid-auth.js');
      const decision = validateBidRequest({
        room, live, team, uid, now: Date.now(), players: IPL_PLAYERS,
        nextBidAmount: (currentBid, player) => getNextBidAmount(currentBid, player.basePrice || 0, player.set)
      });
      if (!decision.allowed) {
        const messages = {
          participant_required: 'You must be a participant to bid.',
          banned: 'You have been removed from this auction and cannot bid.',
          auction_not_bidding: 'Auction is not accepting bids right now.',
          already_high_bidder: 'You are already the highest bidder.',
          bid_timer_expired: 'The bid timer has expired.',
          team_record_mismatch: 'Your franchise team record could not be verified.',
          current_player_unknown: 'Current player could not be verified.',
          squad_limit: 'You have reached your squad limit.',
          overseas_limit: 'You have reached the overseas player limit.',
          insufficient_budget: 'Insufficient budget to place this bid.'
        };
        return sendJson(res, decision.status, { error: messages[decision.reason] || 'Bid validation failed', reason: decision.reason });
      }
      const transaction = await liveRef.transaction((currentData) => {
        if (!currentData || currentData.status !== 'bidding' || currentData.highBidderId === uid) return;
        const now = Date.now();
        if (currentData.timerEndsAt && now >= Number(currentData.timerEndsAt)) return;
        const player = IPL_PLAYERS.find((p) => p.id === currentData.playerId);
        if (!player || player.id !== live.playerId) return;
        const amount = getNextBidAmount(currentData.currentBid || 0, player.basePrice || 0, player.set);
        if (amount !== decision.amount || amount > Number(team.budgetRemaining || 0)) return;
        currentData.currentBid = amount;
        currentData.highBidderId = uid;
        currentData.highBidderName = String(decoded.name || decoded.displayName || body.name || 'Manager').slice(0, 60);
        currentData.highBidderTeamId = team.teamId;
        currentData.timerEndsAt = now + Number(room.settings?.bidTimer || 15) * 1000;
        currentData.lastActivityAt = now;
        return currentData;
      });
      if (!transaction.committed) return sendJson(res, 409, { error: 'Bid failed: another manager bid, the timer expired, or the state changed.' });
      return sendJson(res, 200, { ok: true, roomId, amount: transaction.snapshot.val()?.currentBid, highBidderId: uid, timerEndsAt: transaction.snapshot.val()?.timerEndsAt });
    } catch (error) {
      console.warn('[Place bid] Request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not place bid securely' });
    }
  }
  if (pathname === '/api/room-join') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const serverId = String(body.serverId || '1');
      const teamId = String(body.teamId || '').trim().toUpperCase();
      const name = String(body.name || 'Manager').trim().slice(0, 40);
      const teamNames = { MI: 'Mumbai Indians', CSK: 'Chennai Super Kings', RCB: 'Royal Challengers Bengaluru', KKR: 'Kolkata Knight Riders', DC: 'Delhi Capitals', PBKS: 'Punjab Kings', RR: 'Rajasthan Royals', SRH: 'Sunrisers Hyderabad', LSG: 'Lucknow Super Giants', GT: 'Gujarat Titans' };
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId) || !['1','2','3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid room/server' });
      const expectedServer = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      if (serverId !== expectedServer) return sendJson(res, 400, { error: 'Room server does not match room code' });
      if (!teamNames[teamId]) return sendJson(res, 400, { error: 'Invalid franchise selection' });
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      const decoded = await services.auth.verifyIdToken(authorization.slice(7));
      const uid = decoded.uid;
      if (!uid || /^(bot[_-]|auctionbot[_-])/i.test(uid)) return sendJson(res, 403, { error: 'Automated accounts cannot join as participants' });
      if (!allowRoomActivityRequest(uid)) return sendJson(res, 429, { error: 'Room join request limit reached. Please wait before retrying.' });
      const database = services.database;
      const roomRef = database.ref(`auctions/${roomId}/room`);
      const { validateRoomJoin, buildJoinedRoom } = await import('./api/room-join-policy.js');
      const bannedSnapshot = await database.ref(`auctions/${roomId}/room/bannedPlayers`).get();
      const bannedRaw = bannedSnapshot.exists() ? bannedSnapshot.val() : [];
      const bannedPlayers = Array.isArray(bannedRaw) ? bannedRaw : Object.keys(bannedRaw || {}).filter((key) => bannedRaw[key] === true);
      const transaction = await roomRef.transaction((currentRoom) => {
        if (!currentRoom) return;
        const currentBans = currentRoom?.bannedPlayers || bannedPlayers;
        const decision = validateRoomJoin({ room: currentRoom, uid, teamId, bannedPlayers: currentBans });
        if (!decision.allowed) return;
        const built = buildJoinedRoom({ room: currentRoom, uid, name, teamId, teamName: teamNames[teamId] });
        return { ...currentRoom, players: built.roster, lastActivityAt: Date.now() };
      });
      if (!transaction.committed) {
        const current = transaction.snapshot.val();
        const currentBans = current?.bannedPlayers || bannedPlayers;
        const decision = validateRoomJoin({ room: current, uid, teamId, bannedPlayers: currentBans });
        return sendJson(res, decision.status, { error: decision.reason });
      }
      // Team creation is idempotent and separate from the roster transaction.
      // Existing team purse/squad state is never overwritten on reconnect.
      const teamKey = `${roomId}_${uid}`;
      const teamRef = database.ref(`auctions/${roomId}/teams/${teamKey}`);
      const teamTransaction = await teamRef.transaction((existingTeam) => {
        if (existingTeam) return existingTeam.teamId === teamId ? existingTeam : undefined;
        return {
          auctionId: roomId, userId: uid, teamId, teamName: teamNames[teamId],
          budgetRemaining: Number(transaction.snapshot.val()?.settings?.budget || 120),
          spent: 0, squad: [], retentionCardsRemaining: 2
        };
      });
      if (!teamTransaction.committed || teamTransaction.snapshot.val()?.teamId !== teamId) {
        return sendJson(res, 409, { error: 'Existing team record does not match the selected franchise' });
      }
      return sendJson(res, 200, { ok: true, player: (transaction.snapshot.val()?.players || []).find((p) => p?.id === uid), serverId });
    } catch (error) {
      console.warn('[Room join] Transaction failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not join room securely' });
    }
  }
  if (pathname === '/api/room-bots') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const serverId = String(body.serverId || '1');
      const action = String(body.action || '').trim();
      const value = String(body.value || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId) || !['1','2','3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid room/server' });
      const expectedServer = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      if (serverId !== expectedServer) return sendJson(res, 400, { error: 'Room server does not match room code' });
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      const decoded = await services.auth.verifyIdToken(authorization.slice(7));
      const uid = decoded.uid;
      if (!uid || /^(bot[_-]|auctionbot[_-])/i.test(uid)) return sendJson(res, 403, { error: 'Automated accounts cannot manage bot teams' });
      if (!allowRoomActivityRequest(uid)) return sendJson(res, 429, { error: 'Bot management request limit reached. Please wait before retrying.' });
      if (!['add','remove','fill'].includes(action)) return sendJson(res, 400, { error: 'Invalid bot management action' });
      const teamNames = { MI: 'Mumbai Indians', CSK: 'Chennai Super Kings', RCB: 'Royal Challengers Bengaluru', KKR: 'Kolkata Knight Riders', DC: 'Delhi Capitals', PBKS: 'Punjab Kings', RR: 'Rajasthan Royals', SRH: 'Sunrisers Hyderabad', GT: 'Gujarat Titans', LSG: 'Lucknow Super Giants' };
      const database = services.database;
      const roomRef = database.ref(`auctions/${roomId}/room`);
      let selectedTeamId = '';
      let removedBotId = '';
      let createdBotTeamIds = [];
      const transaction = await roomRef.transaction((room) => {
        if (!room || room.hostId !== uid || room.status !== 'waiting') return;
        const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
        if (action === 'add') {
          const teamId = value.toUpperCase();
          if (!teamNames[teamId]) return;
          selectedTeamId = teamId;
          const botId = `bot_${teamId}`;
          if (roster.some((p) => p?.id === botId || p?.team === teamId)) return;
          return { ...room, players: [...roster, { id: botId, name: `${teamNames[teamId]} Bot`, team: teamId, teamName: teamNames[teamId], isHost: false, isBot: true }], lastActivityAt: Date.now() };
        }
        if (action === 'fill') {
          createdBotTeamIds = [];
          const taken = new Set(roster.map((p) => p?.team).filter(Boolean));
          const newPlayers = [...roster];
          for (const teamId of Object.keys(teamNames)) {
            if (taken.has(teamId)) continue;
            const botId = `bot_${teamId}`;
            newPlayers.push({ id: botId, name: `${teamNames[teamId]} Bot`, team: teamId, teamName: teamNames[teamId], isHost: false, isBot: true });
            createdBotTeamIds.push(teamId);
            taken.add(teamId);
          }
          return { ...room, players: newPlayers, lastActivityAt: Date.now() };
        }
        if (action === 'remove') {
          if (!/^bot_[A-Z]{2,4}$/.test(value)) return;
          const target = roster.find((p) => p?.id === value && p?.isBot === true);
          if (!target) return;
          removedBotId = value;
          return { ...room, players: roster.filter((p) => p?.id !== value), lastActivityAt: Date.now() };
        }
      });
      if (!transaction.committed) {
        const room = transaction.snapshot.val();
        if (!room) return sendJson(res, 404, { error: 'Auction room not found' });
        if (room.hostId !== uid) return sendJson(res, 403, { error: 'Only the host can manage bot teams' });
        if (room.status !== 'waiting') return sendJson(res, 409, { error: 'Bot teams can only be managed before the auction starts' });
        return sendJson(res, 409, { error: action === 'add' ? 'Franchise is already claimed' : action === 'remove' ? 'Bot not found' : 'Could not fill empty franchises' });
      }
      const finalRoom = transaction.snapshot.val() || {};
      const roster = Array.isArray(finalRoom.players) ? finalRoom.players : Object.values(finalRoom.players || {});
      const teamsRef = database.ref(`auctions/${roomId}/teams`);
      const teamUpdates = {};
      const teamsToInitialize = action === 'add' && selectedTeamId ? [selectedTeamId] : action === 'fill' ? roster.filter((player) => player?.isBot === true && /^bot_[A-Z]{2,4}$/.test(String(player.id || ''))).map((player) => String(player.team || '').toUpperCase()).filter((teamId) => teamNames[teamId]) : [];
      for (const teamId of teamsToInitialize) {
        const botId = `bot_${teamId}`;
        const botTeamRef = teamsRef.child(`${roomId}_${botId}`);
        await botTeamRef.transaction((existingTeam) => existingTeam || ({
          auctionId: roomId, userId: botId, teamId, teamName: teamNames[teamId],
          budgetRemaining: Number(finalRoom.settings?.budget || 120), spent: 0, squad: [], retentionCardsRemaining: 2
        }));
      }
      if (action === 'remove' && removedBotId) await teamsRef.child(`${roomId}_${removedBotId}`).remove();
      return sendJson(res, 200, { ok: true, action, roomId });
    } catch (error) {
      console.warn('[Room bots] Mutation failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not manage bot teams securely' });
    }
  }
  if (pathname === '/api/room-activity') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
      const { auth } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (/^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) return sendJson(res, 403, { error: 'Automated accounts cannot record activity' });
      if (!allowRoomActivityRequest(decoded.uid)) return sendJson(res, 429, { error: 'Room activity update limit reached. Please wait before retrying.' });
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const { database } = await getDatabaseForServer(body.serverId || '1');
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
  if (pathname === '/api/agora-voice-token') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    try {
      const authorization = String(req.headers.authorization || '');
      if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in to use voice chat' });
      const { auth } = await getFirebaseAdminServices();
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      const body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      const rtcAccount = String(body.rtcAccount || '').trim();
      const serverId = String(body.serverId || '1');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) return sendJson(res, 400, { error: 'Invalid room' });
      if (!/^[A-Za-z0-9_-]{1,255}$/.test(rtcAccount)) return sendJson(res, 400, { error: 'Invalid voice participant ID' });
      const rtcIdentityCheck = validateRtcAccount({ uid: decoded.uid, rtcAccount });
      if (!rtcIdentityCheck.allowed) return sendJson(res, 403, { error: 'Voice identity must match your authenticated account' });
      if (!['1', '2', '3'].includes(serverId)) return sendJson(res, 400, { error: 'Invalid server selection' });
      if (/^(bot[_-]|auctionbot[_-])/i.test(decoded.uid)) return sendJson(res, 403, { error: 'Automated accounts cannot use voice chat' });

      const { database } = await getDatabaseForServer(serverId);
      const roomSnapshot = await database.ref(`auctions/${roomId}/room`).get();
      if (!roomSnapshot.exists()) return sendJson(res, 404, { error: 'Auction room not found' });
      const roomData = roomSnapshot.val() || {};
      const roster = Array.isArray(roomData.players) ? roomData.players : Object.values(roomData.players || {});
      const rosterEntry = roster.find((player) => player && (player.id === decoded.uid || player.userId === decoded.uid));
      const isHost = roomData.hostId === decoded.uid;
      if (!isHost && !rosterEntry) return sendJson(res, 403, { error: 'You must join this auction before using voice chat' });

      const appId = String(process.env.AGORA_APP_ID || '').trim();
      const certificate = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
      const publicAppId = String(process.env.VITE_AGORA_APP_ID || '').trim();
      if (!appId || !certificate || (publicAppId && publicAppId !== appId)) {
        return sendJson(res, 503, { error: 'Agora voice chat is not configured correctly on this server' });
      }

      // Reserve five participant-minutes per short-lived token. The 8,000-minute
      // application cap leaves a 20% safety buffer below Agora's published 10,000
      // free-minute allowance. The transaction is shared through primary Firebase
      // so both Render servers consume one common budget.
      const monthKey = new Date().toISOString().slice(0, 7);
      const usageRef = (await getFirebaseAdminServices()).database.ref('agoraVoiceUsage/' + monthKey);
      const blockMinutes = 5;
      const applicationLimitMinutes = 8000;
      const reservation = await usageRef.transaction((current) => {
        const usage = current || { reservedMinutes: 0, updatedAt: Date.now() };
        const reservedMinutes = Math.max(0, Number(usage.reservedMinutes) || 0);
        if (reservedMinutes + blockMinutes > applicationLimitMinutes) return;
        return { ...usage, reservedMinutes: reservedMinutes + blockMinutes, updatedAt: Date.now() };
      });
      if (!reservation.committed) {
        return sendJson(res, 429, {
          error: 'SS AUCTION monthly free voice allowance has been reached. Voice chat will be available again next month.',
          code: 'AGORA_FREE_LIMIT_REACHED',
          limitMinutes: applicationLimitMinutes
        });
      }

      const channelName = 'ssauction-' + roomId;
      const tokenExpirationSeconds = 300;
      const privilegeExpirationSeconds = 300;
      const agoraToken = await import('agora-token');
      const RtcTokenBuilder = agoraToken.RtcTokenBuilder || agoraToken.default?.RtcTokenBuilder;
      const RtcRole = agoraToken.RtcRole || agoraToken.Role || agoraToken.default?.RtcRole || agoraToken.default?.Role;
      if (!RtcTokenBuilder || !RtcRole) throw new Error('Agora token builder is unavailable');
      const token = RtcTokenBuilder.buildTokenWithUserAccount(
        appId, certificate, channelName, rtcAccount, RtcRole.PUBLISHER,
        tokenExpirationSeconds, privilegeExpirationSeconds
      );
      return sendJson(res, 200, {
        appId, channelName, token, uid: rtcAccount,
        expiresIn: tokenExpirationSeconds,
        reservedMinutes: Number(reservation.snapshot.val()?.reservedMinutes || 0),
        limitMinutes: applicationLimitMinutes
      });
    } catch (error) {
      console.error('[Agora Voice] Token request failed:', error?.message || error);
      return sendJson(res, 500, { error: 'Could not start voice chat. Check Agora server configuration.' });
    }
  }
  if (pathname === '/api/analyze-winner') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    if (!allowAnalysis(ip)) return sendJson(res, 429, { error: 'Too many AI analysis requests. Please wait a minute and try again.' });
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Sign in required' });
    let decoded;
    let body;
    let serverId;
    let database;
    try {
      body = await readBody(req);
      const roomId = String(body.roomId || '').trim();
      if (!/^[123][A-Z0-9]{4,12}$/.test(roomId)) return sendJson(res, 400, { error: 'Invalid room code' });
      serverId = roomId.startsWith('3') ? '3' : roomId.startsWith('2') ? '2' : '1';
      const services = serverId === '3' ? await getFirebaseServer3AdminServices() : serverId === '2' ? await getFirebaseServer2AdminServices() : await getFirebaseAdminServices();
      decoded = await services.auth.verifyIdToken(authorization.slice(7));
      database = services.database;
    } catch (error) {
      return sendJson(res, error.message === 'Request body too large' ? 413 : 401, { error: 'Authentication or request validation failed' });
    }
    const roomId = String(body.roomId || '').trim();
    try {
      const roomSnapshot = await database.ref('auctions/' + roomId + '/room').get();
      if (!roomSnapshot.exists()) return sendJson(res, 404, { error: 'Auction room not found' });
      const roomData = roomSnapshot.val() || {};
      const authorizationResult = authorizeWinnerAnalysis({ uid: decoded.uid, room: roomData, roomStatus: roomData.status });
      if (!authorizationResult.allowed) {
        const message = authorizationResult.reason === 'host_only'
          ? 'Only the room host can run winner analysis'
          : 'Winner analysis is not currently allowed for this room';
        return sendJson(res, authorizationResult.status, { error: message });
      }
      const responseShim = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { sendJson(res, this.statusCode, body); return res; }
      };
      req.body = body;
      const result = await analyzeWinner(req, responseShim);
      if (result && !res.writableEnded) sendJson(res, result.statusCode || 500, JSON.parse(result.body || '{}'));
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