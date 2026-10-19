import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlayerOriginalFranchise, PLAYER_ORIGINAL_FRANCHISES } from '../src/data/playerOriginalFranchises.js';

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
