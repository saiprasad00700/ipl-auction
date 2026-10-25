import test from 'node:test';
import assert from 'node:assert/strict';
import { isInactive, latestActivityAt, timestampMs } from '../scripts/room-activity.js';

const THIRTY_MINUTES = 30 * 60 * 1000;
const now = Date.parse('2026-10-25T12:00:00.000Z');

test('parses numeric, numeric-string, and ISO timestamps', () => {
  assert.equal(timestampMs(1000), 1000);
  assert.equal(timestampMs('1000'), 1000);
  assert.equal(timestampMs('2026-10-25T11:00:00.000Z'), Date.parse('2026-10-25T11:00:00.000Z'));
  assert.equal(timestampMs(null), 0);
});

test('uses recent chat activity even when room-level activity is stale', () => {
  const room = {
    room: { lastActivityAt: now - 60 * 60 * 1000, createdAt: now - 2 * 60 * 60 * 1000 },
    messages: { m1: { timestamp: now - 2 * 60 * 1000 } },
  };
  assert.equal(latestActivityAt(room), now - 2 * 60 * 1000);
  assert.equal(isInactive(room, now, THIRTY_MINUTES), false);
});

test('uses recent participant presence activity', () => {
  const room = {
    room: { lastActivityAt: now - 90 * 60 * 1000 },
    presence: { user1: { online: true, lastSeen: now - 1000 } },
  };
  assert.equal(isInactive(room, now, THIRTY_MINUTES), false);
});

test('treats a room as inactive at the 30-minute boundary', () => {
  const room = { room: { lastActivityAt: now - THIRTY_MINUTES } };
  assert.equal(isInactive(room, now, THIRTY_MINUTES), true);
});

test('does not classify missing or invalid timestamps as inactive', () => {
  assert.equal(isInactive({ room: {} }, now, THIRTY_MINUTES), false);
  assert.equal(isInactive({ room: { lastActivityAt: 'not-a-date' } }, now, THIRTY_MINUTES), false);
});

test('detects newer bid/activity timestamps in the live node', () => {
  const room = {
    room: { lastActivityAt: now - 60 * 60 * 1000 },
    live: { lastBidAt: now - 5000 },
  };
  assert.equal(latestActivityAt(room), now - 5000);
  assert.equal(isInactive(room, now, THIRTY_MINUTES), false);
});
