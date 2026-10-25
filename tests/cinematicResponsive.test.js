import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const room = await readFile(new URL('../src/pages/AuctionRoom.jsx', import.meta.url), 'utf8');
const playerStage = await readFile(new URL('../src/components/RoleCharacterStage.jsx', import.meta.url), 'utf8');
const auctioneerStage = await readFile(new URL('../src/components/AuctioneerStage.jsx', import.meta.url), 'utf8');
const arena = await readFile(new URL('../src/components/FranchiseArenaStrip.jsx', import.meta.url), 'utf8');

test('cinematic auction stage has responsive desktop and mobile layouts', () => {
  assert.match(css, /\.ss-cinematic-player-stage\s*\{/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(css, /\.ss-auctioneer-overlay/);
});

test('cinematic controls expose accessible expanded and pressed states', () => {
  assert.match(room, /aria-expanded=/);
  assert.match(room, /aria-pressed=/);
  assert.match(room, /auction-room-settings-panel/);
});

test('live auction updates are announced without relying on camera cue text', () => {
  assert.match(room, /aria-live="polite"/);
  assert.match(room, /aria-atomic="true"/);
  assert.match(room, /aria-hidden="true"/);
});

test('player introduction has a semantic accessible group and descriptive name', () => {
  assert.match(playerStage, /role="group"/);
  assert.match(playerStage, /aria-label=\{/);
  assert.match(playerStage, /player\.name/);
});

test('auctioneer illustration exposes its current auction status accessibly', () => {
  assert.match(auctioneerStage, /role="img"/);
  assert.match(auctioneerStage, /SS Auctioneer stage illustration:/);
  assert.match(auctioneerStage, /aria-hidden="true"/);
});

test('franchise arena renders team tables with active bidder and decorative paddles', () => {
  assert.match(arena, /teams\.map\(/);
  assert.match(arena, /data-team-id=\{team\.id\}/);
  assert.match(arena, /aria-current=\{active \? 'true' : undefined\}/);
  assert.match(arena, /HIGH BID · LEADING/);
  assert.match(arena, /ss-franchise-bid-paddle/);
  assert.match(arena, /ss-franchise-rtm-paddle/);
  assert.match(arena, /aria-hidden="true"/);
});

test('bid and RTM paddle effects have bounded cleanup timers', () => {
  assert.match(arena, /setTimeout\(\(\) => setRaisedBidTeam\(null\), 850\)/);
  assert.match(arena, /setTimeout\(\(\) => setRaisedRtmTeam\(null\), 1100\)/);
  assert.match(arena, /return \(\) => clearTimeout\(timer\)/);
});

test('reduced-motion preferences are supported by the cinematic styling', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('keyboard users receive a visible focus indicator', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
});
