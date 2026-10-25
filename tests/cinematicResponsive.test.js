import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const room = await readFile(new URL('../src/pages/AuctionRoom.jsx', import.meta.url), 'utf8');
const playerStage = await readFile(new URL('../src/components/RoleCharacterStage.jsx', import.meta.url), 'utf8');
const auctioneerStage = await readFile(new URL('../src/components/AuctioneerStage.jsx', import.meta.url), 'utf8');

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
  assert.match(playerStage, /aria-label=\{\`Animated/);
  assert.match(playerStage, /\$\{player\.name\}/);
});

test('auctioneer illustration exposes its current auction status accessibly', () => {
  assert.match(auctioneerStage, /role="img"/);
  assert.match(auctioneerStage, /aria-label=\{\`SS Auctioneer stage illustration:/);
  assert.match(auctioneerStage, /aria-hidden="true"/);
});

test('reduced-motion preferences are supported by the cinematic styling', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('keyboard users receive a visible focus indicator', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
});
