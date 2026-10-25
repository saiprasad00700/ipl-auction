import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { applySaleToTeam, canAffordRtmMatch } from "./saleSettlementHelpers.js";
import { PLAYER_ORIGINAL_FRANCHISES } from "./playerOriginalFranchises.js";
import { validatePlayingXIComposition } from "./playingXIRules.js";
import { clampBidTimerSeconds, effectiveOverseasLimit, nextBidAmount } from "./auctionRules.js";
import { canChangeFranchise, isFranchiseAvailable, hasPurchasedPlayers, buildTeamAssignmentRecord } from "./teamAssignmentRules.js";
import { normalizeAuctionSettings } from "./auctionSettingsRules.js";
import { upsertRoomMember } from "./roomMemberRules.js";
import { shouldDeleteInactiveRoom } from "./roomLifecycleRules.js";
import { canSyncTeamStats, canStartAuction, canSubmitRtmCounterBid } from "./roomAuthorizationRules.js";
import { systemEventReceiptKey, canPostSystemEvent } from "./systemEventRules.js";

initializeApp();
const database = getDatabase();

const BOT_IDS = new Set(["bot_MI", "bot_CSK", "bot_RCB", "bot_KKR", "bot_DC", "bot_PBKS", "bot_RR", "bot_SRH", "bot_GT", "bot_LSG"]);
const DECISIONS = new Set(["accept", "decline", "match", "decline_counter"]);

const PLAYER_CATALOG = {"p_621":{"basePrice":2,"country":"IND","role":"Bowler"},"p_622":{"basePrice":2,"country":"IND","role":"Batsman"},"p_101":{"basePrice":2,"country":"IND","role":"Bowler"},"p_102":{"basePrice":2,"country":"IND","role":"All-Rounder"},"p_103":{"basePrice":2,"country":"IND","role":"Bowler"},"p_104":{"basePrice":2,"country":"IND","role":"All-Rounder"},"p_105":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_106":{"basePrice":2,"country":"IND","role":"Wicket-Keeper"},"p_107":{"basePrice":2,"country":"OS","role":"Bowler"},"p_108":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_109":{"basePrice":2,"country":"OS","role":"Bowler"},"p_110":{"basePrice":2,"country":"OS","role":"Bowler"},"p_111":{"basePrice":2,"country":"IND","role":"Wicket-Keeper"},"p_112":{"basePrice":2,"country":"IND","role":"Bowler"},"p_114":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_116":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_117":{"basePrice":2,"country":"OS","role":"Bowler"},"p_118":{"basePrice":2,"country":"IND","role":"Bowler"},"p_119":{"basePrice":2,"country":"IND","role":"Bowler"},"p_120":{"basePrice":2,"country":"IND","role":"Wicket-Keeper"},"p_121":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_122":{"basePrice":2,"country":"OS","role":"Bowler"},"p_123":{"basePrice":2,"country":"OS","role":"Bowler"},"p_124":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_125":{"basePrice":2,"country":"OS","role":"Bowler"},"p_126":{"basePrice":2,"country":"IND","role":"All-Rounder"},"p_127":{"basePrice":2,"country":"IND","role":"Batsman"},"p_128":{"basePrice":2,"country":"IND","role":"Wicket-Keeper"},"p_129":{"basePrice":2,"country":"IND","role":"Batsman"},"p_130":{"basePrice":2,"country":"IND","role":"Batsman"},"p_132":{"basePrice":2,"country":"IND","role":"Wicket-Keeper"},"p_134":{"basePrice":2,"country":"IND","role":"All-Rounder"},"p_135":{"basePrice":2,"country":"IND","role":"Batsman"},"p_136":{"basePrice":2,"country":"IND","role":"Batsman"},"p_137":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_138":{"basePrice":2,"country":"OS","role":"Batsman"},"p_139":{"basePrice":2,"country":"OS","role":"Batsman"},"p_140":{"basePrice":2,"country":"OS","role":"Bowler"},"p_141":{"basePrice":2,"country":"IND","role":"Bowler"},"p_142":{"basePrice":2,"country":"IND","role":"Batsman"},"p_144":{"basePrice":2,"country":"IND","role":"Batsman"},"p_145":{"basePrice":2,"country":"IND","role":"Bowler"},"p_100":{"basePrice":2,"country":"OS","role":"Batsman"},"p_113":{"basePrice":2,"country":"OS","role":"Bowler"},"p_115":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_131":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_133":{"basePrice":2,"country":"OS","role":"Batsman"},"p_143":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_271":{"basePrice":2,"country":"OS","role":"Batsman"},"p_272":{"basePrice":2,"country":"OS","role":"Batsman"},"p_279":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_282":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_289":{"basePrice":1,"country":"OS","role":"Wicket-Keeper"},"p_146":{"basePrice":1,"country":"IND","role":"All-Rounder"},"p_150":{"basePrice":1,"country":"IND","role":"Wicket-Keeper"},"p_158":{"basePrice":1,"country":"IND","role":"Batsman"},"p_159":{"basePrice":1,"country":"IND","role":"All-Rounder"},"p_162":{"basePrice":1,"country":"IND","role":"Batsman"},"p_166":{"basePrice":1,"country":"IND","role":"Batsman"},"p_167":{"basePrice":1,"country":"OS","role":"Batsman"},"p_296":{"basePrice":2,"country":"OS","role":"Bowler"},"p_304":{"basePrice":2,"country":"IND","role":"Bowler"},"p_172":{"basePrice":0.75,"country":"OS","role":"Batsman"},"p_216":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_254":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_264":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_193":{"basePrice":0.5,"country":"IND","role":"Wicket-Keeper"},"p_196":{"basePrice":0.5,"country":"IND","role":"All-Rounder"},"p_240":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_281":{"basePrice":2,"country":"IND","role":"All-Rounder"},"p_285":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_147":{"basePrice":1,"country":"IND","role":"Bowler"},"p_148":{"basePrice":1,"country":"OS","role":"All-Rounder"},"p_149":{"basePrice":1,"country":"IND","role":"Bowler"},"p_151":{"basePrice":1,"country":"OS","role":"Batsman"},"p_152":{"basePrice":1,"country":"IND","role":"Bowler"},"p_153":{"basePrice":1,"country":"IND","role":"Bowler"},"p_154":{"basePrice":1,"country":"IND","role":"All-Rounder"},"p_155":{"basePrice":1,"country":"IND","role":"Bowler"},"p_156":{"basePrice":1,"country":"OS","role":"All-Rounder"},"p_157":{"basePrice":1,"country":"IND","role":"Bowler"},"p_160":{"basePrice":1,"country":"OS","role":"All-Rounder"},"p_161":{"basePrice":1,"country":"OS","role":"Batsman"},"p_164":{"basePrice":1,"country":"OS","role":"Batsman"},"p_165":{"basePrice":1,"country":"IND","role":"Bowler"},"p_168":{"basePrice":1,"country":"IND","role":"All-Rounder"},"p_292":{"basePrice":2,"country":"OS","role":"Bowler"},"p_300":{"basePrice":2,"country":"OS","role":"Bowler"},"p_301":{"basePrice":2,"country":"OS","role":"Bowler"},"p_303":{"basePrice":1,"country":"IND","role":"Bowler"},"p_174":{"basePrice":0.75,"country":"OS","role":"All-Rounder"},"p_180":{"basePrice":0.75,"country":"IND","role":"Bowler"},"p_183":{"basePrice":0.75,"country":"IND","role":"Batsman"},"p_185":{"basePrice":0.75,"country":"IND","role":"All-Rounder"},"p_186":{"basePrice":0.75,"country":"OS","role":"Wicket-Keeper"},"p_220":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_241":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_245":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_188":{"basePrice":0.5,"country":"IND","role":"Batsman"},"p_189":{"basePrice":0.5,"country":"IND","role":"Batsman"},"p_190":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_198":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_199":{"basePrice":0.5,"country":"IND","role":"All-Rounder"},"p_203":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_219":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_253":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_275":{"basePrice":0.75,"country":"IND","role":"Batsman"},"p_276":{"basePrice":0.75,"country":"IND","role":"Batsman"},"p_280":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_163":{"basePrice":1,"country":"IND","role":"All-Rounder"},"p_291":{"basePrice":1,"country":"IND","role":"Bowler"},"p_181":{"basePrice":0.75,"country":"OS","role":"Bowler"},"p_218":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_243":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_195":{"basePrice":0.5,"country":"IND","role":"Batsman"},"p_197":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_200":{"basePrice":0.5,"country":"IND","role":"Batsman"},"p_201":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_202":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_206":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_226":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_237":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_250":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_268":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_295":{"basePrice":2,"country":"OS","role":"Bowler"},"p_209":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_235":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_259":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_260":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_262":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_297":{"basePrice":2,"country":"OS","role":"Bowler"},"p_169":{"basePrice":0.75,"country":"OS","role":"Bowler"},"p_170":{"basePrice":0.75,"country":"OS","role":"All-Rounder"},"p_171":{"basePrice":0.75,"country":"OS","role":"All-Rounder"},"p_173":{"basePrice":0.75,"country":"OS","role":"Bowler"},"p_175":{"basePrice":0.75,"country":"OS","role":"All-Rounder"},"p_176":{"basePrice":0.75,"country":"IND","role":"Bowler"},"p_177":{"basePrice":0.75,"country":"OS","role":"All-Rounder"},"p_178":{"basePrice":0.75,"country":"OS","role":"Batsman"},"p_179":{"basePrice":0.75,"country":"OS","role":"Batsman"},"p_182":{"basePrice":0.75,"country":"OS","role":"Bowler"},"p_184":{"basePrice":0.75,"country":"OS","role":"Bowler"},"p_187":{"basePrice":0.75,"country":"OS","role":"Bowler"},"p_191":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_192":{"basePrice":0.5,"country":"IND","role":"All-Rounder"},"p_194":{"basePrice":0.5,"country":"IND","role":"Batsman"},"p_204":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_205":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_207":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_208":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_210":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_211":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_212":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_213":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_214":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_215":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_217":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_221":{"basePrice":0.3,"country":"OS","role":"All-Rounder"},"p_222":{"basePrice":0.3,"country":"OS","role":"Bowler"},"p_223":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_224":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_225":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_227":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_228":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_229":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_230":{"basePrice":0.3,"country":"OS","role":"Bowler"},"p_231":{"basePrice":0.3,"country":"OS","role":"All-Rounder"},"p_232":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_233":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_234":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_236":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_238":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_239":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_242":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_244":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_246":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_247":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_248":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_249":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_251":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_252":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_255":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_256":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_257":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_258":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_261":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_263":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_265":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_266":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_267":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_269":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_270":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_284":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_294":{"basePrice":2,"country":"OS","role":"Bowler"},"p_298":{"basePrice":0.75,"country":"IND","role":"Bowler"},"p_299":{"basePrice":1.5,"country":"OS","role":"Bowler"},"p_308":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_309":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_310":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_311":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_314":{"basePrice":0.5,"country":"IND","role":"All-Rounder"},"p_315":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_317":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_318":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_320":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_321":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_322":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_324":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_327":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_328":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_329":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_330":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_332":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_333":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_334":{"basePrice":0.5,"country":"IND","role":"Bowler"},"p_335":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_336":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_338":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_340":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_343":{"basePrice":0.75,"country":"OS","role":"Batsman"},"p_344":{"basePrice":0.75,"country":"IND","role":"Batsman"},"p_349":{"basePrice":1,"country":"OS","role":"All-Rounder"},"p_351":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_352":{"basePrice":0.75,"country":"OS","role":"All-Rounder"},"p_353":{"basePrice":2,"country":"OS","role":"All-Rounder"},"p_354":{"basePrice":1.5,"country":"OS","role":"All-Rounder"},"p_357":{"basePrice":0.75,"country":"OS","role":"All-Rounder"},"p_359":{"basePrice":0.75,"country":"OS","role":"Wicket-Keeper"},"p_360":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_364":{"basePrice":1.5,"country":"OS","role":"Wicket-Keeper"},"p_365":{"basePrice":2,"country":"OS","role":"Wicket-Keeper"},"p_366":{"basePrice":2,"country":"OS","role":"Bowler"},"p_368":{"basePrice":0.75,"country":"IND","role":"Bowler"},"p_369":{"basePrice":2,"country":"OS","role":"Bowler"},"p_370":{"basePrice":2,"country":"OS","role":"Bowler"},"p_371":{"basePrice":2,"country":"OS","role":"Bowler"},"p_373":{"basePrice":1.5,"country":"IND","role":"Bowler"},"p_382":{"basePrice":0.3,"country":"IND","role":"Batsman"},"p_387":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_390":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_391":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_393":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_395":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_398":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_400":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_402":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_403":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_404":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_406":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_407":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_408":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_410":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_413":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_901":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_902":{"basePrice":0.75,"country":"RSA","role":"All-Rounder"},"p_903":{"basePrice":1.5,"country":"ENG","role":"Bowler"},"p_904":{"basePrice":0.3,"country":"IND","role":"Batter"},"p_906":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_907":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_908":{"basePrice":0.75,"country":"ZIM","role":"Bowler"},"p_909":{"basePrice":0.75,"country":"IND","role":"Bowler"},"p_910":{"basePrice":0.3,"country":"IND","role":"Wicket-Keeper"},"p_911":{"basePrice":1,"country":"RSA","role":"All-Rounder"},"p_912":{"basePrice":1.5,"country":"RSA","role":"Bowler"},"p_913":{"basePrice":0.75,"country":"AUS","role":"All-Rounder"},"p_914":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_915":{"basePrice":0.3,"country":"IND","role":"All-Rounder"},"p_916":{"basePrice":0.3,"country":"IND","role":"Batter"},"p_917":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_918":{"basePrice":1,"country":"ENG","role":"Bowler"},"p_919":{"basePrice":0.3,"country":"IND","role":"Bowler"},"p_920":{"basePrice":0.75,"country":"ENG","role":"Bowler"},"p_921":{"basePrice":0.75,"country":"AUS","role":"All-Rounder"}};

