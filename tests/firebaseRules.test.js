import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const projectId = 'demo-ss-auction-rules';
let env;

const baseLive = (eligibleUserId, phase = 'initial_decision') => ({
  status: 'processing_sale',
  playerId: 'player-1',
  retentionOffer: {
    playerId: 'player-1',
    originalFranchiseId: 'CSK',
    eligibleUserId,
    eligibleTeamName: 'CSK',
    buyerId: 'buyer-user',
    buyerTeamId: 'RCB',
    bid: 5,
    phase,
    rtmUsed: false,
    expiresAt: Date.now() + 15000,
    status: 'pending'
  }
});

before(async () => {
  const rules = fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
  env = await initializeTestEnvironment({ projectId, database: { rules } });
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('auctions/ROOM01/room').set({ hostId: 'host-user', status: 'active' });
  });
});

after(async () => { await env?.cleanup(); });

test('Firebase Realtime Database accepts and loads the rules file', async () => {
  const db = env.authenticatedContext('host-user').database();
  await assertSucceeds(db.ref('auctions/ROOM01/room/status').once('value'));
});

test('host can record an RTM decision for a bot-controlled original franchise', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('auctions/ROOM01/live').set(baseLive('bot_CSK'));
  });
  const hostDb = env.authenticatedContext('host-user').database();
  await assertSucceeds(hostDb.ref('auctions/ROOM01/live').transaction((live) => {
    if (!live) return;
    live.retentionOffer.decision = 'accept';
    live.retentionOffer.decidedBy = 'host-user';
    live.retentionOffer.decidedAt = Date.now();
    live.retentionOffer.phase = 'counter_bid';
    return live;
  }));
});

test('a different user cannot decide a bot-controlled RTM offer', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('auctions/ROOM01/live').set(baseLive('bot_CSK'));
  });
  const guestDb = env.authenticatedContext('guest-user').database();
  await assertFails(guestDb.ref('auctions/ROOM01/live').transaction((live) => {
    if (!live) return;
    live.retentionOffer.decision = 'accept';
    live.retentionOffer.decidedBy = 'guest-user';
    live.retentionOffer.decidedAt = Date.now();
    live.retentionOffer.phase = 'counter_bid';
    return live;
  }));
});

test('eligible original-franchise user can make a match decision', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('auctions/ROOM01/live').set(baseLive('original-user', 'match_decision'));
  });
  const originalDb = env.authenticatedContext('original-user').database();
  await assertSucceeds(originalDb.ref('auctions/ROOM01/live').transaction((live) => {
    if (!live) return;
    live.retentionOffer.decision = 'match';
    live.retentionOffer.decidedBy = 'original-user';
    live.retentionOffer.decidedAt = Date.now();
    return live;
  }));
});
