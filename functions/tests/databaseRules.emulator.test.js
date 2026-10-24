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

test('clients cannot forge the room inactivity heartbeat', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  const hostDb = env.authenticatedContext('host-1').database();
  await assertFails(set(ref(memberDb, `auctions/${roomId}/room/lastActivityAt`), Date.now()));
  await assertFails(set(ref(hostDb, `auctions/${roomId}/room/lastActivityAt`), Date.now()));
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

test('unrelated authenticated users cannot change a team budget', async () => {
  await assertFails(update(ref(env.authenticatedContext('outsider').database(), `auctions/${roomId}/teams/ABC123_member`), { budgetRemaining: 999 }));
});

test('team members cannot directly change their own squad or retention cards', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  await assertFails(update(ref(memberDb, `auctions/${roomId}/teams/ABC123_member`), {
    squad: [{ id: 'p_101' }],
    retentionCardsRemaining: 0
  }));
});

test('host cannot bypass team protection through a team-record write', async () => {
  const hostDb = env.authenticatedContext('host-1').database();
  await assertFails(update(ref(hostDb, `auctions/${roomId}/teams/ABC123_member`), {
    budgetRemaining: 999,
    squad: [{ id: 'p_999' }]
  }));
});

test('host cannot replace the entire auction tree to bypass child rules', async () => {
  const hostDb = env.authenticatedContext('host-1').database();
  await assertFails(set(ref(hostDb, `auctions/${roomId}`), {
    room: { hostId: 'host-1', status: 'completed' },
    teams: { ABC123_member: { budgetRemaining: 999, squad: [{ id: 'p_999' }] } }
  }));
});

test('ordinary members cannot directly alter the room roster', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  await assertFails(set(ref(memberDb, `auctions/${roomId}/room/players`), [
    { id: 'member-1' },
    { id: 'outsider', isHost: true }
  ]));
});

test('host cannot bypass roster protection by writing the room parent', async () => {
  const hostDb = env.authenticatedContext('host-1').database();
  await assertFails(update(ref(hostDb, `auctions/${roomId}/room`), {
    players: [{ id: 'host-1' }, { id: 'forged-user', isHost: true }]
  }));
});

test('members can send only chat messages under their own identity', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  await assertSucceeds(set(ref(memberDb, `auctions/${roomId}/messages/chat-1`), {
    userId: 'member-1', userName: 'Member', text: 'Hello everyone', type: 'text', timestamp: Date.now()
  }));
  await assertFails(set(ref(memberDb, `auctions/${roomId}/messages/fake-system`), {
    userId: 'system', userName: 'System', text: 'Auction ended!', type: 'log', timestamp: Date.now()
  }));
  await assertFails(set(ref(memberDb, `auctions/${roomId}/messages/spoofed-user`), {
    userId: 'host-1', userName: 'Host', text: 'Fake host message', type: 'text', timestamp: Date.now()
  }));
});

test('members cannot replace the messages collection or write a forged system event', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  await assertFails(set(ref(memberDb, `auctions/${roomId}/messages`), {
    fake: { userId: 'system', userName: 'System', text: 'Forged', type: 'log', timestamp: Date.now() }
  }));
});