export const placeBid = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, botAction = false, botUserId, botTeamId, botName, maxValuation, botBudget, timerSeconds } = request.data || {};
  requireRoomId(roomId);
  const roomRef = database.ref(`auctions/${roomId}`);
  const roomSnapshot = await roomRef.child("room").get();
  const room = roomSnapshot.val();
  if (!room) reject("Auction room not found.");
  if (room.status !== "active") reject("Bidding is not open for this auction.");

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
    bidderTeamId = String(botTeamId).replace(/^bot_/, "");
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
    const overseasLimit = effectiveOverseasLimit(room);
    const overseasCount = squad.reduce((n, item) => {
      const entry = PLAYER_CATALOG[typeof item === "string" ? item : item?.id];
      return n + (entry && entry.country !== "IND" ? 1 : 0);
    }, 0);
    if (player.country !== "IND" && overseasCount >= overseasLimit) return;
    const currentBid = Number(live.currentBid || 0);
    const nextBid = nextBidAmount(currentBid, player.basePrice);
    if (nextBid > Number(team.budgetRemaining || 0) || nextBid > maxBid) return;
    live.currentBid = nextBid;
    live.highBidderId = bidderId;
    live.highBidderName = bidderName;
    live.highBidderTeamId = bidderTeamId;
    const requestedSeconds = botAction
      ? (Number(timerSeconds) || Number(room.settings?.bidTimer) || 15)
      : (Number(room.settings?.bidTimer) || 15);
    const seconds = clampBidTimerSeconds(requestedSeconds);
    live.timerEndsAt = now + seconds * 1000;
    live.lastActivityAt = now;
    return live;
  }, undefined, false);

  if (!result.committed) reject("Bid failed: the timer expired, another bid was placed, or your franchise cannot afford this bid.");
  await roomRef.child("room/lastActivityAt").set(now);
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
  if (decision === "match") {
    const liveBefore = (await liveRef.get()).val();
    const offerBefore = liveBefore?.retentionOffer;
    if (!offerBefore || offerBefore.status !== "pending" || offerBefore.phase !== "match_decision") {
      reject("There is no active counter-price to match.");
    }
    if (botAction) {
      if (room.hostId !== uid || !BOT_IDS.has(offerBefore.eligibleUserId)) {
        reject("Only the host can decide for an auction bot.");
      }
    } else if (offerBefore.eligibleUserId !== uid
      || room.bannedPlayers?.includes(uid)
      || !(Array.isArray(room.players) ? room.players : []).some((player) => player?.id === uid)) {
      reject("You are not eligible to match this RTM counter-price.");
    }
    const originalTeamSnapshot = await roomRef.child("teams").child(roomId + "_" + offerBefore.eligibleUserId).get();
    if (!canAffordRtmMatch(originalTeamSnapshot.val(), offerBefore.counterBid)) {
      reject("Your franchise does not have enough remaining purse to match this counter-price.");
    }
  }
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
    } else if (offer.eligibleUserId !== uid
      || room.bannedPlayers?.includes(uid)
      || !(Array.isArray(room.players) ? room.players : []).some((player) => player?.id === uid)) {
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
  await roomRef.child("room/lastActivityAt").set(clickedAt);
  return { ok: true, phase: result.snapshot.val()?.retentionOffer?.phase };
});

