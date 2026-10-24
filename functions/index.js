import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { applySaleToTeam } from "./saleSettlementHelpers.js";

initializeApp();
const database = getDatabase();

const BOT_IDS = new Set(["bot_MI", "bot_CSK", "bot_RCB", "bot_KKR", "bot_DC", "bot_PBKS", "bot_RR", "bot_SRH", "bot_GT", "bot_LSG"]);
const DECISIONS = new Set(["accept", "decline", "match", "decline_counter"]);

const PLAYER_CATALOG = {"p_621":{"basePrice":2,"country":"IND"},"p_622":{"basePrice":2,"country":"IND"},"p_101":{"basePrice":2,"country":"IND"},"p_102":{"basePrice":2,"country":"IND"},"p_103":{"basePrice":2,"country":"IND"},"p_104":{"basePrice":2,"country":"IND"},"p_105":{"basePrice":2,"country":"OS"},"p_106":{"basePrice":2,"country":"IND"},"p_107":{"basePrice":2,"country":"OS"},"p_108":{"basePrice":2,"country":"OS"},"p_109":{"basePrice":2,"country":"OS"},"p_110":{"basePrice":2,"country":"OS"},"p_111":{"basePrice":2,"country":"IND"},"p_112":{"basePrice":2,"country":"IND"},"p_114":{"basePrice":2,"country":"OS"},"p_116":{"basePrice":2,"country":"OS"},"p_117":{"basePrice":2,"country":"OS"},"p_118":{"basePrice":2,"country":"IND"},"p_119":{"basePrice":2,"country":"IND"},"p_120":{"basePrice":2,"country":"IND"},"p_121":{"basePrice":2,"country":"OS"},"p_122":{"basePrice":2,"country":"OS"},"p_123":{"basePrice":2,"country":"OS"},"p_124":{"basePrice":2,"country":"OS"},"p_125":{"basePrice":2,"country":"OS"},"p_126":{"basePrice":2,"country":"IND"},"p_127":{"basePrice":2,"country":"IND"},"p_128":{"basePrice":2,"country":"IND"},"p_129":{"basePrice":2,"country":"IND"},"p_130":{"basePrice":2,"country":"IND"},"p_132":{"basePrice":2,"country":"IND"},"p_134":{"basePrice":2,"country":"IND"},"p_135":{"basePrice":2,"country":"IND"},"p_136":{"basePrice":2,"country":"IND"},"p_137":{"basePrice":2,"country":"OS"},"p_138":{"basePrice":2,"country":"OS"},"p_139":{"basePrice":2,"country":"OS"},"p_140":{"basePrice":2,"country":"OS"},"p_141":{"basePrice":2,"country":"IND"},"p_142":{"basePrice":2,"country":"IND"},"p_144":{"basePrice":2,"country":"IND"},"p_145":{"basePrice":2,"country":"IND"},"p_100":{"basePrice":2,"country":"OS"},"p_113":{"basePrice":2,"country":"OS"},"p_115":{"basePrice":2,"country":"OS"},"p_131":{"basePrice":2,"country":"OS"},"p_133":{"basePrice":2,"country":"OS"},"p_143":{"basePrice":2,"country":"OS"},"p_271":{"basePrice":2,"country":"OS"},"p_272":{"basePrice":2,"country":"OS"},"p_279":{"basePrice":2,"country":"OS"},"p_282":{"basePrice":2,"country":"OS"},"p_289":{"basePrice":1,"country":"OS"},"p_146":{"basePrice":1,"country":"IND"},"p_150":{"basePrice":1,"country":"IND"},"p_158":{"basePrice":1,"country":"IND"},"p_159":{"basePrice":1,"country":"IND"},"p_162":{"basePrice":1,"country":"IND"},"p_166":{"basePrice":1,"country":"IND"},"p_167":{"basePrice":1,"country":"OS"},"p_296":{"basePrice":2,"country":"OS"},"p_304":{"basePrice":2,"country":"IND"},"p_172":{"basePrice":0.75,"country":"OS"},"p_216":{"basePrice":0.3,"country":"IND"},"p_254":{"basePrice":0.3,"country":"IND"},"p_264":{"basePrice":0.3,"country":"IND"},"p_193":{"basePrice":0.5,"country":"IND"},"p_196":{"basePrice":0.5,"country":"IND"},"p_240":{"basePrice":0.3,"country":"IND"},"p_281":{"basePrice":2,"country":"IND"},"p_285":{"basePrice":2,"country":"OS"},"p_147":{"basePrice":1,"country":"IND"},"p_148":{"basePrice":1,"country":"OS"},"p_149":{"basePrice":1,"country":"IND"},"p_151":{"basePrice":1,"country":"OS"},"p_152":{"basePrice":1,"country":"IND"},"p_153":{"basePrice":1,"country":"IND"},"p_154":{"basePrice":1,"country":"IND"},"p_155":{"basePrice":1,"country":"IND"},"p_156":{"basePrice":1,"country":"OS"},"p_157":{"basePrice":1,"country":"IND"},"p_160":{"basePrice":1,"country":"OS"},"p_161":{"basePrice":1,"country":"OS"},"p_164":{"basePrice":1,"country":"OS"},"p_165":{"basePrice":1,"country":"IND"},"p_168":{"basePrice":1,"country":"IND"},"p_292":{"basePrice":2,"country":"OS"},"p_300":{"basePrice":2,"country":"OS"},"p_301":{"basePrice":2,"country":"OS"},"p_303":{"basePrice":1,"country":"IND"},"p_174":{"basePrice":0.75,"country":"OS"},"p_180":{"basePrice":0.75,"country":"IND"},"p_183":{"basePrice":0.75,"country":"IND"},"p_185":{"basePrice":0.75,"country":"IND"},"p_186":{"basePrice":0.75,"country":"OS"},"p_220":{"basePrice":0.3,"country":"IND"},"p_241":{"basePrice":0.3,"country":"IND"},"p_245":{"basePrice":0.3,"country":"IND"},"p_188":{"basePrice":0.5,"country":"IND"},"p_189":{"basePrice":0.5,"country":"IND"},"p_190":{"basePrice":0.5,"country":"IND"},"p_198":{"basePrice":0.5,"country":"IND"},"p_199":{"basePrice":0.5,"country":"IND"},"p_203":{"basePrice":0.5,"country":"IND"},"p_219":{"basePrice":0.3,"country":"IND"},"p_253":{"basePrice":0.3,"country":"IND"},"p_275":{"basePrice":0.75,"country":"IND"},"p_276":{"basePrice":0.75,"country":"IND"},"p_280":{"basePrice":2,"country":"OS"},"p_163":{"basePrice":1,"country":"IND"},"p_291":{"basePrice":1,"country":"IND"},"p_181":{"basePrice":0.75,"country":"OS"},"p_218":{"basePrice":0.3,"country":"IND"},"p_243":{"basePrice":0.3,"country":"IND"},"p_195":{"basePrice":0.5,"country":"IND"},"p_197":{"basePrice":0.5,"country":"IND"},"p_200":{"basePrice":0.5,"country":"IND"},"p_201":{"basePrice":0.5,"country":"IND"},"p_202":{"basePrice":0.5,"country":"IND"},"p_206":{"basePrice":0.3,"country":"IND"},"p_226":{"basePrice":0.3,"country":"IND"},"p_237":{"basePrice":0.3,"country":"IND"},"p_250":{"basePrice":0.3,"country":"IND"},"p_268":{"basePrice":0.3,"country":"IND"},"p_295":{"basePrice":2,"country":"OS"},"p_209":{"basePrice":0.3,"country":"IND"},"p_235":{"basePrice":0.3,"country":"IND"},"p_259":{"basePrice":0.3,"country":"IND"},"p_260":{"basePrice":0.3,"country":"IND"},"p_262":{"basePrice":0.3,"country":"IND"},"p_297":{"basePrice":2,"country":"OS"},"p_169":{"basePrice":0.75,"country":"OS"},"p_170":{"basePrice":0.75,"country":"OS"},"p_171":{"basePrice":0.75,"country":"OS"},"p_173":{"basePrice":0.75,"country":"OS"},"p_175":{"basePrice":0.75,"country":"OS"},"p_176":{"basePrice":0.75,"country":"IND"},"p_177":{"basePrice":0.75,"country":"OS"},"p_178":{"basePrice":0.75,"country":"OS"},"p_179":{"basePrice":0.75,"country":"OS"},"p_182":{"basePrice":0.75,"country":"OS"},"p_184":{"basePrice":0.75,"country":"OS"},"p_187":{"basePrice":0.75,"country":"OS"},"p_191":{"basePrice":0.5,"country":"IND"},"p_192":{"basePrice":0.5,"country":"IND"},"p_194":{"basePrice":0.5,"country":"IND"},"p_204":{"basePrice":0.3,"country":"IND"},"p_205":{"basePrice":0.3,"country":"IND"},"p_207":{"basePrice":0.3,"country":"IND"},"p_208":{"basePrice":0.3,"country":"IND"},"p_210":{"basePrice":0.3,"country":"IND"},"p_211":{"basePrice":0.3,"country":"IND"},"p_212":{"basePrice":0.3,"country":"IND"},"p_213":{"basePrice":0.3,"country":"IND"},"p_214":{"basePrice":0.3,"country":"IND"},"p_215":{"basePrice":0.3,"country":"IND"},"p_217":{"basePrice":0.3,"country":"IND"},"p_221":{"basePrice":0.3,"country":"OS"},"p_222":{"basePrice":0.3,"country":"OS"},"p_223":{"basePrice":0.3,"country":"IND"},"p_224":{"basePrice":0.3,"country":"IND"},"p_225":{"basePrice":0.3,"country":"IND"},"p_227":{"basePrice":0.3,"country":"IND"},"p_228":{"basePrice":0.3,"country":"IND"},"p_229":{"basePrice":0.3,"country":"IND"},"p_230":{"basePrice":0.3,"country":"OS"},"p_231":{"basePrice":0.3,"country":"OS"},"p_232":{"basePrice":0.3,"country":"IND"},"p_233":{"basePrice":0.3,"country":"IND"},"p_234":{"basePrice":0.3,"country":"IND"},"p_236":{"basePrice":0.3,"country":"IND"},"p_238":{"basePrice":0.3,"country":"IND"},"p_239":{"basePrice":0.3,"country":"IND"},"p_242":{"basePrice":0.3,"country":"IND"},"p_244":{"basePrice":0.3,"country":"IND"},"p_246":{"basePrice":0.3,"country":"IND"},"p_247":{"basePrice":0.3,"country":"IND"},"p_248":{"basePrice":0.3,"country":"IND"},"p_249":{"basePrice":0.3,"country":"IND"},"p_251":{"basePrice":0.3,"country":"IND"},"p_252":{"basePrice":0.3,"country":"IND"},"p_255":{"basePrice":0.3,"country":"IND"},"p_256":{"basePrice":0.3,"country":"IND"},"p_257":{"basePrice":0.3,"country":"IND"},"p_258":{"basePrice":0.3,"country":"IND"},"p_261":{"basePrice":0.3,"country":"IND"},"p_263":{"basePrice":0.3,"country":"IND"},"p_265":{"basePrice":0.3,"country":"IND"},"p_266":{"basePrice":0.3,"country":"IND"},"p_267":{"basePrice":0.3,"country":"IND"},"p_269":{"basePrice":0.3,"country":"IND"},"p_270":{"basePrice":0.3,"country":"IND"},"p_284":{"basePrice":2,"country":"OS"},"p_294":{"basePrice":2,"country":"OS"},"p_298":{"basePrice":0.75,"country":"IND"},"p_299":{"basePrice":1.5,"country":"OS"},"p_308":{"basePrice":0.3,"country":"IND"},"p_309":{"basePrice":0.3,"country":"IND"},"p_310":{"basePrice":0.3,"country":"IND"},"p_311":{"basePrice":0.3,"country":"IND"},"p_314":{"basePrice":0.5,"country":"IND"},"p_315":{"basePrice":0.3,"country":"IND"},"p_317":{"basePrice":0.3,"country":"IND"},"p_318":{"basePrice":0.3,"country":"IND"},"p_320":{"basePrice":0.3,"country":"IND"},"p_321":{"basePrice":0.3,"country":"IND"},"p_322":{"basePrice":0.3,"country":"IND"},"p_324":{"basePrice":0.3,"country":"IND"},"p_327":{"basePrice":0.3,"country":"IND"},"p_328":{"basePrice":0.3,"country":"IND"},"p_329":{"basePrice":0.3,"country":"IND"},"p_330":{"basePrice":0.3,"country":"IND"},"p_332":{"basePrice":0.3,"country":"IND"},"p_333":{"basePrice":0.3,"country":"IND"},"p_334":{"basePrice":0.5,"country":"IND"},"p_335":{"basePrice":0.3,"country":"IND"},"p_336":{"basePrice":0.3,"country":"IND"},"p_338":{"basePrice":0.3,"country":"IND"},"p_340":{"basePrice":0.3,"country":"IND"},"p_343":{"basePrice":0.75,"country":"OS"},"p_344":{"basePrice":0.75,"country":"IND"},"p_349":{"basePrice":1,"country":"OS"},"p_351":{"basePrice":2,"country":"OS"},"p_352":{"basePrice":0.75,"country":"OS"},"p_353":{"basePrice":2,"country":"OS"},"p_354":{"basePrice":1.5,"country":"OS"},"p_357":{"basePrice":0.75,"country":"OS"},"p_359":{"basePrice":0.75,"country":"OS"},"p_360":{"basePrice":2,"country":"OS"},"p_364":{"basePrice":1.5,"country":"OS"},"p_365":{"basePrice":2,"country":"OS"},"p_366":{"basePrice":2,"country":"OS"},"p_368":{"basePrice":0.75,"country":"IND"},"p_369":{"basePrice":2,"country":"OS"},"p_370":{"basePrice":2,"country":"OS"},"p_371":{"basePrice":2,"country":"OS"},"p_373":{"basePrice":1.5,"country":"IND"},"p_382":{"basePrice":0.3,"country":"IND"},"p_387":{"basePrice":0.3,"country":"IND"},"p_390":{"basePrice":0.3,"country":"IND"},"p_391":{"basePrice":0.3,"country":"IND"},"p_393":{"basePrice":0.3,"country":"IND"},"p_395":{"basePrice":0.3,"country":"IND"},"p_398":{"basePrice":0.3,"country":"IND"},"p_400":{"basePrice":0.3,"country":"IND"},"p_402":{"basePrice":0.3,"country":"IND"},"p_403":{"basePrice":0.3,"country":"IND"},"p_404":{"basePrice":0.3,"country":"IND"},"p_406":{"basePrice":0.3,"country":"IND"},"p_407":{"basePrice":0.3,"country":"IND"},"p_408":{"basePrice":0.3,"country":"IND"},"p_410":{"basePrice":0.3,"country":"IND"},"p_413":{"basePrice":0.3,"country":"IND"},"p_901":{"basePrice":0.3,"country":"IND"},"p_902":{"basePrice":0.75,"country":"RSA"},"p_903":{"basePrice":1.5,"country":"ENG"},"p_904":{"basePrice":0.3,"country":"IND"},"p_906":{"basePrice":0.3,"country":"IND"},"p_907":{"basePrice":0.3,"country":"IND"},"p_908":{"basePrice":0.75,"country":"ZIM"},"p_909":{"basePrice":0.75,"country":"IND"},"p_910":{"basePrice":0.3,"country":"IND"},"p_911":{"basePrice":1,"country":"RSA"},"p_912":{"basePrice":1.5,"country":"RSA"},"p_913":{"basePrice":0.75,"country":"AUS"},"p_914":{"basePrice":0.3,"country":"IND"},"p_915":{"basePrice":0.3,"country":"IND"},"p_916":{"basePrice":0.3,"country":"IND"},"p_917":{"basePrice":0.3,"country":"IND"},"p_918":{"basePrice":1,"country":"ENG"},"p_919":{"basePrice":0.3,"country":"IND"},"p_920":{"basePrice":0.75,"country":"ENG"},"p_921":{"basePrice":0.75,"country":"AUS"}};

