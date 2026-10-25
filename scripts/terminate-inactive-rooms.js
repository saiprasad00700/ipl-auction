// Modified from the upstream project by saiprasad00700.
import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClient } from '@supabase/supabase-js';
import { isInactive, latestActivityAt } from './room-activity.js';

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
  const auctionsSnap = await db.ref('auctions').get();
  if (!auctionsSnap.exists()) {
    console.log('No RTDB auction rooms found.');
    return;
  }

  let terminated = 0;
  let retained = 0;
  let missingActivity = 0;

  for (const [roomId, value] of Object.entries(auctionsSnap.val())) {
    if (!value?.room) continue;
    const initialNow = Date.now();
    const initialActivity = latestActivityAt(value);
    if (!initialActivity) {
      missingActivity++;
      retained++;
      console.log(`Retained room ${roomId}: no reliable activity timestamp; refusing unsafe deletion.`);
      continue;
    }
    if (!isInactive(value, initialNow, INACTIVE_MS)) {
      retained++;
      continue;
    }

    // Recheck inside a transaction, not with a read followed by remove: a join,
    // bid, chat, RTM action or other write must win against the cleanup race.
    const roomRef = db.ref(`auctions/${roomId}`);
    const result = await roomRef.transaction((current) => {
      if (!current?.room || !isInactive(current, Date.now(), INACTIVE_MS)) return;
      return null;
    }, undefined, false);

    if (!result.committed || result.snapshot.val() !== null) {
      retained++;
      continue;
    }

    await db.ref(`publicRooms/${roomId}`).remove();
    if (supabase) {
      const teamsResult = await supabase.from('teams').delete().eq('auction_id', roomId);
      if (teamsResult.error) console.error(`Supabase team cleanup failed for ${roomId}:`, teamsResult.error.message);
      const auctionResult = await supabase.from('auctions').delete().eq('id', roomId);
      if (auctionResult.error) console.error(`Supabase auction cleanup failed for ${roomId}:`, auctionResult.error.message);
    }
    console.log(`Deleted inactive room ${roomId}; last activity was ${new Date(initialActivity).toISOString()}.`);
    terminated++;
  }
  console.log(`Cleanup complete. Deleted: ${terminated}; retained: ${retained}; missing activity timestamps: ${missingActivity}; Supabase cleanup configured: ${Boolean(supabase)}`);
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