export const submitRetentionCounterBid = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, amount, botAction = false } = request.data || {};
  const suppliedBotId = String(request.data?.botTeamId || "");
  const botUserId = suppliedBotId.startsWith("bot_") ? suppliedBotId : "bot_" + suppliedBotId;
  requireRoomId(roomId);
  const counterBid = Number(Number(amount).toFixed(2));
  if (!Number.isFinite(counterBid) || counterBid <= 0) {
    throw new HttpsError("invalid-argument", "Enter a valid counter-bid.");
  }

  const rootRef = database.ref(`auctions/${roomId}`);
  const now = Date.now();
  let failureReason = "Counter-bid is no longer valid, or you are not authorized to submit it.";
  const result = await rootRef.transaction((current) => {
    if (!current?.room || !current.live) {
      failureReason = "Auction room or live offer could not be found.";
      return;
    }
    const room = current.room;
    const live = current.live;
    const offer = live.retentionOffer;
    if (room.status !== "active") {
      failureReason = "The auction is not active.";
      return;
    }
    if (live.status !== "processing_sale" || !offer || offer.status !== "pending" || offer.phase !== "counter_bid") {
      failureReason = "There is no open RTM counter-bid window.";
      return;
    }
    const teamUserId = botAction ? botUserId : uid;
    const team = current.teams?.[`${roomId}_${teamUserId}`];
    if (!canSubmitRtmCounterBid({ uid, room, offer, team, botAction, botIds: [...BOT_IDS] })) {
      failureReason = "Only the active eligible buyer, or the active host acting for the matching bot buyer, can submit this counter-bid.";
      return;
    }
    if (now > Number(offer.expiresAt || 0)) {
      failureReason = "The counter-bid window has expired.";
      return;
    }
    if (counterBid <= Number(offer.bid || 0)) {
      failureReason = "Your counter-bid must exceed the current price.";
      return;
    }
    const purse = Number(team.budgetRemaining ?? room.settings?.budget ?? 120);
    if (counterBid > purse) {
      failureReason = "Your franchise does not have enough remaining purse for this counter-bid.";
      return;
    }

    const nextOffer = {
      ...offer,
      counterBid,
      phase: "match_decision",
      decision: null,
      decidedBy: null,
      decidedAt: null,
      expiresAt: now + 10000
    };
    return {
      ...current,
      room: { ...room, lastActivityAt: now },
      live: {
        ...live,
        currentBid: counterBid,
        retentionOffer: nextOffer,
        lastActivityAt: now
      }
    };
  }, undefined, false);

  if (!result.committed) reject(failureReason);
  return { ok: true, counterBid, expiresAt: result.snapshot.val()?.live?.retentionOffer?.expiresAt };
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
    if (squad.length >= Number(room.squadLimit || room.settings?.squadLimit || 25)
      || (player.country !== "IND" && overseas >= effectiveOverseasLimit(room))) return;
    return applySaleToTeam(current, playerId, price, retained);
  }, undefined, false);
  const finalTeam = result.snapshot.val();
  const alreadyApplied = Array.isArray(finalTeam?.squad) && finalTeam.squad.some((p) => (typeof p === "string" ? p : p?.id) === playerId);
  if (!alreadyApplied) reject("Sale settlement failed; purse or squad limits may have changed.");
  await root.child("room/players").transaction((players) => {
    if (!Array.isArray(players)) return;
    return players.map((p) => p.id === buyerId ? { ...p, spent: Number(finalTeam.spent || 0), squadCount: finalTeam.squad.length } : p);
  }, undefined, false);
  await root.child("room/lastActivityAt").set(Date.now());
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

export const joinAuctionRoom = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, userId, userName } = request.data || {};
  requireRoomId(roomId);
  if (userId !== uid) reject("You can only join a room as yourself.");
  if (typeof userName !== "string" || !userName.trim() || userName.trim().length > 80) {
    throw new HttpsError("invalid-argument", "Enter a valid display name.");
  }

  const roomRef = database.ref(`auctions/${roomId}/room`);
  const joinedAt = Date.now();
  const result = await roomRef.transaction((current) => {
    return upsertRoomMember(current, uid, userName.trim(), joinedAt) || undefined;
  }, undefined, false);
  if (!result.committed) {
    const latest = result.snapshot.val();
    if (latest?.status === "completed") reject("This auction has already ended.");
    if (Array.isArray(latest?.bannedPlayers) && latest.bannedPlayers.includes(uid)) {
      reject("You have been removed from this room and cannot rejoin.");
    }
    reject("Could not join the room. Please refresh and try again.");
  }
  return { ok: true, joinedAt };
});


