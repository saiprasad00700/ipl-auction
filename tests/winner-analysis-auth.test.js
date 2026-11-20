import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeWinnerAnalysis } from '../api/winner-analysis-auth.js';

test('rejects missing identity or room', () => {
  assert.equal(authorizeWinnerAnalysis({ uid: null, room: { hostId: 'host' }, roomStatus: 'analyzing' }).allowed, false);
  assert.equal(authorizeWinnerAnalysis({ uid: 'host', room: null, roomStatus: 'analyzing' }).status, 404);
});

test('only the host is authorized', () => {
  const room = { hostId: 'host-uid' };
  assert.equal(authorizeWinnerAnalysis({ uid: 'guest-uid', room, roomStatus: 'analyzing' }).status, 403);
  assert.equal(authorizeWinnerAnalysis({ uid: 'host-uid', room, roomStatus: 'analyzing' }).allowed, true);
});

test('analysis is limited to the winner-analysis phases', () => {
  const room = { hostId: 'host-uid', status: 'waiting' };
  for (const status of ['waiting', 'active', 'completed', 'paused']) {
    assert.equal(authorizeWinnerAnalysis({ uid: 'host-uid', room, roomStatus: status }).status, 409);
  }
  for (const status of ['awaiting_xi', 'analyzing']) {
    assert.equal(authorizeWinnerAnalysis({ uid: 'host-uid', room, roomStatus: status }).allowed, true);
  }
});
