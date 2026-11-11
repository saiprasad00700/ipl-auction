// Modified from the upstream project by saiprasad00700.
import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getDatabase, ref, onValue, get, goOffline } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  // Single-project setup: Auth, Firestore and the Realtime Database all live in
  // the same Firebase project, so RTDB requests carry the signed-in user's token
  // and the database rules can rely on `auth != null` / `auth.uid`.
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

const server2Config = {
  apiKey: "AIzaSyCtfixD6HTHbLrLLkHNZ-X90dtq3LmFWIU",
  authDomain: "ss-auction-server-2.firebaseapp.com",
  databaseURL: "https://ss-auction-server-2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ss-auction-server-2",
  storageBucket: "ss-auction-server-2.firebasestorage.app",
  messagingSenderId: "541583284758",
  appId: "1:541583284758:web:f706cf9cd15a6472cd7337"
};
const server2App = initializeApp(server2Config, "ss-auction-server-2");
export const server2Auth = getAuth(server2App);
export const server2Rtdb = getDatabase(server2App);
let server2AuthPromise = null;
export const ensureServer2Auth = async () => {
  const primaryUser = auth.currentUser;
  if (!primaryUser) throw new Error("Please sign in before joining this auction.");
  if (server2Auth.currentUser?.uid === primaryUser.uid) return server2Rtdb;
  if (!server2AuthPromise) server2AuthPromise = (async () => {
    const idToken = await primaryUser.getIdToken();
    const response = await fetch("/api/server2-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.customToken) {
      throw new Error(payload.error || "Server 2 authentication failed.");
    }
    await signInWithCustomToken(server2Auth, payload.customToken);
    return server2Rtdb;
  })().finally(() => { server2AuthPromise = null; });
  return server2AuthPromise;
};

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
// Defer Analytics until after first paint — removes it from the critical path
let analytics = null;
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    import('firebase/analytics').then(({ getAnalytics }) => {
      analytics = getAnalytics(app);
    });
  }, { once: true });
}
export { analytics };


// ─── Server Time Sync via Firebase RTDB ───
let _serverTimeOffset = 0;
let _hasServerTimeOffset = false;
let _rtdbConnected = false;
let _offsetReceivedWhileConnected = false;

export const rtdb = getDatabase(app);
export const storage = getStorage(app);


try {
  // Start offline by default until entering an active room session
  goOffline(rtdb);
  const connectedRef = ref(rtdb, '.info/connected');
  const offsetRef = ref(rtdb, '.info/serverTimeOffset');

  // .info/serverTimeOffset is client-side Firebase metadata. Do not call
  // get() on it: that can issue an invalid server path request and mark
  // time sync unavailable, preventing expired auctions from settling.
  onValue(offsetRef, (snap) => {
    const offset = Number(snap.val());
    if (Number.isFinite(offset)) {
      _serverTimeOffset = offset;
      _hasServerTimeOffset = true;
      if (_rtdbConnected) _offsetReceivedWhileConnected = true;
    }
  });

  onValue(connectedRef, (snap) => {
    const connected = snap.val() === true;
    if (connected !== _rtdbConnected) {
      _rtdbConnected = connected;
      // Reuse the last valid Firebase-provided offset after reconnecting;
      // the .info listener may not emit again if the offset did not change.
      _offsetReceivedWhileConnected = connected && _hasServerTimeOffset;
    }
  });
} catch (err) {
  console.error('[Firebase] Failed to initialize server-time sync listeners:', err);
}

/**
 * Returns the current server-authoritative time in milliseconds.
 * Uses Firebase RTDB's `.info/serverTimeOffset` for ms-accurate sync.
 * All clients calling this will agree on the same absolute time (±50ms).
 */
export const getServerTime = () => Date.now() + _serverTimeOffset;

/** True only after RTDB connects and supplies an offset during that connection. */
export const isServerTimeSynced = () => _rtdbConnected && _offsetReceivedWhileConnected;

/**
 * Returns the current server time offset in ms (for debugging).
 */
export const getServerTimeOffset = () => _serverTimeOffset;

export default app;