export const postAuctionSystemEvent = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, event } = request.data || {};
  requireRoomId(roomId);
  const messages = {
    auction_started: "Auction has started!",
    bidding_ended: "Bidding has ended. Submit your Playing XI within 2 minutes.",
    auction_paused: "Auction PAUSED by Admin",
    auction_resumed: "Auction RESUMED by Admin",
    auction_ended: "Auction ended. Submit your Playing XI within 2 minutes.",
    xi_submitted: "Playing XI submitted.",
    auction_completed: "Auction rankings are ready. Open Auction Summary to view the results.",
    sale_result: "",
    rtm_result: "",
    player_removed: "A player has been removed from the session."
  };
  if (!Object.hasOwn(messages, event)) {
    throw new HttpsError("invalid-argument", "Unsupported system event.");
  }
  const root = database.ref("auctions/" + roomId);
  const [roomSnap, liveSnap] = await Promise.all([root.child("room").get(), root.child("live").get()]);
  const room = roomSnap.val();
  const live = liveSnap.val();
  if (!room) reject("Auction room could not be found.");
  let savedXI = false;
  if (event === "xi_submitted") {
    const xiSnap = await root.child("teams").child(`${roomId}_${uid}`).child("playingXI").get();
    savedXI = xiSnap.exists();
  }
  if (!canPostSystemEvent({ event, uid, room, hasSavedXI: savedXI })) {
    reject("You are not authorized to post this event, or the auction is not in the required state.");
  }
  let text = messages[event];
  let type = "log";
  if (event === "sale_result") {
    if (!["sold", "unsold"].includes(live?.status)) reject("There is no completed player lot to announce.");
    text = live.status === "sold"
      ? String(live.playerId) + " SOLD to " + String(live.highBidderName || "winning franchise") + " for ₹" + Number(live.currentBid || 0) + " Cr"
      : String(live.playerId) + " UNSOLD";
    type = live.status === "sold" ? "sold_card" : "log";
  } else if (event === "rtm_result") {
    const offer = live?.retentionOffer;
    if (live?.status !== "sold" || !["accepted", "declined", "expired"].includes(offer?.status)) reject("The RTM result is not final.");
    text = offer.status === "accepted"
      ? "RTM decision completed for " + String(live.highBidderName || "winning franchise") + "."
      : "RTM not matched. " + String(live.playerId) + " goes to " + String(live.highBidderName || "winning franchise") + " for ₹" + Number(live.currentBid || 0) + " Cr.";
    type = offer.status === "accepted" ? "retention_accepted" : "log";
  }
  const now = Date.now();
  const receiptKey = systemEventReceiptKey(event, room, live, uid);
  // Use a deterministic message key as the idempotency boundary. This avoids
  // orphaned receipts if a process crashes after claiming a receipt but before
  // writing its message. Concurrent clients race on one transaction instead.
  const messageRef = root.child("messages").child(`system_${receiptKey}`);
  const message = { userId: "system", userName: "System", text, type, timestamp: now };
  const posted = await messageRef.transaction((current) => {
    if (current) return;
    return message;
  }, undefined, false);
  if (!posted.committed) return { ok: true, messageId: messageRef.key, duplicate: true };
  await root.child("room/lastActivityAt").set(now);
  return { ok: true, messageId: messageRef.key, duplicate: false };
});


export const sendAuctionChatMessage = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, text } = request.data || {};
  requireRoomId(roomId);
  if (typeof text !== "string") {
    throw new HttpsError("invalid-argument", "Enter a valid message.");
  }
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 500) {
    throw new HttpsError("invalid-argument", "Messages must contain 1 to 500 characters.");
  }

  const roomRef = database.ref(`auctions/${roomId}/room`);
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  const member = (Array.isArray(room.players) ? room.players : []).find((p) => p?.id === uid);
  if (!member || room.bannedPlayers?.includes(uid)) {
    reject("Only an active room member can send messages.");
  }

  const messageRef = database.ref(`auctions/${roomId}/messages`).push();
  const now = Date.now();
  await messageRef.set({
    userId: uid,
    userName: String(member.name || "Manager").slice(0, 80),
    text: cleanText,
    type: "text",
    timestamp: now
  });
  await roomRef.child("lastActivityAt").set(now);
  return { ok: true, messageId: messageRef.key, timestamp: now };
});


export const touchAuctionActivity = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  requireRoomId(roomId);
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  const member = (Array.isArray(room.players) ? room.players : []).some((p) => p?.id === uid);
  if (!member || room.bannedPlayers?.includes(uid)) reject("Only an active room member can refresh activity.");
  const now = Date.now();
  await roomRef.child("lastActivityAt").set(now);
  return { ok: true, lastActivityAt: now };
});


export const syncRoomPlayerStats = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, userId } = request.data || {};
  requireRoomId(roomId);
  if (typeof userId !== "string" || !userId) {
    throw new HttpsError("invalid-argument", "A valid team member is required.");
  }

  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const [roomSnap, teamSnap] = await Promise.all([
    roomRef.get(),
    root.child("teams").child(`${roomId}_${userId}`).get()
  ]);
  const room = roomSnap.val();
  const team = teamSnap.val();
  if (!room) reject("Auction room could not be found.");
  const activeCaller = (Array.isArray(room.players) ? room.players : []).some((p) => p?.id === uid)
    && !(Array.isArray(room.bannedPlayers) && room.bannedPlayers.includes(uid));
  if (!canSyncTeamStats(uid, userId, room.hostId, activeCaller)) {
    reject("Only the manager or room host can synchronize these team totals.");
  }
  if (!team || team.userId !== userId) reject("The authoritative team record could not be found.");
  const playersRef = roomRef.child("players");
  const result = await playersRef.transaction((current) => {
    if (!Array.isArray(current)) return;
    if (!current.some((p) => p?.id === userId)) return;
    return current.map((p) => p?.id === userId
      ? {
          ...p,
          spent: Number(team.spent || 0),
          squadCount: Array.isArray(team.squad) ? team.squad.length : 0
        }
      : p);
  }, undefined, false);
  if (!result.committed) reject("Could not synchronize team totals to the room roster.");
  return {
    ok: true,
    userId,
    spent: Number(team.spent || 0),
    squadCount: Array.isArray(team.squad) ? team.squad.length : 0
  };
});


export const updatePlayerTeam = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, userId, teamId } = request.data || {};
  requireRoomId(roomId);
  if (typeof userId !== "string" || !userId || !Object.hasOwn(FRANCHISES, teamId)) {
    throw new HttpsError("invalid-argument", "Choose a valid franchise.");
  }

  if (uid !== userId) {
    const initialRoomSnap = await database.ref(`auctions/${roomId}/room`).get();
    const initialRoom = initialRoomSnap.val();
    if (!initialRoom || initialRoom.hostId !== uid) {
      reject("You cannot change another manager's franchise.");
    }
  }

  // Commit the roster reservation and authoritative team record in ONE root
  // transaction. Separate room and team writes could previously leave a
  // franchise reserved in the lobby while its purse/squad record stayed stale.
  const rootRef = database.ref(`auctions/${roomId}`);
  const now = Date.now();
  let failureReason = "The auction may have started or that franchise was just selected. Refresh the room and choose again.";
  const result = await rootRef.transaction((current) => {
    if (!current || !current.room) {
      failureReason = "Auction room could not be found.";
      return;
    }
    const room = current.room;
    if (!canChangeFranchise(room.status)) {
      failureReason = "Franchises can only be changed before the auction starts.";
      return;
    }
    if (uid !== userId && room.hostId !== uid) {
      failureReason = "You cannot change another manager's franchise.";
      return;
    }
    if (Array.isArray(room.bannedPlayers) && room.bannedPlayers.includes(userId)) {
      failureReason = "This manager is not an active member of the room.";
      return;
    }
    const members = Array.isArray(room.players) ? room.players : [];
    if (!members.some((p) => p?.id === userId)) {
      failureReason = "This manager is not an active member of the room.";
      return;
    }
    if (!isFranchiseAvailable(members, userId, teamId)) {
      failureReason = "That franchise has already been selected in this room.";
      return;
    }

    const teamKey = `${roomId}_${userId}`;
    const existingTeam = current.teams?.[teamKey] || null;
    if (hasPurchasedPlayers(existingTeam)) {
      failureReason = "A franchise cannot be changed after players have been purchased.";
      return;
    }
    const teamRecord = buildTeamAssignmentRecord(
      existingTeam, roomId, userId, teamId, FRANCHISES[teamId],
      Number(room.settings?.budget ?? 120)
    );
    return {
      ...current,
      room: {
        ...room,
        players: members.map((p) => p?.id === userId
          ? { ...p, team: teamId, teamName: FRANCHISES[teamId] }
          : p),
        lastActivityAt: now
      },
      teams: { ...(current.teams || {}), [teamKey]: teamRecord }
    };
  }, undefined, false);

  if (!result.committed) reject(failureReason);
  return { ok: true, teamId, teamName: FRANCHISES[teamId] };
});



