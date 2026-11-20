import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRetentionCounterBid } from '../api/retention-counter-auth.js';

const offer = { status: 'pending', phase: 'counter_bid', buyerId: 'u1', bid: 10, expiresAt: 1000 };
const team = { userId: 'u1', budgetRemaining: 20, spent: 10 };

test('accepts a valid buyer counter bid above the original offer', () => {
  const result = validateRetentionCounterBid({ offer, uid: 'u1', amount: 12, team, now: 900 });
  assert.equal(result.allowed, true);
  assert.equal(result.counterBid, 12);
});

test('rejects wrong participant, phase, and expired window', () => {
  assert.equal(validateRetentionCounterBid({ offer, uid: 'u2', amount: 12, team, now: 900 }).reason, 'not_buyer');
  assert.equal(validateRetentionCounterBid({ offer: { ...offer, phase: 'initial_decision' }, uid: 'u1', amount: 12, team, now: 900 }).reason, 'wrong_phase');
  assert.equal(validateRetentionCounterBid({ offer, uid: 'u1', amount: 12, team, now: 2000 }).reason, 'offer_expired');
});

test('rejects invalid amount, missing team record, and over-budget counter bid', () => {
  assert.equal(validateRetentionCounterBid({ offer, uid: 'u1', amount: 10, team, now: 900 }).reason, 'counter_not_higher');
  assert.equal(validateRetentionCounterBid({ offer, uid: 'u1', amount: 12, team: null, now: 900 }).reason, 'team_record_mismatch');
  assert.equal(validateRetentionCounterBid({ offer, uid: 'u1', amount: 25, team, now: 900 }).reason, 'insufficient_budget');
});