export const placeBid = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, botAction = false, botUserId, botTeamId, botName, maxValuation, botBudget, timerSeconds } = request.data || {};
  requireRoomId(roomId);
  const roomRef = database.ref(`auctions/${roomId}`);
  const roomSnapshot = await roomRef.child("room").get();
  const room = roomSnapshot.val();
  if (!room) reject("Auction room not found.");

  let bidderId = uid;
  let bidderTeamId;
  let bidderName;
  let maxBid = Number.POSITIVE_INFINITY;
  if (botAction) {
    if (room.hostId !== uid || typeof botUserId !== "string" || !BOT_IDS.has(botUserId)
      || botUserId !== `bot_${String(botTeamId || "").replace(/^bot_/, "")}`) {
      reject("Only the host may submit a bot bid.");
    }
    bidderId = botUserId;
    bidderTeamId = botTeamId;
    bidderName = typeof botName === "string" ? botName.slice(0, 80) : "Manager Bot";
    maxBid = Math.min(Number.isFinite(Number(maxValuation)) ? Number(maxValuation) : 0,
      Number.isFinite(Number(botBudget)) ? Number(botBudget) : 0);
  } else {
    const players = Array.isArray(room.players) ? room.players : [];
    const member = players.find((p) => p?.id === uid);
    if (!member || room.bannedPlayers?.includes(uid)) reject("You are not allowed to bid in this room.");
    bidderTeamId = member.team;
    bidderName = typeof member.name === "string" ? member.name.slice(0, 80) : "Manager";
  }
  if (!bidderTeamId || bidderTeamId === "NONE") reject("Select a franchise before bidding.");
  const teamSnapshot = await roomRef.child("teams").child(`${roomId}_${bidderId}`).get();
  const team = teamSnapshot.val();
  if (!team || team.userId !== bidderId || team.teamId !== bidderTeamId) reject("Your franchise record is not valid.");

  const liveRef = roomRef.child("live");
  const now = Date.now();
  const result = await liveRef.transaction((live) => {
    if (!live || live.status !== "bidding") return;
    if (live.highBidderId === bidderId) return;
    if (live.timerEndsAt && now >= Number(live.timerEndsAt)) return;
    const player = PLAYER_CATALOG[live.playerId];
    if (!player) return;
    const squad = Array.isArray(team.squad) ? team.squad : [];
    if (squad.some((p) => (typeof p === "string" ? p : p?.id) === live.playerId)) return;
    const squadLimit = Number(room.squadLimit || 25);
    if (squad.length >= squadLimit) return;
    const overseasLimit = Number(room.overseasLimit || 8);
    const overseasCount = squad.reduce((n, item) => {
      const entry = PLAYER_CATALOG[typeof item === "string" ? item : item?.id];
      return n + (entry && entry.country !== "IND" ? 1 : 0);
    }, 0);
    if (player.country !== "IND" && overseasCount >= overseasLimit) return;
    const currentBid = Number(live.currentBid || 0);
    const nextBid = currentBid === 0 ? Number(player.basePrice || 0)
      : Number((currentBid + (currentBid < 5 ? 0.20 : 0.25)).toFixed(2));
    if (nextBid > Number(team.budgetRemaining || 0) || nextBid > maxBid) return;
    live.currentBid = nextBid;
    live.highBidderId = bidderId;
    live.highBidderName = bidderName;
    live.highBidderTeamId = bidderTeamId;
    const seconds = botAction
      ? Math.max(3, Math.min(30, Number(timerSeconds) || Number(room.settings?.bidTimer) || 10))
      : Math.max(3, Math.min(30, Number(room.settings?.bidTimer) || 10));
    live.timerEndsAt = now + seconds * 1000;
    live.lastActivityAt = now;
    return live;
  }, undefined, false);

  if (!result.committed) reject("Bid failed: the timer expired, another bid was placed, or your franchise cannot afford this bid.");
  return { ok: true, amount: result.snapshot.val()?.currentBid };
});


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
  const { roomId, amount, botAction = false } = request.data || {};
  requireRoomId(roomId);
  const counterBid = Number(Number(amount).toFixed(2));
  if (!Number.isFinite(counterBid) || counterBid <= 0) throw new HttpsError("invalid-argument", "Enter a valid counter-bid.");

  const roomRef = database.ref(`auctions/${roomId}`);
  const [roomSnapshot, teamSnapshot] = await Promise.all([
    roomRef.child("room").get(),
    roomRef.child("teams").child(`${roomId}_${botAction ? request.data?.botTeamId : uid}`).get()
  ]);
  const room = roomSnapshot.val();
  const team = teamSnapshot.val();
  if (!room) reject("Auction room could not be found.");
  if (botAction) {
    if (room.hostId !== uid || !BOT_IDS.has(`bot_${String(request.data?.botTeamId || "").replace(/^bot_/, "")}`)) {
      reject("Only the room host may submit a bot counter-bid.");
    }
  } else if (!team || team.userId !== uid) {
    reject("Your franchise could not be found.");
  }
  if (!team || team.userId !== (botAction ? request.data?.botTeamId : uid)) {
    reject("The counter-bidder franchise record is invalid.");
  }

  const liveRef = roomRef.child("live");
  const now = Date.now();
  const result = await liveRef.transaction((live) => {
    if (!live || live.status !== "processing_sale") return;
    const offer = live.retentionOffer;
    if (!offer || offer.status !== "pending" || offer.phase !== "counter_bid") return;
    if (botAction) {
      if (offer.buyerId !== request.data?.botTeamId || room.hostId !== uid || !BOT_IDS.has(offer.buyerId)) return;
    } else if (offer.buyerId !== uid) return;
    if (team.teamId !== offer.buyerTeamId) return;
    if (now > Number(offer.expiresAt || 0)) return;
    if (counterBid <= Number(offer.bid || 0)) return;
    const purse = Number(team?.budgetRemaining ?? room.settings?.budget ?? 120);
    if (counterBid > purse || counterBid > purse + Number(team?.spent || 0)) return;
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


export const applySaleSettlement = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, playerId } = request.data || {};
  requireRoomId(roomId);
  if (typeof playerId !== "string" || !PLAYER_CATALOG[playerId]) {
    throw new HttpsError("invalid-argument", "Invalid player.");
  }
  const root = database.ref(`auctions/${roomId}`);
  const [roomSnap, liveSnap] = await Promise.all([root.child("room").get(), root.child("live").get()]);
  const room = roomSnap.val();
  const live = liveSnap.val();
  if (!room || !live || live.status !== "sold" || live.playerId !== playerId || !live.highBidderId) reject("Sale is not ready to settle.");
  if (!(Array.isArray(room.players) ? room.players : []).some((p) => p?.id === uid) || room.bannedPlayers?.includes(uid)) reject("Not authorized for this room.");
  const buyerId = live.highBidderId;
  const teamRef = root.child("teams").child(`${roomId}_${buyerId}`);
  const teamSnap = await teamRef.get();
  const team = teamSnap.val();
  if (!team || team.userId !== buyerId || team.teamId !== live.highBidderTeamId) reject("Invalid winning franchise.");
  const wasAlreadySettled = Array.isArray(team.squad) && team.squad.some((p) => (typeof p === "string" ? p : p?.id) === playerId);
  const price = Number(live.currentBid);
  if (!Number.isFinite(price) || price < 0) reject("Invalid sale price.");
  const offer = live.retentionOffer;
  const retained = offer?.status === "accepted" && team.teamId === offer.originalFranchiseId
    && (offer.decision === "match" || (offer.phase === "counter_bid" && offer.decision === "accept"));
  const result = await teamRef.transaction((current) => {
    if (!current || current.userId !== buyerId || current.teamId !== live.highBidderTeamId) return;
    const squad = Array.isArray(current.squad) ? current.squad : [];
    if (squad.some((p) => (typeof p === "string" ? p : p?.id) === playerId)) return current;
    const player = PLAYER_CATALOG[playerId];
    const overseas = squad.reduce((n, item) => {
      const p = PLAYER_CATALOG[typeof item === "string" ? item : item?.id];
      return n + (p && p.country !== "IND" ? 1 : 0);
    }, 0);
    if (squad.length >= Number(room.squadLimit || 25) || (player.country !== "IND" && overseas >= Number(room.overseasLimit || 8))) return;
    return applySaleToTeam(current, playerId, price, retained);
  }, undefined, false);
  const finalTeam = result.snapshot.val();
  const alreadyApplied = Array.isArray(finalTeam?.squad) && finalTeam.squad.some((p) => (typeof p === "string" ? p : p?.id) === playerId);
  if (!alreadyApplied) reject("Sale settlement failed; purse or squad limits may have changed.");
  await root.child("room/players").transaction((players) => {
    if (!Array.isArray(players)) return;
    return players.map((p) => p.id === buyerId ? { ...p, spent: Number(finalTeam.spent || 0), squadCount: finalTeam.squad.length } : p);
  }, undefined, false);
  return { ok: true, alreadyApplied: wasAlreadySettled, playerId, buyerId, budgetRemaining: finalTeam.budgetRemaining, spent: finalTeam.spent, squadCount: finalTeam.squad.length, team: finalTeam };
});