export const completeWinnerAnalysis = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, rankings, model } = request.data || {};
  requireRoomId(roomId);
  if (!Array.isArray(rankings) || rankings.length < 1 || rankings.length > 20) {
    throw new HttpsError("invalid-argument", "Invalid winner rankings.");
  }
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room not found.");
  if (room.hostId !== uid) reject("Only the host can save winner rankings.");
  if (room.status !== "analyzing") reject("Winner analysis is not currently running.");

  const teamsSnap = await root.child("teams").get();
  const teams = Object.values(teamsSnap.val() || {}).filter((t) => t?.teamId && t.teamId !== "NONE");
  const expectedIds = new Set(teams.map((t) => t.teamId));
  const seenIds = new Set();
  const seenRanks = new Set();
  for (const item of rankings) {
    if (!item || typeof item.franchiseId !== "string" || !expectedIds.has(item.franchiseId) ||
        seenIds.has(item.franchiseId) || !Number.isInteger(item.rank) || item.rank < 1 ||
        item.rank > rankings.length || seenRanks.has(item.rank)) {
      throw new HttpsError("invalid-argument", "Rankings must include valid, unique franchises and ranks.");
    }
    if (typeof item.summary !== "string" || item.summary.length > 3000 ||
        (item.strengths != null && (!Array.isArray(item.strengths) || item.strengths.length > 20)) ||
        (item.risks != null && (!Array.isArray(item.risks) || item.risks.length > 20))) {
      throw new HttpsError("invalid-argument", "Ranking details are invalid.");
    }
    seenIds.add(item.franchiseId);
    seenRanks.add(item.rank);
  }
  if (seenIds.size !== expectedIds.size || seenRanks.size !== rankings.length) {
    throw new HttpsError("invalid-argument", "Every franchise must appear exactly once.");
  }
  const normalizedModel = typeof model === "string" ? model.slice(0, 80) : "AI";
  const result = await roomRef.transaction((current) => {
    if (!current || current.status !== "analyzing") return;
    return { ...current, status: "completed", winnerAnalysisStatus: "completed",
      winnerRankings: rankings, winnerAnalysisModel: normalizedModel,
      winnerAnalysisCompletedAt: Date.now(), winnerAnalysisError: null };
  }, undefined, false);
  if (!result.committed) reject("Winner analysis was already completed.");
  await database.ref(`publicRooms/${roomId}`).remove().catch(() => {});
  return { ok: true };
});

export const failWinnerAnalysis = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, errorMessage } = request.data || {};
  requireRoomId(roomId);
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const snap = await roomRef.get();
  const room = snap.val();
  if (!room) reject("Auction room not found.");
  if (room.hostId !== uid) reject("Only the host can mark winner analysis as failed.");
  const message = typeof errorMessage === "string" ? errorMessage.slice(0, 500) : "AI analysis failed";
  const result = await roomRef.transaction((current) => {
    if (!current || current.status !== "analyzing") return;
    return { ...current, status: "analysis_failed", winnerAnalysisStatus: "failed",
      winnerAnalysisError: message, lastActivityAt: Date.now() };
  }, undefined, false);
  if (!result.committed) reject("Winner analysis state has already changed.");
  return { ok: true };
});

export const claimWinnerAnalysis = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  requireRoomId(roomId);
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  if (room.hostId !== uid) reject("Only the room host can start winner analysis.");
  if (!(Array.isArray(room.players) ? room.players : []).some((p) => p?.id === uid) || room.bannedPlayers?.includes(uid)) {
    reject("Only an active room member can start winner analysis.");
  }
  if (room.status !== "awaiting_xi") reject("The auction is not waiting for Playing XI submissions.");
  const teamsSnap = await root.child("teams").get();
  const teams = Object.values(teamsSnap.val() || {}).filter((t) => t?.teamId && t.teamId !== "NONE" && !t.disqualified);
  const allSubmitted = teams.length >= 2 && teams.every((t) =>
    Array.isArray(t.playingXI?.startingXI) && t.playingXI.startingXI.length === 11 && Boolean(t.playingXI.impactPlayer));
  const now = Date.now();
  if (now < Number(room.xiSubmissionDeadline || 0) && !allSubmitted) {
    reject("Winner analysis cannot start until every eligible franchise submits or the deadline passes.");
  }
  const result = await roomRef.transaction((current) => {
    if (!current || current.status !== "awaiting_xi") return;
    return { ...current, status: "analyzing", winnerAnalysisStatus: "analyzing", lastActivityAt: now };
  }, undefined, false);
  if (!result.committed) reject("Winner analysis has already been claimed by another client.");
  return { ok: true, claimed: true };
});

export const retryWinnerAnalysis = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  requireRoomId(roomId);
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  if (room.hostId !== uid) reject("Only the room host can retry winner analysis.");
  if (room.status !== "analysis_failed") reject("There is no failed winner analysis to retry.");
  const result = await roomRef.transaction((current) => {
    if (!current || current.status !== "analysis_failed") return;
    return { ...current, status: "awaiting_xi", winnerAnalysisStatus: "collecting", winnerAnalysisError: null };
  }, undefined, false);
  if (!result.committed) reject("Winner analysis retry was already claimed.");
  return { ok: true };
});


export const expireAuctionLot = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, expectedPlayerId } = request.data || {};
  requireRoomId(roomId);
  if (typeof expectedPlayerId !== "string" || !PLAYER_CATALOG[expectedPlayerId]) {
    throw new HttpsError("invalid-argument", "Invalid current player.");
  }
  const root = database.ref(`auctions/${roomId}`);
  const [roomSnap, teamsSnap] = await Promise.all([root.child("room").get(), root.child("teams").get()]);
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  const roster = Array.isArray(room.players) ? room.players : [];
  if (!roster.some((p) => p?.id === uid) || room.bannedPlayers?.includes(uid)) reject("Only an active room member can expire a lot.");
  if (room.status !== "active") reject("The auction is not active.");
  const teams = teamsSnap.val() || {};
  const now = Date.now();
  let outcome = null;
  const liveRef = root.child("live");
  const tx = await liveRef.transaction((live) => {
    outcome = null;
    if (!live || live.playerId !== expectedPlayerId || live.status !== "bidding") return;
    if (Number(live.timerEndsAt) > now) return;
    const sold = Boolean(live.highBidderId);
    let offer = null;
    if (sold) {
      const originalFranchiseId = PLAYER_ORIGINAL_FRANCHISES[live.playerId];
      const buyerFranchiseId = live.highBidderTeamId;
      const eligiblePlayer = roster.find((p) => p?.team === originalFranchiseId && p.id !== live.highBidderId);
      const teamEntry = Object.entries(teams).find(([, t]) => t?.userId === eligiblePlayer?.id && t?.teamId === originalFranchiseId);
      const team = teamEntry?.[1] || {};
      const cards = Number(team.retentionCardsRemaining ?? 2);
      const purse = Number(team.budgetRemaining ?? room.settings?.budget ?? 120);
      if (originalFranchiseId && originalFranchiseId !== buyerFranchiseId && eligiblePlayer && cards > 0 && purse >= Number(live.currentBid || 0)) {
        offer = {
          playerId: live.playerId, originalFranchiseId, eligibleUserId: eligiblePlayer.id,
          eligibleTeamName: eligiblePlayer.teamName || originalFranchiseId,
          buyerId: live.highBidderId, buyerTeamId: buyerFranchiseId, buyerName: live.highBidderName,
          bid: Number(live.currentBid || 0), counterBid: null, phase: "initial_decision",
          rtmUsed: false, expiresAt: now + 10000, status: "pending", decision: null
        };
      }
    }
    live.status = offer ? "processing_sale" : (sold ? "sold" : "unsold");
    if (offer) live.retentionOffer = offer;
    else live.transitionDeadline = now + (sold ? 5000 : 2000) + 2500;
    outcome = offer ? "rtm_opened" : (sold ? "sold" : "unsold");
    return live;
  }, undefined, false);
  if (!tx.committed) return { ok: false, committed: false, state: tx.snapshot.val() || null };
  await root.child("room/lastActivityAt").set(now);
  return { ok: true, committed: true, outcome, state: tx.snapshot.val() };
});


