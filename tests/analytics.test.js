import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveAnalyticsSnapshot, isRealAnalyticsUser } from '../api/analytics.js';

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
