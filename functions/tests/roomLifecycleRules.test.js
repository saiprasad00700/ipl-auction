import test from "node:test";
import assert from "node:assert/strict";
import { INACTIVE_ROOM_TTL_MS, roomLastActivity, shouldDeleteInactiveRoom } from "../roomLifecycleRules.js";

const now = 10_000_000;

test("room stays when activity is newer than the 30-minute threshold", () => {
  assert.equal(shouldDeleteInactiveRoom({ lastActivityAt: now - INACTIVE_ROOM_TTL_MS + 1 }, now), false);
});

test("room is deleted exactly at the inactivity threshold", () => {
  assert.equal(shouldDeleteInactiveRoom({ lastActivityAt: now - INACTIVE_ROOM_TTL_MS }, now), true);
});

test("newer activity wins over older creation and update timestamps", () => {
  assert.equal(shouldDeleteInactiveRoom({ createdAt: now - 3 * INACTIVE_ROOM_TTL_MS, lastActivityAt: now - 1000 }, now), false);
});

test("a recent updatedAt protects a room when the heartbeat is stale", () => {
  assert.equal(roomLastActivity({ lastActivityAt: now - 60 * 60 * 1000, updatedAt: now - 1000 }), now - 1000);
  assert.equal(shouldDeleteInactiveRoom({ lastActivityAt: now - 60 * 60 * 1000, updatedAt: now - 1000 }, now), false);
});

test("legacy rooms use creation time when it is the newest available timestamp", () => {
  assert.equal(roomLastActivity({ createdAt: now - INACTIVE_ROOM_TTL_MS }, null), now - INACTIVE_ROOM_TTL_MS);
  assert.equal(shouldDeleteInactiveRoom({ createdAt: now - INACTIVE_ROOM_TTL_MS }, now), true);
});

test("unknown or future timestamps are treated conservatively", () => {
  assert.equal(shouldDeleteInactiveRoom({ status: "active" }, now), false);
  assert.equal(shouldDeleteInactiveRoom({ lastActivityAt: now + 60_000 }, now), false);
  assert.equal(shouldDeleteInactiveRoom(null, now), false);
});

test("directory metadata can protect a room when it records newer activity", () => {
  assert.equal(roomLastActivity({}, { createdAt: now - 2000 }), now - 2000);
  assert.equal(roomLastActivity({ lastActivityAt: now - 1000 }, { createdAt: now - 2000 }), now - 1000);
  assert.equal(roomLastActivity({ lastActivityAt: now - 60 * 60 * 1000 }, { lastActivityAt: now - 1000 }), now - 1000);
  assert.equal(shouldDeleteInactiveRoom(
    { lastActivityAt: now - 60 * 60 * 1000 },
    now,
    INACTIVE_ROOM_TTL_MS,
    { lastActivityAt: now - 1000 }
  ), false);
});