export const finalizeExpiredRetentionOffer = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  requireRoomId(roomId);
  const root = database.ref(`auctions/${roomId}`);
  const roomSnap = await root.child("room").get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  const roster = Array.isArray(room.players) ? room.players : [];
  if (!roster.some((p) => p?.id === uid) || room.bannedPlayers?.includes(uid)) reject("Only an active room member can settle an expired RTM offer.");
  const now = Date.now();
  const liveRef = root.child("live");
  const tx = await liveRef.transaction((live) => {
    if (!live || live.status !== "processing_sale") return;
    const offer = live.retentionOffer;
    if (!offer || offer.status !== "pending") return;
    const initialDeclined = offer.phase === "initial_decision" && offer.decision === "decline" && Number(offer.decidedAt) <= Number(offer.expiresAt);
    const matchDecisionMade = offer.phase === "match_decision" && ["match", "decline_counter"].includes(offer.decision) && Number(offer.decidedAt) <= Number(offer.expiresAt);
    if (!initialDeclined && !matchDecisionMade && now < Number(offer.expiresAt) + 1500) return;
    if (offer.phase === "counter_bid" && offer.rtmUsed) {
      live.highBidderId = offer.eligibleUserId;
      live.highBidderName = offer.eligibleTeamName;
      live.highBidderTeamId = offer.originalFranchiseId;
      live.currentBid = Number(offer.bid || live.currentBid || 0);
      offer.status = "accepted";
    } else if (offer.phase === "match_decision" && offer.counterBid != null) {
      if (offer.decision === "match" && Number(offer.decidedAt) <= Number(offer.expiresAt)) {
        live.highBidderId = offer.eligibleUserId;
        live.highBidderName = offer.eligibleTeamName;
        live.highBidderTeamId = offer.originalFranchiseId;
        live.currentBid = Number(offer.counterBid);
        offer.status = "accepted";
      } else {
        live.highBidderId = offer.buyerId;
        live.highBidderName = offer.buyerName;
        live.highBidderTeamId = offer.buyerTeamId;
        live.currentBid = Number(offer.counterBid);
        offer.status = "declined";
      }
    } else {
      offer.status = offer.decision === "decline" ? "declined" : "expired";
    }
    live.status = live.highBidderId ? "sold" : "unsold";
    live.transitionDeadline = now + (live.status === "sold" ? 5000 : 2000) + 2500;
    return live;
  }, undefined, false);
  if (!tx.committed) return { ok: false, committed: false, state: tx.snapshot.val() || null };
  await root.child("room/lastActivityAt").set(now);
  return { ok: true, committed: true, state: tx.snapshot.val() };
});


export const advanceAuctionPlayer = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, expectedPlayerId } = request.data || {};
  requireRoomId(roomId);
  if (typeof expectedPlayerId !== "string" || !PLAYER_CATALOG[expectedPlayerId]) {
    throw new HttpsError("invalid-argument", "Invalid current player.");
  }
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const [roomSnap, orderSnap] = await Promise.all([roomRef.get(), root.child("playerOrderIds").get()]);
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  const players = Array.isArray(room.players) ? room.players : [];
  if (!players.some((p) => p?.id === uid) || room.bannedPlayers?.includes(uid)) reject("Only an active room member can advance the auction.");
  if (room.status !== "active") reject("The auction is not active.");
  const order = orderSnap.val();
  if (!Array.isArray(order) || !order.length || order.some((id) => typeof id !== "string" || !PLAYER_CATALOG[id])) {
    reject("The server-side player order is missing or invalid.");
  }
  const liveRef = root.child("live");
  const now = Date.now();
  let reachedEnd = false;
  const tx = await liveRef.transaction((current) => {
    reachedEnd = false;
    if (!current || current.playerId !== expectedPlayerId || !["sold", "unsold"].includes(current.status)) return;
    if (!Number.isFinite(Number(current.transitionDeadline)) || now < Number(current.transitionDeadline)) return;
    const currentIndex = order.indexOf(current.playerId);
    const nextId = currentIndex >= 0 ? order[currentIndex + 1] : null;
    if (!nextId) {
      reachedEnd = true;
      return {
        ...current,
        status: "awaiting_xi",
        transitionDeadline: null
      };
    }
    return {
      playerId: nextId,
      currentBid: 0,
      highBidderId: "",
      highBidderName: "No Bids",
      highBidderTeamId: "",
      timerEndsAt: now + clampBidTimerSeconds(room.settings?.bidTimer, 15) * 1000,
      status: "bidding"
    };
  }, undefined, false);
  if (!tx.committed) return { ok: false, advanced: false };
  if (reachedEnd) {
    await roomRef.update({
      status: "awaiting_xi",
      xiSubmissionStartedAt: now,
      xiSubmissionDeadline: now + 120000,
      winnerAnalysisStatus: "collecting",
      lastActivityAt: now
    });
  } else {
    await roomRef.child("lastActivityAt").set(now);
  }
  return { ok: true, advanced: true, reachedEnd };
});


export const startAuction = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, playerOrder, playerOrderIds, firstPlayerId } = request.data || {};
  requireRoomId(roomId);
  if (!Array.isArray(playerOrder) || playerOrder.length < 1 || playerOrder.length > 1000 ||
      playerOrder.some((index) => !Number.isInteger(index) || index < 0 || index > 999) ||
      new Set(playerOrder).size !== playerOrder.length ||
      typeof firstPlayerId !== "string" || !PLAYER_CATALOG[firstPlayerId]) {
    throw new HttpsError("invalid-argument", "Invalid auction player order.");
  }
  if (!Array.isArray(playerOrderIds) || playerOrderIds.length !== playerOrder.length ||
      playerOrderIds.some((id) => typeof id !== "string" || !PLAYER_CATALOG[id]) ||
      new Set(playerOrderIds).size !== playerOrderIds.length ||
      playerOrderIds[0] !== firstPlayerId) {
    throw new HttpsError("invalid-argument", "Invalid canonical player order.");
  }
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  if (room.hostId !== uid) reject("Only the room host can start the auction.");
  const liveRef = root.child("live");
  const liveSnap = await liveRef.get();
  if (!canStartAuction(room, liveSnap.exists(), uid)) {
    reject("The auction has already started or the host is not an active room member.");
  }
  const now = Date.now();
  const claim = await roomRef.transaction((current) => {
    if (!canStartAuction(current, false, uid)) return;
    return { ...current, status: "active", playerOrder, lastActivityAt: now };
  }, undefined, false);
  if (!claim.committed) reject("Another start request won the race. Refresh the room.");
  const claimedRoom = claim.snapshot.val();
  const updates = {
    "playerOrder": playerOrder,
    "playerOrderIds": playerOrderIds,
    "live": {
      playerId: firstPlayerId,
      currentBid: 0,
      highBidderId: "",
      highBidderName: "No Bids",
      highBidderTeamId: "",
      timerEndsAt: now + clampBidTimerSeconds(claimedRoom.settings?.bidTimer, 15) * 1000,
      status: "bidding"
    },
    "room/winnerAnalysisStatus": null
  };
  try {
    await root.update(updates);
  } catch (error) {
    // If initialization fails after the room claim, allow a safe retry only
    // while no live lot has been created.
    const latestLive = await liveRef.get();
    if (!latestLive.exists()) {
      await roomRef.transaction((current) => {
        if (!current || current.status !== "active" || current.lastActivityAt !== now) return;
        return { ...current, status: room.status || "waiting", playerOrder: null, lastActivityAt: Date.now() };
      }, undefined, false);
    }
    throw error;
  }
  try { await database.ref(`publicRooms/${roomId}`).update({ status: "active" }); } catch {}
  return { ok: true, startedAt: now };
});


