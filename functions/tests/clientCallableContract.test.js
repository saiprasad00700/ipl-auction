import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../../src/contexts/AuctionContext.jsx", import.meta.url), "utf8");

test("every callable referenced by the auction client is exported by Cloud Functions", () => {
  const backendCallables = new Set(
    [...backendSource.matchAll(/export const (\w+) = onCall/g)].map((match) => match[1])
  );
  const clientCallables = new Set(
    [...clientSource.matchAll(/httpsCallable\(getFunctions\(app\),\s*['"]([^'"]+)['"]\)/g)]
      .map((match) => match[1])
  );

  assert.ok(clientCallables.size > 0, "expected to find client callable references");
  const missing = [...clientCallables].filter((name) => !backendCallables.has(name));
  assert.deepEqual(missing, [], `Client references missing backend callables: ${missing.join(", ")}`);
});

test("every callable export uses a unique name", () => {
  const names = [...backendSource.matchAll(/export const (\w+) = onCall/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length, "duplicate callable export name detected");
});

test("protected room, team and chat state is not written directly by the client", () => {
  assert.doesNotMatch(clientSource, /\bupdateRtdb\b/);
  assert.doesNotMatch(clientSource, /update\(ref\(rtdb,\s*`auctions\/\$\{[^}]+\}\/room`/);
  assert.doesNotMatch(clientSource, /update\(ref\(rtdb,\s*`auctions\/\$\{[^}]+\}\/teams`/);
  assert.match(clientSource, /httpsCallable\(getFunctions\(app\),\s*['"]endAuction['"]\)/);
  assert.match(clientSource, /httpsCallable\(getFunctions\(app\),\s*['"]sendAuctionChatMessage['"]\)/);
});

test("bid validation, live-state mutation and room activity use one root transaction", () => {
  const start = backendSource.indexOf("export const placeBid = onCall(");
  const end = backendSource.indexOf("export const decideRetention = onCall(", start);
  assert.ok(start >= 0 && end > start, "placeBid callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("current.teams?.["));
  assert.ok(source.includes("room: { ...room, lastActivityAt: now }"));
  assert.ok(!source.includes("liveRef.transaction("));
  assert.ok(!source.includes('room/lastActivityAt'));
});


test("auction start claims the room and initializes the first lot atomically", () => {
  const start = backendSource.indexOf("export const startAuction = onCall(");
  const end = backendSource.indexOf("export const manageAuctionBots = onCall(", start);
  assert.ok(start >= 0 && end > start, "startAuction callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("Boolean(current.live)"));
  assert.ok(source.includes('status: "active"'));
  assert.ok(source.includes("playerOrderIds"));
  assert.ok(source.includes("timerEndsAt: now + seconds * 1000"));
  assert.ok(!source.includes("roomRef.transaction("));
  assert.ok(!source.includes("root.update(updates)"));
});

test("sale settlement updates purse, squad, roster and activity atomically", () => {
  const start = backendSource.indexOf("export const applySaleSettlement = onCall(");
  const end = backendSource.indexOf("\n\nconst FRANCHISES", start);
  assert.ok(start >= 0 && end > start, "applySaleSettlement callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("teams: { ...(current.teams || {}), [teamKey]: finalTeam }"));
  assert.ok(source.includes("room: { ...room, players: updatedMembers, lastActivityAt: now }"));
  assert.ok(source.includes("live: { ...live, lastActivityAt: now }"));
  assert.ok(!source.includes("teamRef.transaction("));
  assert.ok(!source.includes("room/lastActivityAt"), "heartbeat must not be written separately");
});

test("RTM decisions, match affordability and room heartbeat commit atomically", () => {
  const start = backendSource.indexOf("export const decideRetention = onCall(");
  const end = backendSource.indexOf("\n\nexport const submitRetentionCounterBid", start);
  assert.ok(start >= 0 && end > start, "decideRetention callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("canAffordRtmMatch(originalTeam, offer.counterBid)"));
  assert.ok(source.includes("room: { ...room, lastActivityAt: now }"));
  assert.ok(source.includes("live: { ...live, retentionOffer: nextOffer, lastActivityAt: now }"));
  assert.ok(!source.includes("liveRef.transaction("));
  assert.ok(!source.includes("room/lastActivityAt"), "heartbeat must not be written separately");
});

test("team-stat synchronization reads authoritative data and updates roster atomically", () => {
  const start = backendSource.indexOf("export const syncRoomPlayerStats = onCall(");
  const end = backendSource.indexOf("\n\nexport const updatePlayerTeam", start);
  assert.ok(start >= 0 && end > start, "syncRoomPlayerStats callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("current.teams?.[`\${roomId}_\${userId}`]"));
  assert.ok(source.includes("players: players.map("));
  assert.ok(source.includes("lastActivityAt: now"));
  assert.ok(!source.includes("playersRef.transaction("));
  assert.ok(!source.includes("teamSnap"));
});

test("expired RTM finalization and room heartbeat are atomic", () => {
  const start = backendSource.indexOf("export const finalizeExpiredRetentionOffer = onCall(");
  const end = backendSource.indexOf("\n\nexport const advanceAuctionPlayer", start);
  assert.ok(start >= 0 && end > start, "finalizeExpiredRetentionOffer callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("room: { ...room, lastActivityAt: now }"));
  assert.ok(source.includes("live.lastActivityAt = now"));
  assert.ok(!source.includes("liveRef.transaction("));
  assert.ok(!source.includes("room/lastActivityAt"), "heartbeat must not be written separately");
});

test("advancing auction lots and entering the XI phase are atomic", () => {
  const start = backendSource.indexOf("export const advanceAuctionPlayer = onCall(");
  const end = backendSource.indexOf("\n\nexport const startAuction", start);
  assert.ok(start >= 0 && end > start, "advanceAuctionPlayer callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("current.playerOrderIds"));
  assert.ok(source.includes('status: "awaiting_xi"'));
  assert.ok(source.includes("xiSubmissionDeadline: now + 120000"));
  assert.ok(source.includes("timerEndsAt: now + clampBidTimerSeconds"));
  assert.ok(!source.includes("liveRef.transaction("));
  assert.ok(!source.includes("roomRef.update("));
});

test("room creation initializes protected room and initial team state through a trusted callable", () => {
  const start = backendSource.indexOf("export const createAuctionRoom = onCall(");
  const end = backendSource.indexOf("\n\nexport const joinAuctionRoom", start);
  assert.ok(start >= 0 && end > start, "createAuctionRoom callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("teams"));
  assert.ok(source.includes("publicRooms/"));
  assert.ok(source.includes("lastActivityAt: now"));
  assert.match(clientSource, /httpsCallable\(getFunctions\(app\),\s*['"]createAuctionRoom['"]\)/);
  assert.doesNotMatch(clientSource, /set\(ref\(rtdb,\s*`auctions\/\$\{roomId\}\/room`/);
});

test("Playing XI submission and activity heartbeat are atomic", () => {
  const start = backendSource.indexOf("export const submitPlayingXI = onCall(");
  const end = backendSource.indexOf("\n\n// Runs independently of visitors", start);
  assert.ok(start >= 0 && end > start, "submitPlayingXI callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("teams: { ...(current.teams || {}), [teamKey]: { ...team, playingXI } }"));
  assert.ok(source.includes("room: { ...room, lastActivityAt: now }"));
  assert.ok(source.includes("effectiveOverseasLimit(room)"));
  assert.ok(!source.includes("teamRef.child(\"playingXI\").transaction("));
  assert.ok(!source.includes("room/lastActivityAt"), "heartbeat must not be written separately");
});

test("system announcement, idempotency key and activity heartbeat commit atomically", () => {
  const start = backendSource.indexOf("export const postAuctionSystemEvent = onCall(");
  const end = backendSource.indexOf("\n\nexport const sendAuctionChatMessage", start);
  assert.ok(start >= 0 && end > start, "postAuctionSystemEvent callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("systemEventReceiptKey(event, room, live, uid)"));
  assert.ok(source.includes("messages: { ...(current.messages || {}), [messageId]: message }"));
  assert.ok(source.includes("room: { ...room, lastActivityAt: now }"));
  assert.ok(!source.includes("messageRef.transaction("));
  assert.ok(!source.includes("room/lastActivityAt"), "heartbeat must not be written separately");
});

test("host timer control updates only the timer while an auction is active", () => {
  const roomPage = readFileSync(new URL("../../src/pages/AuctionRoom.jsx", import.meta.url), "utf8");
  assert.match(roomPage, /updateRoomSettings\(id,\s*\{\s*bidTimer:\s*newTimerValue\s*\}\)/);
  assert.doesNotMatch(roomPage, /updateRoomSettings\(id,\s*\{\s*\.\.\.currentAuction\.settings,\s*bidTimer:/);
});

test("bid and RTM expiry checks use fresh time inside retried transactions", () => {
  const segments = [
    ["export const placeBid = onCall(", "export const decideRetention = onCall("],
    ["export const decideRetention = onCall(", "export const submitRetentionCounterBid = onCall("],
    ["export const submitRetentionCounterBid = onCall(", "export const applySaleSettlement = onCall("],
    ["export const finalizeExpiredRetentionOffer = onCall(", "export const advanceAuctionPlayer = onCall("],
    ["export const advanceAuctionPlayer = onCall(", "export const startAuction = onCall("]
  ];
  for (const [startMarker, endMarker] of segments) {
    const start = backendSource.indexOf(startMarker);
    const end = backendSource.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `missing transaction segment: ${startMarker}`);
    const source = backendSource.slice(start, end);
    assert.match(source, /const transactionNow = Date\.now\(\)/);
    assert.doesNotMatch(source, /const now = Date\.now\(\)/);
    assert.doesNotMatch(source, /lastActivityAt: now/);
  }
});
