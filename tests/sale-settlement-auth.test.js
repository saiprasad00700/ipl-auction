import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSaleSettlement } from '../api/sale-settlement-auth.js';

const room = { players: [{ id: 'u1', team: 'CSK', isBot: false }] };
const live = { status: 'sold', playerId: 'p1', highBidderId: 'u1', highBidderTeamId: 'CSK', currentBid: 2 };
const players = [{ id: 'p1' }];
const team = { userId: 'u1' };

test('validates a sold player and participant winner', () => {
  const result = validateSaleSettlement({ room, live, team: { userId: 'u1' }, players });
  assert.equal(result.allowed, true);
  assert.equal(result.retained, false);
});

test('rejects unsold state, unknown player, missing participant, and team mismatch', () => {
  assert.equal(validateSaleSettlement({ room, live: { ...live, status: 'bidding' }, team, players }).reason, 'sale_not_sold');
  assert.equal(validateSaleSettlement({ room, live: { ...live, playerId: 'unknown' }, team, players }).reason, 'unknown_player');
  assert.equal(validateSaleSettlement({ room, live: { ...live, highBidderId: 'u2' }, team, players }).reason, 'winner_not_in_room');
  assert.equal(validateSaleSettlement({ room, live, team: { userId: 'u2' }, players }).reason, 'team_identity_mismatch');
});

test('identifies a valid retention-card sale', () => {
  const retainedLive = { ...live, highBidderTeamId: 'CSK', retentionOffer: { status: 'accepted', originalFranchiseId: 'CSK', phase: 'match_decision', decision: 'match' } };
  assert.equal(validateSaleSettlement({ room, live: retainedLive, team: { userId: 'u1' }, players }).retained, true);
});