const FRANCHISES = {
  MI: "Mumbai Indians",
  CSK: "Chennai Super Kings",
  RCB: "Royal Challengers Bengaluru",
  KKR: "Kolkata Knight Riders",
  DC: "Delhi Capitals",
  PBKS: "Punjab Kings",
  RR: "Rajasthan Royals",
  SRH: "Sunrisers Hyderabad",
  GT: "Gujarat Titans",
  LSG: "Lucknow Super Giants"
};

export const updatePlayerTeam = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, userId, teamId } = request.data || {};
  requireRoomId(roomId);
  if (typeof userId !== "string" || !userId || !Object.hasOwn(FRANCHISES, teamId)) {
    throw new HttpsError("invalid-argument", "Choose a valid franchise.");
  }

  const roomRef = database.ref(`auctions/${roomId}`);
  const roomSnap = await roomRef.child("room").get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  if (room.status && room.status !== "waiting") reject("Franchises can only be changed before the auction starts.");
  if (uid !== userId && room.hostId !== uid) reject("You cannot change another manager's franchise.");

  const members = Array.isArray(room.players) ? room.players : [];
  const member = members.find((p) => p?.id === userId);
  if (!member || room.bannedPlayers?.includes(userId)) reject("This manager is not an active member of the room.");
  if (members.some((p) => p?.id !== userId && p?.team === teamId)) reject("That franchise has already been selected in this room.");

  const teamRef = roomRef.child("teams").child(`${roomId}_${userId}`);
  const teamSnap = await teamRef.get();
  const existingTeam = teamSnap.val();
  if (existingTeam && (Number(existingTeam.spent || 0) > 0 || (Array.isArray(existingTeam.squad) && existingTeam.squad.length > 0))) {
    reject("A franchise cannot be changed after players have been purchased.");
  }

  const teamName = FRANCHISES[teamId];
  const teamRecord = {
    ...(existingTeam || {}),
    auctionId: roomId,
    userId,
    teamId,
    teamName,
    budgetRemaining: Number(existingTeam?.budgetRemaining ?? room.settings?.budget ?? 120),
    spent: Number(existingTeam?.spent || 0),
    squad: Array.isArray(existingTeam?.squad) ? existingTeam.squad : [],
    retentionCardsRemaining: Number(existingTeam?.retentionCardsRemaining ?? 2)
  };

  const [memberUpdate, teamUpdate] = await Promise.all([
    roomRef.child("room/players").transaction((current) => {
      if (!Array.isArray(current)) return;
      if (current.some((p) => p?.id !== userId && p?.team === teamId)) return;
      const index = current.findIndex((p) => p?.id === userId);
      if (index < 0) return;
      return current.map((p) => p.id === userId ? { ...p, team: teamId, teamName } : p);
    }, undefined, false),
    teamRef.set(teamRecord)
  ]);
  if (!memberUpdate.committed) reject("That franchise was just selected by another manager. Please choose another.");
  await roomRef.child("room/lastActivityAt").set(Date.now());
  return { ok: true, teamId, teamName };
});
