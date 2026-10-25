import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const projectId = 'demo-ss-auction-rules';
let env;

before(async () => {
  const rules = fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
  env = await initializeTestEnvironment({
    projectId,
    database: { rules },
  });
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('auctions/ROOM01/room').set({
      hostId: 'host-user',
      status: 'waiting',
    });
    await context.database().ref('auctions/ROOM01/live').set({ status: 'waiting' });
  });
});

after(async () => {
  await env?.cleanup();
});

test('unauthenticated users cannot read auction rooms', async () => {
  await assertFails(env.unauthenticatedContext().database().ref('auctions/ROOM01').once('value'));
});

test('host can update room status', async () => {
  const hostDb = env.authenticatedContext('host-user').database();
  await assertSucceeds(hostDb.ref('auctions/ROOM01/room/status').set('active'));
});

test('non-host cannot take control of room lifecycle', async () => {
  const guestDb = env.authenticatedContext('guest-user').database();
  await assertFails(guestDb.ref('auctions/ROOM01/room/status').set('active'));
});

test('non-host can perform the permitted winner-analysis transition', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('auctions/ROOM01/room/status').set('awaiting_xi');
  });
  const guestDb = env.authenticatedContext('guest-user').database();
  await assertSucceeds(guestDb.ref('auctions/ROOM01/room/status').set('analyzing'));
});

test('valid chat message is accepted', async () => {
  const guestDb = env.authenticatedContext('guest-user').database();
  await assertSucceeds(guestDb.ref('auctions/ROOM01/messages/msg1').set({
    userId: 'guest-user',
    userName: 'Guest',
    text: 'Hello',
    type: 'chat',
    timestamp: Date.now(),
  }));
});

test('chat message with oversized text is rejected', async () => {
  const guestDb = env.authenticatedContext('guest-user').database();
  await assertFails(guestDb.ref('auctions/ROOM01/messages/msg2').set({
    userId: 'guest-user',
    userName: 'Guest',
    text: 'x'.repeat(2001),
    type: 'chat',
    timestamp: Date.now(),
  }));
});

test('unauthenticated users cannot write team data', async () => {
  await assertFails(env.unauthenticatedContext().database().ref('auctions/ROOM01/teams/team1').set({
    teamName: 'Test',
  }));
});

test('authenticated users currently can write team data; keep this regression test until the client write path is redesigned', async () => {
  const guestDb = env.authenticatedContext('guest-user').database();
  await assertSucceeds(guestDb.ref('auctions/ROOM01/teams/team1').set({
    teamName: 'Test',
  }));
});
