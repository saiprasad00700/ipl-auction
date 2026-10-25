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

test("room removal only permits the host to remove another member before start", async () => {
  const { removeRoomMember } = await import("../roomMemberRules.js");
  const room = {
    hostId: "host", status: "waiting",
    players: [{ id: "host" }, { id: "member", name: "Member" }],
    bannedPlayers: [], lastActivityAt: 1
  };
  const removed = removeRoomMember(room, "host", "member", 123);
  assert.equal(removed.target.name, "Member");
  assert.deepEqual(removed.room.players.map((p) => p.id), ["host"]);
  assert.deepEqual(removed.room.bannedPlayers, ["member"]);
  assert.equal(removed.room.lastActivityAt, 123);
  assert.equal(removeRoomMember(room, "outsider", "member", 123), null);
  assert.equal(removeRoomMember(room, "host", "host", 123), null);
  assert.equal(removeRoomMember({ ...room, status: "active" }, "host", "member", 123), null);
  assert.equal(removeRoomMember(room, "host", "missing", 123), null);
});
