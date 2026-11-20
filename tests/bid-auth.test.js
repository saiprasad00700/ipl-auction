import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBidRequest } from '../api/bid-auth.js';

const players = [
  { id: 'p1', country: 'IND', basePrice: 2, set: 'Set 1' },
  { id: 'p2', country: 'AUS', basePrice: 0.5, set: 'Set 2' }
];
const room = { status: 'active', players: [{ id: 'u1', team: 'CSK', isBot: false }], settings: { bidTimer: 15 }, squadLimit: 25, overseasLimit: 4 };
const live = { status: 'bidding', playerId: 'p1', currentBid: 0, highBidderId: '', timerEndsAt: 5000 };
const team = { userId: 'u1', teamId: 'CSK', budgetRemaining: 120, squad: [] };
const nextBidAmount = (bid, player) => bid > 0 ? bid + 0.25 : player.basePrice;

test('allows an authenticated room participant with a matching team record to bid', () => {
  const result = validateBidRequest({ room, live, team, uid: 'u1', now: 1000, players, nextBidAmount });
  assert.equal(result.allowed, true);
  assert.equal(result.amount, 2);
});

test('rejects non-members, bots, and banned users', () => {
  assert.equal(validateBidRequest({ room, live, team, uid: 'outsider', now: 1000, players, nextBidAmount }).reason, 'participant_required');
  const botRoom = { ...room, players: [{ id: 'u1', team: 'CSK', isBot: true }] };
  assert.equal(validateBidRequest({ room: botRoom, live, team, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'participant_required');
  const bannedRoom = { ...room, bannedPlayers: ['u1'] };
  assert.equal(validateBidRequest({ room: bannedRoom, live, team, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'banned');
});

test('rejects invalid phase, high bidder, and expired timer', () => {
  assert.equal(validateBidRequest({ room, live: { ...live, status: 'sold' }, team, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'auction_not_bidding');
  assert.equal(validateBidRequest({ room, live: { ...live, highBidderId: 'u1' }, team, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'already_high_bidder');
  assert.equal(validateBidRequest({ room, live, team, uid: 'u1', now: 5000, players, nextBidAmount }).reason, 'bid_timer_expired');
});

test('rejects mismatched team records and unknown player', () => {
  assert.equal(validateBidRequest({ room, live, team: { ...team, teamId: 'MI' }, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'team_record_mismatch');
  assert.equal(validateBidRequest({ room, live: { ...live, playerId: 'unknown' }, team, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'current_player_unknown');
});

test('enforces squad, overseas, and budget limits', () => {
  const fullTeam = { ...team, squad: Array.from({ length: 25 }, (_, i) => ({ id: `p${i}` })) };
  assert.equal(validateBidRequest({ room, live, team: fullTeam, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'squad_limit');
  const overseasTeam = { ...team, squad: ['p2', 'p2', 'p2', 'p2'] };
  assert.equal(validateBidRequest({ room, live: { ...live, playerId: 'p2' }, team: overseasTeam, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'overseas_limit');
  const poorTeam = { ...team, budgetRemaining: 1 };
  assert.equal(validateBidRequest({ room, live, team: poorTeam, uid: 'u1', now: 1000, players, nextBidAmount }).reason, 'insufficient_budget');
});
