import test from 'node:test';
import assert from 'node:assert/strict';
import { isInactive, latestActivityAt, timestampMs } from '../scripts/room-activity.js';

const TTL = 30 * 60 * 1000;
const now = Date.parse('2026-10-25T12:00:00.000Z');

test('parses numeric, numeric-string and ISO timestamps', () => {
  assert.equal(timestampMs(1000), 1000);
  assert.equal(timestampMs('1000'), 1000);
  assert.equal(timestampMs('2026-10-25T11:00:00.000Z'), Date.parse('2026-10-25T11:00:00.000Z'));
  assert.equal(timestampMs('not-a-date'), 0);
});

test('recent chat protects a room with a stale heartbeat', () => {
  const room = {
    room: { lastActivityAt: now - 60 * 60 * 1000, createdAt: now - 2 * 60 * 60 * 1000 },
    messages: { m1: { timestamp: now - 2 * 60 * 1000 } },
  };
  assert.equal(latestActivityAt(room), now - 2 * 60 * 1000);
  assert.equal(isInactive(room, now, TTL), false);
});

test('recent presence and live bid timestamps protect the room', () => {
  assert.equal(isInactive({
    room: { lastActivityAt: now - 90 * 60 * 1000 },
    presence: { user1: { lastSeen: now - 1000 } },
  }, now, TTL), false);
  assert.equal(isInactive({
    room: { lastActivityAt: now - 90 * 60 * 1000 },
    live: { lastBidAt: now - 5000 },
  }, now, TTL), false);
});

test('deletes inactive rooms at the 30-minute boundary, including active auction states', () => {
  const stale = { room: { status: 'active', lastActivityAt: now - TTL } };
  const completedStale = { room: { status: 'completed', lastActivityAt: now - TTL } };
  assert.equal(isInactive(stale, now, TTL), true);
  assert.equal(isInactive(completedStale, now, TTL), true);
});

test('missing or future timestamps are retained instead of guessed inactive', () => {
  assert.equal(isInactive({ room: {} }, now, TTL), false);
  assert.equal(isInactive({ room: { lastActivityAt: now + 1000 } }, now, TTL), false);
});

test('recent team metadata can protect a room when room heartbeat is stale', () => {
  const room = {
    room: { lastActivityAt: now - 60 * 60 * 1000 },
    teams: { team1: { updatedAt: now - 1000 } },
  };
  assert.equal(isInactive(room, now, TTL), false);
});
