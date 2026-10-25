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

test("latest activity wins over older creation time", () => {
  assert.equal(shouldDeleteInactiveRoom({ createdAt: now - 3 * INACTIVE_ROOM_TTL_MS, lastActivityAt: now - 1000 }, now), false);
});

test("legacy rooms use creation time only when no activity timestamp exists", () => {
  assert.equal(roomLastActivity({ createdAt: now - INACTIVE_ROOM_TTL_MS }, null), now - INACTIVE_ROOM_TTL_MS);
  assert.equal(shouldDeleteInactiveRoom({ createdAt: now - INACTIVE_ROOM_TTL_MS }, now), true);
});

test("unknown or future timestamps are treated conservatively", () => {
  assert.equal(shouldDeleteInactiveRoom({ status: "active" }, now), false);
  assert.equal(shouldDeleteInactiveRoom({ lastActivityAt: now + 60_000 }, now), false);
  assert.equal(shouldDeleteInactiveRoom(null, now), false);
});

test("directory timestamp is only a fallback", () => {
  assert.equal(roomLastActivity({}, { createdAt: now - 2000 }), now - 2000);
  assert.equal(roomLastActivity({ lastActivityAt: now - 1000 }, { createdAt: now - 2000 }), now - 1000);
});
