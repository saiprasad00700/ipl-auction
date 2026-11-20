import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRetentionOffer } from '../api/retention-finalize-auth.js';

const base = { status: 'processing_sale', highBidderId: 'buyer', highBidderName: 'Buyer', highBidderTeamId: 'MI', currentBid: 10, retentionOffer: { status: 'pending', phase: 'initial_decision', eligibleUserId: 'original', buyerId: 'buyer', buyerName: 'Buyer', buyerTeamId: 'MI', originalFranchiseId: 'CSK', bid: 10, expiresAt: 1000, decision: null } };

test('does not finalize while decision window is open', () => {
  assert.equal(resolveRetentionOffer({ live: base, now: 1000 }).reason, 'window_open');
});

test('declined initial RTM resolves to buyer sale', () => {
  const live = { ...base, retentionOffer: { ...base.retentionOffer, decision: 'decline', decidedAt: 900 } };
  const result = resolveRetentionOffer({ live, now: 900 });
  assert.equal(result.allowed, true);
  assert.equal(result.live.status, 'sold');
  assert.equal(result.live.highBidderId, 'buyer');
  assert.equal(result.live.retentionOffer.status, 'declined');
});

test('RTM exercised and buyer timeout resolves to original franchise', () => {
  const live = { ...base, retentionOffer: { ...base.retentionOffer, phase: 'counter_bid', rtmUsed: true, expiresAt: 2000 } };
  const result = resolveRetentionOffer({ live, now: 4000 });
  assert.equal(result.allowed, true);
  assert.equal(result.live.highBidderId, 'original');
  assert.equal(result.live.highBidderTeamId, 'CSK');
  assert.equal(result.live.retentionOffer.status, 'accepted');
});

test('match decision resolves original franchise at counter amount', () => {
  const live = { ...base, retentionOffer: { ...base.retentionOffer, phase: 'match_decision', counterBid: 12, decision: 'match', decidedAt: 900, expiresAt: 1000 } };
  const result = resolveRetentionOffer({ live, now: 900 });
  assert.equal(result.live.highBidderId, 'original');
  assert.equal(result.live.currentBid, 12);
  assert.equal(result.live.retentionOffer.status, 'accepted');
});

test('declined or expired counter resolves to buyer at counter amount', () => {
  const live = { ...base, retentionOffer: { ...base.retentionOffer, phase: 'match_decision', counterBid: 12, decision: 'decline_counter', decidedAt: 900, expiresAt: 1000 } };
  const result = resolveRetentionOffer({ live, now: 900 });
  assert.equal(result.live.highBidderId, 'buyer');
  assert.equal(result.live.currentBid, 12);
  assert.equal(result.live.retentionOffer.status, 'declined');
});
