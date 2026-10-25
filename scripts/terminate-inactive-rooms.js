// Modified from the upstream project by saiprasad00700.
import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClient } from '@supabase/supabase-js';

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

function latestActivityAt(value) {
  return Math.max(
    timestampMs(value?.room?.lastActivityAt),
    timestampMs(value?.live?.lastActivityAt),
    timestampMs(value?.room?.createdAt),
    timestampMs(value?.createdAt),
    timestampMs(value?.lastActivityAt)
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

  for (const [roomId, value] of Object.entries(auctionsSnap.val())) {
    if (!value?.room) {
      console.log(`Retained ${roomId}: missing room metadata`);
      retained++;
      continue;
    }

    // All room states, including started/completed auctions, follow the same
    // inactivity rule. Do not exempt completed/analyzing/awaiting_xi rooms.
    const lastActivity = latestActivityAt(value);
    if (!lastActivity) {
      console.log(`Retained ${roomId}: no usable activity/creation timestamp`);
      retained++;
      missingActivity++;
      continue;
    }
    if (now - lastActivity < INACTIVE_MS) {
      console.log(`Retained ${roomId}: last activity is less than 30 minutes ago`);
      retained++;
      recentActivity++;
      continue;
    }

    // Re-read immediately before deletion to avoid deleting a room that became active.
    const latestSnap = await db.ref(`auctions/${roomId}`).get();
    const latest = latestSnap.val();
    if (!latest?.room) {
      console.log(`Skipped ${roomId}: room metadata disappeared before deletion`);
      continue;
    }

    const latestActivity = latestActivityAt(latest);
    if (!latestActivity || now - latestActivity < INACTIVE_MS) {
      console.log(`Retained ${roomId}: activity changed during cleanup`);
      retained++;
      continue;
    }

    await db.ref(`auctions/${roomId}`).remove();
    await db.ref(`publicRooms/${roomId}`).remove();
    if (supabase) {
      const teamsResult = await supabase.from('teams').delete().eq('auction_id', roomId);
      const auctionsResult = await supabase.from('auctions').delete().eq('id', roomId);
      if (teamsResult.error) console.error(`Supabase teams cleanup failed for ${roomId}:`, teamsResult.error.message);
      if (auctionsResult.error) console.error(`Supabase auction cleanup failed for ${roomId}:`, auctionsResult.error.message);
    }
    console.log(`Terminated inactive room ${roomId}`);
    terminated++;
  }

  console.log(`Cleanup complete. Terminated: ${terminated}; retained: ${retained}; missing timestamps: ${missingActivity}; recent activity: ${recentActivity}`);
}
main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Close Firebase Admin's persistent connections so GitHub Actions can exit.
    await Promise.all(getApps().map(app => deleteApp(app)));
  });
