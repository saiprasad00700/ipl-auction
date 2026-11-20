import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRetentionDecision } from '../api/retention-decision-auth.js';

const initial = { status: 'pending', phase: 'initial_decision', eligibleUserId: 'u1', expiresAt: 1000 };
const match = { status: 'pending', phase: 'match_decision', eligibleUserId: 'u1', expiresAt: 1000 };

test('authorizes eligible manager decisions for initial RTM stage', () => {
  assert.equal(validateRetentionDecision({ offer: initial, uid: 'u1', decision: 'accept', now: 900 }).allowed, true);
  assert.equal(validateRetentionDecision({ offer: initial, uid: 'u1', decision: 'decline', now: 900 }).allowed, true);
  assert.equal(validateRetentionDecision({ offer: initial, uid: 'u2', decision: 'accept', now: 900 }).reason, 'not_eligible');
  assert.equal(validateRetentionDecision({ offer: initial, uid: 'u1', decision: 'match', now: 900 }).reason, 'invalid_initial_decision');
});

test('authorizes match/decline only for eligible original manager', () => {
  assert.equal(validateRetentionDecision({ offer: match, uid: 'u1', decision: 'match', now: 900 }).allowed, true);
  assert.equal(validateRetentionDecision({ offer: match, uid: 'u1', decision: 'decline_counter', now: 900 }).allowed, true);
  assert.equal(validateRetentionDecision({ offer: match, uid: 'u2', decision: 'match', now: 900 }).reason, 'not_eligible');
});

test('rejects expired offers, closed offers, and incorrect phases', () => {
  assert.equal(validateRetentionDecision({ offer: initial, uid: 'u1', decision: 'accept', now: 2600 }).reason, 'offer_expired');
  assert.equal(validateRetentionDecision({ offer: { ...initial, status: 'accepted' }, uid: 'u1', decision: 'accept', now: 900 }).reason, 'offer_closed');
  assert.equal(validateRetentionDecision({ offer: { ...initial, phase: 'counter_bid' }, uid: 'u1', decision: 'accept', now: 900 }).reason, 'wrong_phase');
});
