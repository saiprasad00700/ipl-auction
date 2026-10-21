import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoSelectBestXI,
  validatePlayingXI,
  validateUniqueRankings,
  canUseRetentionCard,
  PLAYING_XI_DEADLINE_MS,
  RETENTION_DECISION_MS,
  RETENTION_CARDS_PER_FRANCHISE,
} from '../src/lib/auctionWinnerRules.js';

const catalog = [
  ...Array.from({ length: 5 }, (_, i) => ({ id: `bat${i}`, name: `Batter ${i}`, role: 'Batter', rating: 80 - i })),
  { id: 'wk', name: 'Keeper', role: 'Wicketkeeper Batter', rating: 79 },
  { id: 'ar1', name: 'AR 1', role: 'All-Rounder', rating: 78 },
  { id: 'ar2', name: 'AR 2', role: 'All-Rounder', rating: 77 },
  ...Array.from({ length: 7 }, (_, i) => ({ id: `bowl${i}`, name: `Bowler ${i}`, role: 'Bowler', rating: 76 - i })),
];
const squad = catalog.map((p) => ({ id: p.id, bid: 1 }));

test('post-auction deadlines and retention allowance match product rules', () => {
  assert.equal(PLAYING_XI_DEADLINE_MS, 120000);
  assert.equal(RETENTION_DECISION_MS, 10000);
  assert.equal(RETENTION_CARDS_PER_FRANCHISE, 2);
});

test('auto-selection chooses 11 unique squad players and one distinct impact player', () => {
  const selection = autoSelectBestXI(squad, catalog);
  assert.equal(selection.startingXI.length, 11);
  assert.ok(selection.impactPlayer);
  assert.equal(new Set([...selection.startingXI.map((p) => p.id), selection.impactPlayer.id]).size, 12);
  assert.equal(validatePlayingXI(selection.startingXI, selection.impactPlayer, squad), true);
  assert.equal(selection.autoSelected, true);
});

test('XI validation rejects duplicate or out-of-squad selections', () => {
  const selection = autoSelectBestXI(squad, catalog);
  assert.equal(validatePlayingXI([...selection.startingXI.slice(1), selection.startingXI[0]], selection.startingXI[0], squad), false);
  assert.equal(validatePlayingXI(selection.startingXI, { id: 'not-in-squad' }, squad), false);
});

test('Playing XI allows at most four overseas players while squad can contain more', () => {
  const mixedCatalog = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `overseas${i}`, country: 'AUS', role: 'Batter' })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `indian${i}`, country: 'IND', role: 'Batter' })),
  ];
  const mixedSquad = mixedCatalog.map((p) => ({ id: p.id, bid: 1 }));
  const validXI = [...mixedCatalog.slice(0, 4), ...mixedCatalog.slice(5, 12)];
  assert.equal(validatePlayingXI(validXI, mixedCatalog[4], mixedSquad, mixedCatalog), true);
  const invalidXI = mixedCatalog.slice(0, 5).concat(mixedCatalog.slice(5, 11));
  assert.equal(validatePlayingXI(invalidXI, mixedCatalog[11], mixedSquad, mixedCatalog), false);
});

test('ranking validation requires every franchise exactly once and ranks 1..N without ties', () => {
  const ids = ['MI', 'CSK', 'RCB'];
  assert.equal(validateUniqueRankings(ids.map((franchiseId, i) => ({ franchiseId, rank: i + 1 })), ids), true);
  assert.equal(validateUniqueRankings([{ franchiseId: 'MI', rank: 1 }, { franchiseId: 'CSK', rank: 1 }, { franchiseId: 'RCB', rank: 3 }], ids), false);
  assert.equal(validateUniqueRankings([{ franchiseId: 'MI', rank: 1 }, { franchiseId: 'CSK', rank: 2 }], ids), false);
});

test('retention requires original franchise, available card, and enough purse', () => {
  const base = { originalFranchiseId: 'CSK', eligibleFranchiseId: 'CSK', cardsRemaining: 1, purseRemaining: 10, winningBid: 8 };
  assert.equal(canUseRetentionCard(base), true);
  assert.equal(canUseRetentionCard({ ...base, eligibleFranchiseId: 'MI' }), false);
  assert.equal(canUseRetentionCard({ ...base, cardsRemaining: 0 }), false);
  assert.equal(canUseRetentionCard({ ...base, purseRemaining: 7 }), false);
});
