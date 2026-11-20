import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRoomJoin, buildJoinedRoom, applyRoomJoinTransaction } from '../api/room-join-policy.js';

test('rejects missing room, identity, and banned users', () => {
  assert.equal(validateRoomJoin({ room: null, uid: 'u', teamId: 'CSK' }).status, 404);
  assert.equal(validateRoomJoin({ room: {}, uid: '', teamId: 'CSK' }).status, 401);
  assert.equal(validateRoomJoin({ room: { status: 'waiting' }, uid: 'u', teamId: 'CSK', bannedPlayers: ['u'] }).status, 403);
});

test('rejects closed rooms and joins after bidding starts', () => {
  assert.equal(validateRoomJoin({ room: { status: 'completed' }, uid: 'u', teamId: 'CSK' }).status, 409);
  assert.equal(validateRoomJoin({ room: { status: 'bidding' }, uid: 'u', teamId: 'CSK' }).status, 409);
});

test('prevents a second user from claiming an occupied franchise', () => {
  const room = { status: 'waiting', players: [{ id: 'host', team: 'CSK' }] };
  assert.equal(validateRoomJoin({ room, uid: 'guest', teamId: 'CSK' }).reason, 'franchise_taken');
  assert.equal(validateRoomJoin({ room, uid: 'host', teamId: 'CSK' }).allowed, true);
  assert.equal(validateRoomJoin({ room, uid: 'host', teamId: 'MI' }).reason, 'team_change_requires_explicit_transfer');
});

test('allows a same-user reconnect and builds a deduplicated roster entry', () => {
  const room = { status: 'waiting', players: [{ id: 'u1', team: 'CSK', name: 'Old', isHost: true }, { id: 'u2', team: 'MI' }] };
  assert.equal(validateRoomJoin({ room, uid: 'u1', teamId: 'CSK' }).allowed, true);
  const result = buildJoinedRoom({ room, uid: 'u1', name: 'New Name', teamId: 'CSK', teamName: 'Chennai' });
  assert.equal(result.roster.length, 2);
  assert.equal(result.roster[0].id, 'u2');
  assert.equal(result.roster[1].id, 'u1');
  assert.equal(result.roster[1].isHost, true);
});


test('transaction helper rejects competing franchise claims without changing room', () => {
  const room = { status: 'waiting', players: [{ id: 'host', team: 'CSK' }] };
  const result = applyRoomJoinTransaction(room, { uid: 'guest', name: 'Guest', teamId: 'CSK', teamName: 'Chennai', activityTimestamp: 123 });
  assert.equal(result.room, undefined);
  assert.equal(result.decision.reason, 'franchise_taken');
  assert.deepEqual(room.players, [{ id: 'host', team: 'CSK' }]);
});

test('transaction helper returns roster with activity timestamp and preserves host/reconnect team', () => {
  const room = { status: 'waiting', players: [{ id: 'u1', team: 'MI', isHost: true, name: 'Old' }] };
  const result = applyRoomJoinTransaction(room, { uid: 'u1', name: 'Updated', teamId: 'MI', teamName: 'Mumbai', activityTimestamp: 456 });
  assert.ok(result.room);
  assert.equal(result.room.lastActivityAt, 456);
  assert.equal(result.room.players.length, 1);
  assert.equal(result.room.players[0].isHost, true);
  assert.equal(result.room.players[0].team, 'MI');
  assert.equal(result.room.players[0].name, 'Updated');
});
