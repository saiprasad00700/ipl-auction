import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveAnalyticsSnapshot, isRealAnalyticsUser } from '../api/analytics.js';
import { buildPhaseTwoMetrics, normalizeCountryEstimate } from '../api/analytics-phase2.js';

test('excludes automated accounts from real-player analytics', () => {
  assert.equal(isRealAnalyticsUser('user-1'), true);
  assert.equal(isRealAnalyticsUser('bot_1'), false);
  assert.equal(isRealAnalyticsUser('auctionbot-2'), false);
});

test('counts distinct online users across rooms and active roster members', () => {
  const result = buildLiveAnalyticsSnapshot({
    roomA: {
      room: { status: 'waiting', players: [{ id: 'u1' }, { id: 'u2' }] },
      presence: { u1: { online: true }, u2: { online: false }, bot_1: { online: true } }
    },
    roomB: {
      room: { status: 'active', players: [{ id: 'u1' }, { id: 'u3' }] },
      live: { status: 'bidding' },
      presence: { u1: { online: true }, u3: { online: true }, u4: { online: true } }
    },
    roomC: {
      room: { status: 'waiting', players: [{ id: 'u5' }] },
      presence: { u5: { online: true } }
    }
  }, 0);

  assert.equal(result.onlinePlayers, 4);
  assert.equal(result.activePlayers, 2);
  assert.equal(result.activeRooms, 1);
  assert.equal(result.waitingRooms, 2);
  assert.equal(result.onlineRoomMemberships, 5);
  assert.equal(result.measuredAt, '1970-01-01T00:00:00.000Z');
});

test('handles missing and malformed room data safely', () => {
  const result = buildLiveAnalyticsSnapshot({ empty: null, malformed: { presence: { bot_9: { online: true } } } }, 1000);
  assert.equal(result.onlinePlayers, 0);
  assert.equal(result.activePlayers, 0);
});

test('normalizes only two-letter country estimates', () => {
  assert.equal(normalizeCountryEstimate('in'), 'IN');
  assert.equal(normalizeCountryEstimate('USA'), null);
  assert.equal(normalizeCountryEstimate(''), null);
});

test('builds phase two concurrency, room, retention and country metrics', () => {
  const now = new Date('2026-11-07T12:00:00.000Z');
  const sessions = [
    { firebase_uid: 'u1', started_at: '2026-10-01T10:00:00.000Z' },
    { firebase_uid: 'u1', started_at: '2026-10-02T10:00:00.000Z' },
    { firebase_uid: 'u2', started_at: '2026-11-06T10:00:00.000Z' }
  ];
  const events = [
    { firebase_uid: 'u1', event_name: 'room_created', metadata: { countryEstimate: 'IN' } },
    { firebase_uid: 'u1', event_name: 'auction_completed', metadata: { countryEstimate: 'IN' } },
    { firebase_uid: 'u2', event_name: 'page_view', metadata: { countryEstimate: 'US' } }
  ];
  const snapshots = [
    { online_players: 3, active_players: 2, sampled_at: '2026-11-07T11:00:00.000Z' },
    { online_players: 5, active_players: 4, sampled_at: '2026-11-07T11:01:00.000Z' }
  ];
  const result = buildPhaseTwoMetrics({ sessions, events, snapshots, now });
  assert.equal(result.concurrency.peakOnlinePlayers, 5);
  assert.equal(result.concurrency.peakActivePlayers, 4);
  assert.deepEqual(result.rooms, { created: 1, completed: 1 });
  assert.deepEqual(result.countries, [{ country: 'IN', players: 1 }, { country: 'US', players: 1 }]);
  assert.equal(result.retention[0].eligiblePlayers, 2);
});
