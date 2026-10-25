import test from "node:test";
import assert from "node:assert/strict";
import { canSyncTeamStats, canStartAuction } from "../roomAuthorizationRules.js";

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
