// Modified from the upstream project by saiprasad00700.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import analyzeWinner from './api/analyze-winner.js';

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

async function serveStatic(req, res, pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
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

// Remove abandoned, not-yet-started rooms after 15 minutes of inactivity.
// Only waiting rooms are eligible. Online presence and recent disconnect activity
// reset the inactivity window; active/completed auctions are never touched.
const ROOM_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
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
      if (!room || room.status !== 'waiting') continue;

      const presence = roomNode?.presence || {};
      const online = Object.values(presence).some((entry) => entry?.online === true);
      if (online) continue;

      const presenceActivity = Object.values(presence).reduce((latest, entry) => {
        const seen = Number(entry?.lastSeen || 0);
        return Number.isFinite(seen) ? Math.max(latest, seen) : latest;
      }, 0);
      const lastActivityAt = Math.max(
        Number(room.lastActivityAt || 0),
        Number(room.createdAt || 0),
        Number(roomNode?.live?.lastActivityAt || 0),
        presenceActivity
      );
      // Do not guess when a legacy room has no trustworthy timestamp.
      if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) continue;
      if (now - lastActivityAt < ROOM_IDLE_TIMEOUT_MS) continue;

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
      if (!teamsResponse.ok) {
        console.warn('[Room cleanup] Supabase team cleanup failed for room', roomId, teamsResponse.status);
        continue;
      }

      const query = new URL('/rest/v1/auctions', supabaseUrl);
      query.searchParams.set('id', 'eq.' + roomId);
      const response = await fetch(query, {
        method: 'DELETE',
        headers: supabaseHeaders
      });
      if (!response.ok) {
        console.warn('[Room cleanup] Supabase cleanup failed for room', roomId, response.status);
        continue;
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

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/health') return sendJson(res, 200, { ok: true });
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
});
