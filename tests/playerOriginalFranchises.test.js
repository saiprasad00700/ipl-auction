import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlayerOriginalFranchise, PLAYER_ORIGINAL_FRANCHISES } from '../src/data/playerOriginalFranchises.js';
import { canUseRetentionCard, RETENTION_CARDS_PER_FRANCHISE, RETENTION_DECISION_MS } from '../src/lib/auctionWinnerRules.js';

test('known IPL 2026 player franchises are mapped correctly', () => {
  assert.equal(getPlayerOriginalFranchise('p_621'), 'MI');   // Jasprit Bumrah
  assert.equal(getPlayerOriginalFranchise('p_122'), 'CSK');  // Noor Ahmad
  assert.equal(getPlayerOriginalFranchise('p_125'), 'GT');   // Rashid Khan
  assert.equal(getPlayerOriginalFranchise('p_126'), 'RR');  // Ravindra Jadeja
  assert.equal(getPlayerOriginalFranchise('p_138'), 'RCB');  // Tim David
  assert.equal(getPlayerOriginalFranchise('p_174'), 'RCB');  // Jacob Bethell
  assert.equal(getPlayerOriginalFranchise('p_410'), 'SRH');  // Sakib Hussain
});

test('unmapped players are not offered retention and franchise IDs are valid', () => {
  assert.equal(getPlayerOriginalFranchise('unknown-player-id'), null);
  const allowed = new Set(['MI', 'CSK', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG']);
  for (const [playerId, franchiseId] of Object.entries(PLAYER_ORIGINAL_FRANCHISES)) {
    assert.ok(playerId.startsWith('p_'));
    assert.ok(allowed.has(franchiseId), `Invalid franchise for ${playerId}: ${franchiseId}`);
  }
});

test('retention cards require the exact original franchise, available cards, and enough purse', () => {
  assert.equal(RETENTION_CARDS_PER_FRANCHISE, 2);
  assert.equal(RETENTION_DECISION_MS, 5000);
  const base = {
    originalFranchiseId: 'MI',
    eligibleFranchiseId: 'MI',
    cardsRemaining: 2,
    purseRemaining: 20,
    winningBid: 15
  };
  assert.equal(canUseRetentionCard(base), true);
  assert.equal(canUseRetentionCard({ ...base, eligibleFranchiseId: 'CSK' }), false);
  assert.equal(canUseRetentionCard({ ...base, cardsRemaining: 0 }), false);
  assert.equal(canUseRetentionCard({ ...base, purseRemaining: 14.99 }), false);
  assert.equal(canUseRetentionCard({ ...base, winningBid: Number.NaN }), false);
});