export const manageAuctionBots = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, action, teamId, botUserId } = request.data || {};
  requireRoomId(roomId);
  if (!["add", "remove", "fill_empty"].includes(action)) {
    throw new HttpsError("invalid-argument", "Invalid bot action.");
  }
  if (action === "add" && !Object.hasOwn(FRANCHISES, teamId)) {
    throw new HttpsError("invalid-argument", "Invalid franchise.");
  }
  const removeMatch = action === "remove" ? /^bot_(MI|CSK|RCB|KKR|DC|PBKS|RR|SRH|GT|LSG)$/.exec(String(botUserId || "")) : null;
  if (action === "remove" && !removeMatch) {
    throw new HttpsError("invalid-argument", "Invalid bot identifier.");
  }

  const rootRef = database.ref("auctions/" + roomId);
  const now = Date.now();
  let failureReason = "Could not update bots. Refresh the room and try again.";
  let added = [];
  const result = await rootRef.transaction((current) => {
    added = [];
    if (!current?.room) {
      failureReason = "Auction room could not be found.";
      return;
    }
    const room = current.room;
    if (room.hostId !== uid) {
      failureReason = "Only the room host can manage bots.";
      return;
    }
    if (room.status && !["waiting", "lobby"].includes(room.status)) {
      failureReason = "Bots can only be managed before the auction starts.";
      return;
    }
    const players = Array.isArray(room.players) ? room.players : [];
    const teams = { ...(current.teams || {}) };
    const nextPlayers = [...players];

    if (action === "remove") {
      const targetId = removeMatch[0];
      if (!nextPlayers.some((player) => player?.id === targetId)) {
        failureReason = "That bot is not in the room.";
        return;
      }
      const next = {
        ...current,
        room: { ...room, players: nextPlayers.filter((player) => player?.id !== targetId), lastActivityAt: now },
        teams
      };
      delete next.teams[`${roomId}_${targetId}`];
      return next;
    }

    const budget = Number(room.settings?.budget || 120);
    const requestedTeams = action === "add" ? [teamId] : Object.keys(FRANCHISES);
    const taken = new Set(nextPlayers.map((player) => player?.team).filter(Boolean));
    for (const id of requestedTeams) {
      if (taken.has(id) || nextPlayers.some((player) => player?.id === `bot_${id}`)) continue;
      nextPlayers.push({
        id: `bot_${id}`, name: `${FRANCHISES[id]} Bot`, team: id,
        teamName: FRANCHISES[id], isHost: false, isBot: true
      });
      teams[`${roomId}_bot_${id}`] = {
        auctionId: roomId, userId: `bot_${id}`, teamId: id, teamName: FRANCHISES[id],
        budgetRemaining: budget, spent: 0, squad: [], retentionCardsRemaining: 2
      };
      taken.add(id);
      added.push(id);
    }
    return {
      ...current,
      room: { ...room, players: nextPlayers, lastActivityAt: now },
      teams
    };
  }, undefined, false);

  if (!result.committed) reject(failureReason);
  return { ok: true, action, added };
});


export const kickAuctionPlayer = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, playerId } = request.data || {};
  requireRoomId(roomId);
  if (typeof playerId !== "string" || playerId.length < 1 || playerId.length > 128) {
    throw new HttpsError("invalid-argument", "Invalid player.");
  }
  const root = database.ref(`auctions/${roomId}`);
  const roomRef = root.child("room");
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  if (room.hostId !== uid) reject("Only the room host can remove a player.");
  if (room.status && !["waiting", "lobby"].includes(room.status)) {
    reject("Players can only be removed before the auction starts.");
  }

  const members = Array.isArray(room.players) ? room.players : [];
  const target = members.find((player) => player?.id === playerId);
  if (!target) reject("That player is no longer in this room.");
  const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : [];
  const updates = {
    "room/players": members.filter((player) => player?.id !== playerId),
    "room/bannedPlayers": [...new Set([...banned, playerId])],
    "room/lastActivityAt": Date.now(),
  };
  updates[`teams/${roomId}_${playerId}`] = null;
  await root.update(updates);
  return { ok: true, playerName: String(target.name || "Player").slice(0, 80) };
});


export const updateAuctionControls = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, action, settings } = request.data || {};
  requireRoomId(roomId);
  if (!["update_settings", "pause", "resume"].includes(action)) {
    throw new HttpsError("invalid-argument", "Invalid auction control action.");
  }
  const roomRef = database.ref(`auctions/${roomId}/room`);
  const roomSnap = await roomRef.get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  if (room.hostId !== uid) reject("Only the room host can change auction controls.");

  if (action === "update_settings") {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new HttpsError("invalid-argument", "Invalid auction settings.");
    }
    const rootRef = database.ref("auctions/" + roomId);
    let failureReason = "Could not update auction settings. Refresh and try again.";
    let appliedSettings = null;
    const now = Date.now();
    const result = await rootRef.transaction((current) => {
      if (!current?.room) {
        failureReason = "Auction room could not be found.";
        return;
      }
      const currentRoom = current.room;
      if (currentRoom.hostId !== uid) {
        failureReason = "Only the room host can change auction controls.";
        return;
      }
      const coreSettings = ["budget", "squadLimit", "overseasLimit", "auctionType"];
      const changingCoreSettings = coreSettings.some((key) => Object.hasOwn(settings, key));
      if (changingCoreSettings && !["waiting", "lobby"].includes(currentRoom.status || "waiting")) {
        failureReason = "Budget, squad limits, overseas limits, and auction mode can only be changed before the auction starts.";
        return;
      }
      const teams = current.teams || {};
      if (changingCoreSettings) {
        const hasPurchases = Object.values(teams).some((team) =>
          (Array.isArray(team?.squad) && team.squad.length > 0) || Number(team?.spent || 0) > 0
        );
        if (hasPurchases) {
          failureReason = "Auction rules cannot be changed after a franchise has purchased players.";
          return;
        }
      }
      const currentMode = currentRoom.settings?.auctionType || currentRoom.auctionType || "mega";
      const normalized = normalizeAuctionSettings(settings, currentMode);
      if (!normalized.valid) {
        failureReason = normalized.error;
        return;
      }
      appliedSettings = normalized.settings;
      const nextRoom = {
        ...currentRoom,
        settings: { ...(currentRoom.settings || {}), ...normalized.settings },
        lastActivityAt: now
      };
      if (normalized.settings.auctionType !== undefined) nextRoom.auctionType = normalized.settings.auctionType;
      if (normalized.settings.overseasLimit !== undefined) nextRoom.overseasLimit = normalized.settings.overseasLimit;
      if (normalized.settings.squadLimit !== undefined) nextRoom.squadLimit = normalized.settings.squadLimit;
      let nextTeams = teams;
      if (normalized.settings.budget !== undefined) {
        nextTeams = Object.fromEntries(Object.entries(teams).map(([key, team]) => [
          key, { ...team, budgetRemaining: Number(normalized.settings.budget) }
        ]));
      }
      return { ...current, room: nextRoom, teams: nextTeams };
    }, undefined, false);
    if (!result.committed) {
      if (failureReason === "Could not update auction settings. Refresh and try again." && appliedSettings) {
        failureReason = "Auction settings changed concurrently. Refresh and try again.";
      }
      reject(failureReason);
    }
    return { ok: true, settings: appliedSettings };
  }

  const liveRef = database.ref(`auctions/${roomId}/live`);
  const liveSnap = await liveRef.get();
  const live = liveSnap.val();
  if (!live) reject("Auction lot could not be found.");
  if (action === "pause") {
    if (live.status !== "bidding") reject("Only an active bidding timer can be paused.");
    const remainingMs = Math.max(0, Number(live.timerEndsAt || Date.now()) - Date.now());
    await liveRef.update({ status: "paused", pausedRemainingMs: remainingMs, pausedAt: Date.now() });
  } else {
    if (live.status !== "paused") reject("The auction is not paused.");
    const seconds = clampBidTimerSeconds(room.settings?.bidTimer, 15);
    const remainingMs = Math.max(1000, Number(live.pausedRemainingMs || seconds * 1000));
    await liveRef.update({ status: "bidding", timerEndsAt: Date.now() + remainingMs, pausedRemainingMs: null, pausedAt: null });
  }
  await roomRef.child("lastActivityAt").set(Date.now());
  return { ok: true, action };
});


