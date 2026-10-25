// Modified from the upstream project by saiprasad00700.
import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClient } from '@supabase/supabase-js';
import { latestActivityAt } from './room-activity.js';

const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INACTIVE_MS = 30 * 60 * 1000;

if (!serviceAccountRaw || !databaseURL) {
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON or VITE_FIREBASE_DATABASE_URL secret.');
}
const serviceAccount = JSON.parse(serviceAccountRaw);
initializeApp({ credential: cert(serviceAccount), databaseURL });
const db = getDatabase();
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function timestampMs(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim() !== '' && Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function latestTimestampInTree(value, key = '') {
  if (value === null || value === undefined) return 0;
  let latest = ACTIVITY_TIMESTAMP_KEYS.has(key) ? timestampMs(value) : 0;

  if (Array.isArray(value)) {
    for (const child of value) latest = Math.max(latest, latestTimestampInTree(child));
  } else if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      latest = Math.max(latest, latestTimestampInTree(childValue, childKey));
    }
  }
  return latest;
}

function latestActivityAt(value) {
  // Scan timestamp-bearing descendants too: room-level lastActivityAt was not
  // consistently refreshed for chat, presence, bids, and older client versions.
  return Math.max(
    timestampMs(value?.room?.lastActivityAt),
    timestampMs(value?.live?.lastActivityAt),
    timestampMs(value?.room?.createdAt),
    timestampMs(value?.createdAt),
    timestampMs(value?.lastActivityAt),
    latestTimestampInTree(value?.messages),
    latestTimestampInTree(value?.presence),
    latestTimestampInTree(value?.live),
    latestTimestampInTree(value?.room?.players),
    latestTimestampInTree(value?.teams)
  );
}

async function main() {
  const now = Date.now();
  const auctionsSnap = await db.ref('auctions').get();
  if (!auctionsSnap.exists()) {
    console.log('No RTDB auction rooms found.');
    return;
  }

  let terminated = 0;
  let retained = 0;
  let missingActivity = 0;
  let recentActivity = 0;
  let skippedChanged = 0;
  let publicDirectoryErrors = 0;

  for (const [roomId, value] of Object.entries(auctionsSnap.val())) {
    if (!value?.room) {
      console.log(`Retained ${roomId}: missing room metadata`);
      retained++;
      continue;
    }

    const lastActivity = latestActivityAt(value);
    if (!lastActivity) {
      console.log(`Retained ${roomId}: no usable activity/creation timestamp`);
      retained++;
      missingActivity++;
      continue;
    }
    if (now - lastActivity < INACTIVE_MS) {
      console.log(`Retained ${roomId}: latest activity ${new Date(lastActivity).toISOString()} is less than 30 minutes ago`);
      retained++;
      recentActivity++;
      continue;
    }

    // Re-read immediately before deletion to avoid deleting a room that became active.
    const latestSnap = await db.ref(`auctions/${roomId}`).get();
    const latest = latestSnap.val();
    if (!latest?.room) {
      console.log(`Skipped ${roomId}: room metadata disappeared before deletion`);
      skippedChanged++;
      continue;
    }

    const latestActivity = latestActivityAt(latest);
    if (!latestActivity || now - latestActivity < INACTIVE_MS) {
      console.log(`Retained ${roomId}: activity changed during cleanup`);
      retained++;
      skippedChanged++;
      continue;
    }

    await db.ref(`auctions/${roomId}`).remove();
    try {
      await db.ref(`publicRooms/${roomId}`).remove();
    } catch (error) {
      publicDirectoryErrors++;
      console.error(`Public room directory cleanup failed for ${roomId}:`, error?.message || error);
    }

    if (supabase) {
      const teamsResult = await supabase.from('teams').delete().eq('auction_id', roomId);
      const auctionsResult = await supabase.from('auctions').delete().eq('id', roomId);
      if (teamsResult.error) console.error(`Supabase teams cleanup failed for ${roomId}:`, teamsResult.error.message);
      if (auctionsResult.error) console.error(`Supabase auction cleanup failed for ${roomId}:`, auctionsResult.error.message);
    }
    console.log(`Terminated inactive room ${roomId}; last activity ${new Date(latestActivity).toISOString()}`);
    terminated++;
  }

  console.log(
    `Cleanup complete. Terminated: ${terminated}; retained: ${retained}; ` +
    `missing timestamps: ${missingActivity}; recent activity: ${recentActivity}; ` +
    `skipped/changed: ${skippedChanged}; public directory errors: ${publicDirectoryErrors}; ` +
    `Supabase cleanup: ${supabase ? 'enabled' : 'disabled (secrets not configured)'}`
  );
}
main()
  .catch(error => {
    console.error('Inactive-room cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(getApps().map(app => deleteApp(app)));
  });
