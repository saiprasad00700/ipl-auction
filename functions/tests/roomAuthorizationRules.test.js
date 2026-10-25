import test from "node:test";
import assert from "node:assert/strict";
import { canSyncTeamStats, canStartAuction, canSendRoomChat } from "../roomAuthorizationRules.js";

test("team stats can be synced by the target manager or host only", () => {
  assert.equal(canSyncTeamStats("u1", "u1", "host", true), true);
  assert.equal(canSyncTeamStats("host", "u1", "host", true), true);
  assert.equal(canSyncTeamStats("u2", "u1", "host", true), false);
  assert.equal(canSyncTeamStats("u1", "u1", "host", false), false);
});

test("auction can start only once by an active host in a lobby state", () => {
  const room = { hostId: "host", status: "waiting", players: [{ id: "host" }] };
  assert.equal(canStartAuction(room, false, "host"), true);
  assert.equal(canStartAuction(room, true, "host"), false);
  assert.equal(canStartAuction(room, false, "u1"), false);
  assert.equal(canStartAuction({ ...room, status: "active" }, false, "host"), false);
  assert.equal(canStartAuction({ ...room, players: [] }, false, "host"), false);
  assert.equal(canStartAuction({ ...room, bannedPlayers: ["host"] }, false, "host"), false);
});

test("legacy rooms without a status remain startable if host is present", () => {
  assert.equal(canStartAuction({ hostId: "host", players: [{ id: "host" }] }, false, "host"), true);
});


import { canSubmitRtmCounterBid } from "../roomAuthorizationRules.js";

test("RTM counter-bid requires the eligible room member and matching buyer team", () => {
  const room = { hostId: "host", status: "active", players: [{ id: "buyer" }, { id: "host" }] };
  const offer = { buyerId: "buyer", buyerTeamId: "CSK" };
  const team = { userId: "buyer", teamId: "CSK" };
  assert.equal(canSubmitRtmCounterBid({ uid: "buyer", room, offer, team }), true);
  assert.equal(canSubmitRtmCounterBid({ uid: "outsider", room, offer, team }), false);
  assert.equal(canSubmitRtmCounterBid({ uid: "buyer", room: { ...room, bannedPlayers: ["buyer"] }, offer, team }), false);
  assert.equal(canSubmitRtmCounterBid({ uid: "buyer", room, offer: { ...offer, buyerId: "other" }, team }), false);
  assert.equal(canSubmitRtmCounterBid({ uid: "buyer", room, offer, team: { ...team, teamId: "MI" } }), false);
});

test("only the host can submit a counter-bid for a bot buyer", () => {
  const room = { hostId: "host", status: "active", players: [{ id: "host" }] };
  const offer = { buyerId: "bot_CSK", buyerTeamId: "CSK" };
  const team = { userId: "bot_CSK", teamId: "CSK" };
  const botIds = ["bot_CSK"];
  assert.equal(canSubmitRtmCounterBid({ uid: "host", room, offer, team, botAction: true, botIds }), true);
  assert.equal(canSubmitRtmCounterBid({ uid: "buyer", room, offer, team, botAction: true, botIds }), false);
  assert.equal(canSubmitRtmCounterBid({ uid: "host", room, offer, team, botAction: true, botIds: [] }), false);
});


test("RTM counter-bids require an active room and active host for bot actions", () => {
  const room = { hostId: "host", status: "active", players: [{ id: "host" }, { id: "buyer" }] };
  const offer = { buyerId: "bot_CSK", buyerTeamId: "CSK" };
  const team = { userId: "bot_CSK", teamId: "CSK" };
  assert.equal(canSubmitRtmCounterBid({ uid: "host", room: { ...room, status: "completed" }, offer, team, botAction: true, botIds: ["bot_CSK"] }), false);
  assert.equal(canSubmitRtmCounterBid({ uid: "host", room: { ...room, players: [{ id: "buyer" }] }, offer, team, botAction: true, botIds: ["bot_CSK"] }), false);
});

test("chat authorization requires an active, non-banned room member", () => {
  const room = { players: [{ id: "member" }, { id: "host" }], bannedPlayers: [] };
  assert.equal(canSendRoomChat(room, "member"), true);
  assert.equal(canSendRoomChat(room, "outsider"), false);
  assert.equal(canSendRoomChat({ ...room, bannedPlayers: ["member"] }, "member"), false);
  assert.equal(canSendRoomChat({ ...room, players: null }, "member"), false);
  assert.equal(canSendRoomChat(null, "member"), false);
  assert.equal(canSendRoomChat(room, ""), false);
});
