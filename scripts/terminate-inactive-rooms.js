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

async function main() {
  const now = Date.now();
  const root = db.ref('/');
  const auctionsSnap = await db.ref('auctions').get();
  if (!auctionsSnap.exists()) {
    console.log('No RTDB auction rooms found.');
    return;
  }

  let terminated = 0;
  let retained = 0;
  for (const [roomId, value] of Object.entries(auctionsSnap.val())) {
    const room = value?.room;
    if (!room) continue;
    // Never delete rooms already in their completed-summary lifecycle here.
    if (room.status === 'completed' || room.status === 'analyzing' || room.status === 'awaiting_xi') {
      retained++;
      continue;
    }
    const activityTimes = [
      Number(room.lastActivityAt || 0),
      Number(value?.live?.lastActivityAt || 0),
      Number(room.createdAt || 0)
    ].filter(Number.isFinite);
    const lastActivity = Math.max(0, ...activityTimes);
    if (!lastActivity || now - lastActivity < INACTIVE_MS) {
      retained++;
      continue;
    }

    // Re-read immediately before deletion to avoid deleting a room that became active.
    const latestSnap = await db.ref(`auctions/${roomId}`).get();
    const latest = latestSnap.val();
    if (!latest?.room) continue;
    const latestActivity = Math.max(
      Number(latest.room.lastActivityAt || 0),
      Number(latest.live?.lastActivityAt || 0),
      Number(latest.room.createdAt || 0)
    );
    if (now - latestActivity < INACTIVE_MS) {
      retained++;
      continue;
    }

    await db.ref(`auctions/${roomId}`).remove();
    await db.ref(`publicRooms/${roomId}`).remove();
    if (supabase) {
      await supabase.from('teams').delete().eq('auction_id', roomId);
      await supabase.from('auctions').delete().eq('id', roomId);
    }
    console.log(`Terminated inactive room ${roomId}`);
    terminated++;
  }
  console.log(`Cleanup complete. Terminated: ${terminated}; retained: ${retained}`);
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