export const endAuction = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  requireRoomId(roomId);

  // End-of-auction status and franchise disqualification must be calculated
  // from the same current snapshot. A root transaction prevents a final sale
  // from racing the squad-count check and being omitted from eligibility.
  const rootRef = database.ref("auctions/" + roomId);
  const now = Date.now();
  const deadline = now + 120000;
  let failureReason = "Could not end the auction. Refresh and try again.";
  let alreadyEnded = false;
  let disqualifiedNames = [];
  const result = await rootRef.transaction((current) => {
    alreadyEnded = false;
    disqualifiedNames = [];
    failureReason = "Could not end the auction. Refresh and try again.";
    if (!current?.room) {
      failureReason = "Auction room could not be found.";
      return;
    }
    const room = current.room;
    if (room.hostId !== uid) {
      failureReason = "Only the room host can end the auction.";
      return;
    }
    if (["awaiting_xi", "analyzing", "completed"].includes(room.status)) {
      alreadyEnded = true;
      return;
    }
    if (!["active", "bidding", "paused"].includes(room.status)) {
      failureReason = "This auction cannot be ended from its current state.";
      return;
    }

    const teams = current.teams || {};
    const minimumSquadRuleApplies = (room.settings?.auctionType || room.auctionType || "mega") === "mega";
    const nextTeams = { ...teams };
    for (const [teamKey, team] of Object.entries(teams)) {
      if (!team?.teamId || team.teamId === "NONE") continue;
      const squadCount = Array.isArray(team.squad) ? team.squad.length : 0;
      const disqualified = minimumSquadRuleApplies && squadCount < 18;
      nextTeams[teamKey] = {
        ...team,
        disqualified,
        disqualificationReason: disqualified
          ? `Only ${squadCount} players bought; at least 18 are required.` : null,
        squadCountAtEnd: squadCount
      };
      if (disqualified) disqualifiedNames.push(`${team.teamName || team.teamId} (${squadCount}/18)`);
    }

    return {
      ...current,
      teams: nextTeams,
      room: {
        ...room,
        status: "awaiting_xi",
        xiSubmissionStartedAt: now,
        xiSubmissionDeadline: deadline,
        winnerAnalysisStatus: "collecting",
        minimumSquadSize: minimumSquadRuleApplies ? 18 : null,
        lastActivityAt: now
      }
    };
  }, undefined, false);

  if (!result.committed) {
    if (alreadyEnded) return { ok: true, alreadyEnded: true };
    reject(failureReason);
  }
  return { ok: true, deadline, disqualifiedNames };
});


export const submitPlayingXI = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const { roomId, startingXI, impactPlayer } = request.data || {};
  requireRoomId(roomId);
  const playerIdOf = (item) => typeof item === "string" ? item : item?.id;
  if (!Array.isArray(startingXI) || startingXI.length !== 11 || !impactPlayer) {
    throw new HttpsError("invalid-argument", "Choose 11 starting players and one Impact Player.");
  }
  const ids = startingXI.map(playerIdOf);
  const impactId = playerIdOf(impactPlayer);
  if (ids.some((id) => typeof id !== "string" || !PLAYER_CATALOG[id]) ||
      !PLAYER_CATALOG[impactId] || new Set(ids).size !== 11 || ids.includes(impactId)) {
    throw new HttpsError("invalid-argument", "The Playing XI must contain 11 unique valid players and a different Impact Player.");
  }

  const root = database.ref(`auctions/${roomId}`);
  const roomSnap = await root.child("room").get();
  const room = roomSnap.val();
  if (!room) reject("Auction room could not be found.");
  if (room.status !== "awaiting_xi") reject("Playing XI submissions are closed.");
  const now = Date.now();
  if (now > Number(room.xiSubmissionDeadline || 0)) reject("The Playing XI submission deadline has passed.");
  if (!(Array.isArray(room.players) ? room.players : []).some((p) => p?.id === uid) || room.bannedPlayers?.includes(uid)) {
    reject("Only an active room member can submit a Playing XI.");
  }

  const teamRef = root.child("teams").child(`${roomId}_${uid}`);
  const teamSnap = await teamRef.get();
  const team = teamSnap.val();
  if (!team || team.userId !== uid || !team.teamId || team.teamId === "NONE") reject("Your franchise squad was not found.");
  if (team.disqualified) reject(team.disqualificationReason || "Your franchise is disqualified.");
  const squad = Array.isArray(team.squad) ? team.squad : [];
  const squadIds = new Set(squad.map(playerIdOf));
  if (ids.concat(impactId).some((id) => !squadIds.has(id))) {
    throw new HttpsError("invalid-argument", "Every selected player must belong to your purchased squad.");
  }
  const overseasCount = ids.filter((id) => PLAYER_CATALOG[id].country !== "IND").length;
  if (overseasCount > effectiveOverseasLimit(room)) {
    throw new HttpsError("invalid-argument", `A Playing XI can include a maximum of ${effectiveOverseasLimit(room)} overseas players in this auction mode.`);
  }
  const composition = validatePlayingXIComposition(ids, PLAYER_CATALOG);
  if (!composition.valid) throw new HttpsError("invalid-argument", composition.reason);

  const result = await teamRef.child("playingXI").transaction((current) => {
    if (current && Number(current.submittedAt || 0) > 0) return;
    return { startingXI: ids, impactPlayer: impactId, submittedAt: now, autoSelected: false };
  }, undefined, false);
  if (!result.committed) reject("A Playing XI has already been submitted for this franchise.");
  await root.child("room/lastActivityAt").set(now);
  return { ok: true, submittedAt: now };
});


// Runs independently of visitors so abandoned rooms are removed even when no
// client is around to perform cleanup. Activity is rechecked transactionally
// before deletion to avoid racing a join, bid, chat message, or auction action.
export const cleanupInactiveAuctionRooms = onSchedule("every 10 minutes", async () => {
  const now = Date.now();
  const [auctionsSnap, directorySnap] = await Promise.all([
    database.ref("auctions").get(),
    database.ref("publicRooms").get()
  ]);
  const auctions = auctionsSnap.val() || {};
  const directory = directorySnap.val() || {};
  let removed = 0;
  let checked = 0;

  for (const [roomId, initialRoomNode] of Object.entries(auctions)) {
    if (!initialRoomNode || typeof initialRoomNode !== "object" || !initialRoomNode.room) continue;
    checked += 1;
    const directoryEntry = directory[roomId] || null;
    if (!shouldDeleteInactiveRoom(initialRoomNode.room, now, undefined, directoryEntry)) continue;

    const roomRef = database.ref("auctions/" + roomId);
    const result = await roomRef.transaction((current) => {
      if (!current || !current.room) return;
      if (!shouldDeleteInactiveRoom(current.room, Date.now(), undefined, directoryEntry)) return;
      return null;
    }, undefined, false);

    if (result.committed && result.snapshot.val() === null) {
      await database.ref("publicRooms/" + roomId).remove();
      removed += 1;
    }
  }

  // Also remove orphaned public directory entries; never delete an actual room
  // based on directory metadata alone.
  for (const [roomId] of Object.entries(directory)) {
    if (!Object.hasOwn(auctions, roomId)) {
      await database.ref("publicRooms/" + roomId).remove();
    }
  }
  console.info("Inactive auction room cleanup complete", { checked, removed });
});
