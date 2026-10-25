import test from "node:test";
import assert from "node:assert/strict";
import { INACTIVE_ROOM_TTL_MS, auctionLastActivity, roomLastActivity, shouldDeleteInactiveAuction, shouldDeleteInactiveRoom, timestampMs } from "../roomLifecycleRules.js";

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

test("parses numeric, numeric-string and ISO activity timestamps", () => {
  assert.equal(timestampMs(1000), 1000);
  assert.equal(timestampMs("1000"), 1000);
  assert.equal(timestampMs("2026-10-25T11:00:00.000Z"), Date.parse("2026-10-25T11:00:00.000Z"));
  assert.equal(timestampMs("not-a-date"), 0);
});

test("recent chat protects a room even when its heartbeat is stale", () => {
  const auction = {
    room: { lastActivityAt: now - 60 * 60 * 1000, createdAt: now - 2 * 60 * 60 * 1000 },
    messages: { m1: { timestamp: now - 2 * 60 * 1000 } }
  };
  assert.equal(auctionLastActivity(auction), now - 2 * 60 * 1000);
  assert.equal(shouldDeleteInactiveAuction(auction, now), false);
});

test("recent presence and live bidding activity protect a room", () => {
  const presenceAuction = {
    room: { lastActivityAt: now - 90 * 60 * 1000 },
    presence: { user1: { online: true, lastSeen: now - 1000 } }
  };
  const bidAuction = {
    room: { lastActivityAt: now - 90 * 60 * 1000 },
    live: { lastBidAt: now - 5000 }
  };
  assert.equal(shouldDeleteInactiveAuction(presenceAuction, now), false);
  assert.equal(shouldDeleteInactiveAuction(bidAuction, now), false);
});

test("uses latest player and team timestamps and deletes exactly at 30 minutes", () => {
  const recent = {
    room: { lastActivityAt: now - 60 * 60 * 1000 },
    teams: { team1: { updatedAt: now - 1000 } }
  };
  const old = { room: { lastActivityAt: now - INACTIVE_ROOM_TTL_MS } };
  assert.equal(shouldDeleteInactiveAuction(recent, now), false);
  assert.equal(shouldDeleteInactiveAuction(old, now), true);
});

test("directory activity can protect an otherwise stale full auction node", () => {
  const auction = { room: { lastActivityAt: now - 60 * 60 * 1000 } };
  assert.equal(shouldDeleteInactiveAuction(
    auction,
    now,
    INACTIVE_ROOM_TTL_MS,
    { lastActivityAt: now - 1000 }
  ), false);
});
