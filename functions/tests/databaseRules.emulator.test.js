import { readFileSync } from 'node:fs';
import { test, after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, set, update } from 'firebase/database';

const projectId = 'demo-ss-auction-security';
const env = await initializeTestEnvironment({
  projectId,
  database: { rules: readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8') }
});
after(async () => env.cleanup());

const roomId = 'ABC123';
await env.withSecurityRulesDisabled(async (ctx) => {
  await set(ref(ctx.database(), `auctions/${roomId}`), {
    room: { hostId: 'host-1', status: 'awaiting_xi', players: [{ id: 'host-1' }, { id: 'member-1' }] },
    teams: { ABC123_member: { budgetRemaining: 120, squad: [] } },
    live: { status: 'bidding', currentBid: 2 }
  });
});

test('anonymous clients cannot change auction status', async () => {
  await assertFails(set(ref(env.unauthenticatedContext().database(), `auctions/${roomId}/room/status`), 'completed'));
});

test('non-host members cannot change auction status', async () => {
  await assertFails(set(ref(env.authenticatedContext('member-1').database(), `auctions/${roomId}/room/status`), 'completed'));
});

test('unrelated authenticated users cannot change auction status', async () => {
  await assertFails(set(ref(env.authenticatedContext('outsider').database(), `auctions/${roomId}/room/status`), 'analyzing'));
});

test('host can update auction status using current rules', async () => {
  await assertSucceeds(set(ref(env.authenticatedContext('host-1').database(), `auctions/${roomId}/room/status`), 'analyzing'));
});

test('non-host cannot replace the entire auction room', async () => {
  await assertFails(set(ref(env.authenticatedContext('member-1').database(), `auctions/${roomId}`), { room: { hostId: 'member-1', status: 'completed' } }));
});

test('documents currently permissive team budget write (must be fixed)', async () => {
  await assertSucceeds(update(ref(env.authenticatedContext('outsider').database(), `auctions/${roomId}/teams/ABC123_member`), { budgetRemaining: 999 }));
});
