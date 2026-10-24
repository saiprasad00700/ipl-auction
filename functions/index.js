import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();
const database = getDatabase();

const BOT_IDS = new Set(["bot_MI", "bot_CSK", "bot_RCB", "bot_KKR", "bot_DC", "bot_PBKS", "bot_RR", "bot_SRH", "bot_GT", "bot_LSG"]);
const DECISIONS = new Set(["accept", "decline", "match", "decline_counter"]);

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before making an RTM decision.");
  return request.auth.uid;
}
function requireRoomId(roomId) {
  if (typeof roomId !== "string" || !/^[A-Za-z0-9_-]{3,100}$/.test(roomId)) {
    throw new HttpsError("invalid-argument", "Invalid auction room.");
  }
}
function reject(message) { throw new HttpsError("failed-precondition", message); }

export const decideRetention = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, decision, botAction = false } = request.data || {};
  requireRoomId(roomId);
  if (!DECISIONS.has(decision)) throw new HttpsError("invalid-argument", "Invalid RTM decision.");

  const roomRef = database.ref(`auctions/${roomId}`);
  const roomSnapshot = await roomRef.child("room").get();
  const room = roomSnapshot.val();
  if (!room) reject("Auction room not found.");
  const liveRef = roomRef.child("live");
  const clickedAt = Date.now();
  const result = await liveRef.transaction((live) => {
    if (!live || live.status !== "processing_sale") return;
    const offer = live.retentionOffer;
    if (!offer || offer.status !== "pending") return;
    if (clickedAt > Number(offer.expiresAt || 0) + 1500) return;

    const initial = offer.phase === "initial_decision";
    const matching = offer.phase === "match_decision";
    const permittedDecision = initial ? ["accept", "decline"].includes(decision)
      : matching && ["match", "decline_counter"].includes(decision);
    if (!permittedDecision) return;

    if (botAction) {
      if (room.hostId !== uid || !BOT_IDS.has(offer.eligibleUserId)) return;
    } else if (offer.eligibleUserId !== uid) {
      return;
    }

    const now = Math.min(clickedAt, Number(offer.expiresAt));
    offer.decision = decision;
    offer.decidedBy = uid;
    offer.decidedAt = now;
    if (initial && decision === "accept") {
      offer.rtmUsed = true;
      offer.phase = "counter_bid";
      offer.expiresAt = now + 15000;
    }
    live.retentionOffer = offer;
    live.lastActivityAt = now;
    return live;
  }, undefined, false);

  if (!result.committed) reject("This RTM offer is no longer available or you are not authorized to decide it.");
  return { ok: true, phase: result.snapshot.val()?.retentionOffer?.phase };
});

export const submitRetentionCounterBid = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, amount } = request.data || {};
  requireRoomId(roomId);
  const counterBid = Number(Number(amount).toFixed(2));
  if (!Number.isFinite(counterBid) || counterBid <= 0) throw new HttpsError("invalid-argument", "Enter a valid counter-bid.");

  const roomRef = database.ref(`auctions/${roomId}`);
  const [roomSnapshot, teamSnapshot] = await Promise.all([
    roomRef.child("room").get(),
    roomRef.child("teams").child(`${roomId}_${uid}`).get()
  ]);
  const room = roomSnapshot.val();
  const team = teamSnapshot.val();
  if (!room || !team) reject("Auction room or your franchise could not be found.");

  const liveRef = roomRef.child("live");
  const now = Date.now();
  const result = await liveRef.transaction((live) => {
    if (!live || live.status !== "processing_sale") return;
    const offer = live.retentionOffer;
    if (!offer || offer.status !== "pending" || offer.phase !== "counter_bid" || offer.buyerId !== uid) return;
    if (now > Number(offer.expiresAt || 0)) return;
    if (counterBid <= Number(offer.bid || 0)) return;
    const purse = Number(team.budgetRemaining ?? room.settings?.budget ?? 120);
    if (counterBid > purse || counterBid > purse + Number(team.spent || 0)) return;
    offer.counterBid = counterBid;
    offer.phase = "match_decision";
    offer.decision = null;
    offer.decidedBy = null;
    offer.decidedAt = null;
    offer.expiresAt = now + 10000;
    live.currentBid = counterBid;
    live.retentionOffer = offer;
    live.lastActivityAt = now;
    return live;
  }, undefined, false);

  if (!result.committed) reject("Counter-bid must be higher than the current price and within your remaining budget, and the RTM window must still be open.");
  return { ok: true, counterBid };
});
