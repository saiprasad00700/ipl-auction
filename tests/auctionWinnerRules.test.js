// Modified from the upstream project by saiprasad00700.
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
    { id: 'overseas0', country: 'AUS', role: 'All-Rounder' },
    { id: 'overseas1', country: 'AUS', role: 'All-Rounder' },
    { id: 'overseas2', country: 'AUS', role: 'Bowler' },
    { id: 'overseas3', country: 'AUS', role: 'Batter' },
    { id: 'overseas4', country: 'AUS', role: 'Batter' },
    { id: 'indian0', country: 'IND', role: 'Wicket-Keeper' },
    ...Array.from({ length: 3 }, (_, i) => ({ id: `indianBat${i}`, country: 'IND', role: 'Batter' })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `indianAR${i}`, country: 'IND', role: 'All-Rounder' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `indianBowl${i}`, country: 'IND', role: 'Bowler' })),
  ];
  const byId = Object.fromEntries(mixedCatalog.map((p) => [p.id, p]));
  const mixedSquad = mixedCatalog.map((p) => ({ id: p.id, bid: 1 }));
  const validIds = ['overseas0', 'overseas1', 'overseas2', 'overseas3', 'indian0', 'indianBat0', 'indianBat1', 'indianBat2', 'indianAR0', 'indianBowl0', 'indianBowl1'];
  const validXI = validIds.map((id) => byId[id]);
  assert.equal(validatePlayingXI(validXI, byId.overseas4, mixedSquad, mixedCatalog), true);
  const invalidIds = ['overseas0', 'overseas1', 'overseas2', 'overseas3', 'overseas4', 'indian0', 'indianBat0', 'indianBat1', 'indianAR0', 'indianBowl0', 'indianBowl1'];
  const invalidXI = invalidIds.map((id) => byId[id]);
  assert.equal(validatePlayingXI(invalidXI, byId.indianAR1, mixedSquad, mixedCatalog), false);
});



test('XI validation requires at least two all-rounders and five bowling options', () => {
  const invalidCatalog = [
    { id: 'wk-only', role: 'Wicket-Keeper', country: 'IND' },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `bat-only-${i}`, role: 'Batsman', country: 'IND' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `bowl-only-${i}`, role: 'Bowler', country: 'IND' })),
    { id: 'impact', role: 'Batsman', country: 'IND' },
  ];
  const invalidSquad = invalidCatalog.map((p) => ({ id: p.id }));
  assert.equal(
    validatePlayingXI(invalidCatalog.slice(0, 11), invalidCatalog[11], invalidSquad, invalidCatalog),
    false,
  );
});

test('automatic XI selection never exceeds four known overseas starters', () => {
  const overseasBatters = Array.from({ length: 5 }, (_, i) => ({
    id: `overseasBat${i}`, role: 'Batsman', country: 'OS', type: 'Overseas',
  }));
  const indianPlayers = [
    { id: 'wk-ind', role: 'Wicket-Keeper', country: 'IND', type: 'Indian' },
    ...Array.from({ length: 7 }, (_, i) => ({ id: `bat-ind${i}`, role: 'Batsman', country: 'IND', type: 'Indian' })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `ar-ind${i}`, role: 'All-Rounder', country: 'IND', type: 'Indian' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `bowl-ind${i}`, role: 'Bowler', country: 'IND', type: 'Indian' })),
  ];
  const catalogWithOverseas = [...overseasBatters, ...indianPlayers];
  const squadWithOverseas = catalogWithOverseas.map((p) => ({ id: p.id }));
  const selection = autoSelectBestXI(squadWithOverseas, catalogWithOverseas);
  assert.equal(selection.startingXI.length, 11);
  assert.ok(selection.impactPlayer);
  assert.ok(selection.startingXI.filter((p) => p.country === 'OS').length <= 4);
  assert.equal(validatePlayingXI(selection.startingXI, selection.impactPlayer, squadWithOverseas, catalogWithOverseas), true);
});

test('missing nationality metadata does not falsely count every player as overseas', () => {
  const catalogWithoutCountry = [
    { id: 'unknown-country-0', role: 'Wicket-Keeper' },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `unknown-country-bat${i}`, role: 'Batsman' })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `unknown-country-ar${i}`, role: 'All-Rounder' })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `unknown-country-bowl${i}`, role: 'Bowler' })),
  ];
  const squadWithoutCountry = catalogWithoutCountry.map((p) => ({ id: p.id }));
  assert.equal(
    validatePlayingXI(catalogWithoutCountry.slice(0, 11), catalogWithoutCountry[11], squadWithoutCountry, catalogWithoutCountry),
    true,
  );
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
