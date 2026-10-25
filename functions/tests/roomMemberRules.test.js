import test from "node:test";
import assert from "node:assert/strict";
import { upsertRoomMember } from "../roomMemberRules.js";

test("joining creates a member and records activity", () => {
  const next = upsertRoomMember({ hostId: "host", status: "waiting", players: [] }, "u1", "Manager", 123);
  assert.equal(next.players.length, 1);
  assert.deepEqual(next.players[0], {
    id: "u1", name: "Manager", team: "", teamName: "Unknown", isHost: false
  });
  assert.equal(next.lastActivityAt, 123);
});

test("rejoining updates the name without losing selected franchise", () => {
  const next = upsertRoomMember({
    hostId: "host", status: "waiting",
    players: [{ id: "u1", name: "Old", team: "CSK", teamName: "Chennai Super Kings", spent: 10 }]
  }, "u1", "New", 456);
  assert.equal(next.players.length, 1);
  assert.equal(next.players[0].name, "New");
  assert.equal(next.players[0].team, "CSK");
  assert.equal(next.players[0].spent, 10);
  assert.equal(next.lastActivityAt, 456);
});

test("blocked or completed room joins return null", () => {
  assert.equal(upsertRoomMember({ status: "completed", players: [] }, "u1", "Manager"), null);
  assert.equal(upsertRoomMember({ status: "waiting", bannedPlayers: ["u1"], players: [] }, "u1", "Manager"), null);
  assert.equal(upsertRoomMember(null, "u1", "Manager"), null);
});
