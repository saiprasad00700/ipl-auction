import { readFileSync } from 'node:fs';
import { test, after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

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

test('even the host cannot directly change auction status', async () => {
  await assertFails(set(ref(env.authenticatedContext('host-1').database(), `auctions/${roomId}/room/status`), 'analyzing'));
});

test('clients cannot directly replace the player order', async () => {
  const hostDb = env.authenticatedContext('host-1').database();
  const memberDb = env.authenticatedContext('member-1').database();
  await assertFails(set(ref(hostDb, `auctions/${roomId}/playerOrder`), [0, 1, 2]));
  await assertFails(set(ref(memberDb, `auctions/${roomId}/playerOrder`), [0, 1, 2]));
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

test('clients cannot directly mutate live auction state', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  const hostDb = env.authenticatedContext('host-1').database();
  await assertFails(set(ref(memberDb, `auctions/${roomId}/live/currentBid`), 999));
  await assertFails(set(ref(memberDb, `auctions/${roomId}/live/status`), 'sold'));
  await assertFails(set(ref(hostDb, `auctions/${roomId}/live/status`), 'awaiting_xi'));
});


test('only authenticated users can write their own presence under a private room', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  const anonDb = env.unauthenticatedContext().database();
  await assertSucceeds(set(ref(memberDb, `auctions/${roomId}/presence/member-1`), { online: true }));
  await assertFails(set(ref(anonDb, `auctions/${roomId}/presence/anonymous`), { online: true }));
});

test('users can write their own history but cannot write another user history', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  const entry = {
    roomId,
    userId: 'member-1',
    mode: 'mega',
    status: 'active',
    joinedAt: Date.now()
  };
  await assertSucceeds(set(ref(memberDb, `userAuctionHistory/member-1/${roomId}`), entry));
  await assertFails(set(ref(memberDb, `userAuctionHistory/host-1/${roomId}`), {
    ...entry,
    userId: 'host-1'
  }));
});

test('presence is restricted to the authenticated user identity', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  await assertSucceeds(set(ref(memberDb, `auctions/${roomId}/presence/member-1`), {
    online: true,
    lastSeen: Date.now()
  }));
  await assertFails(set(ref(memberDb, `auctions/${roomId}/presence/host-1`), {
    online: false,
    lastSeen: Date.now()
  }));
});

test('chat payloads reject oversized names and messages', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  await assertFails(set(ref(memberDb, `auctions/${roomId}/messages/long-name`), {
    userId: 'member-1',
    userName: 'M'.repeat(81),
    text: 'Hello',
    type: 'text',
    timestamp: Date.now()
  }));
  await assertFails(set(ref(memberDb, `auctions/${roomId}/messages/long-text`), {
    userId: 'member-1',
    userName: 'Member',
    text: 'x'.repeat(2001),
    type: 'text',
    timestamp: Date.now()
  }));
});

test('history rejects an invalid auction mode', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  await assertFails(set(ref(memberDb, `userAuctionHistory/member-1/${roomId}`), {
    roomId,
    userId: 'member-1',
    mode: 'admin',
    status: 'active'
  }));
});


test('authenticated room members can read a room while anonymous users cannot', async () => {
  const memberDb = env.authenticatedContext('member-1').database();
  const anonDb = env.unauthenticatedContext().database();
  await assertSucceeds(get(ref(memberDb, `auctions/${roomId}/room`)));
  await assertFails(get(ref(anonDb, `auctions/${roomId}/room`)));
});

test('users can read their own auction history but not another user history', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `userAuctionHistory/host-1/${roomId}`), {
      roomId,
      userId: 'host-1',
      mode: 'mega',
      status: 'active'
    });
  });
  const memberDb = env.authenticatedContext('member-1').database();
  await assertSucceeds(get(ref(memberDb, `userAuctionHistory/member-1`)));
  await assertFails(get(ref(memberDb, `userAuctionHistory/host-1`)));
});
