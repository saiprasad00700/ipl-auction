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
  assert.match(room, /aria-controls="auction-room-header-panel"/);
  assert.match(room, /id="auction-room-header-panel"/);
  assert.match(room, /aria-label=\{sidebarTab === 'chat' \? 'Voice Chat panel' : 'Live Activity panel'\}/);
});

test('floating header panels close on outside pointer interaction and clean up listeners', () => {
  assert.match(room, /handleOutsidePointerDown/);
  assert.match(room, /document\.addEventListener\('pointerdown', handleOutsidePointerDown\)/);
  assert.match(room, /document\.removeEventListener\('pointerdown', handleOutsidePointerDown\)/);
  assert.match(room, /settingsPanelRef\.current\?\.contains\(target\)/);
  assert.match(room, /headerPanelRef\.current\?\.contains\(target\)/);
  assert.match(room, /setShowSettings\(false\)/);
  assert.match(room, /setShowHeaderPanel\(false\)/);
});

test('opening one header panel closes the other panel', () => {
  assert.match(room, /setShowHeaderPanel\(false\); setShowSettings\(\(open\) => !open\)/);
  assert.match(room, /setShowSettings\(false\); if \(showHeaderPanel && sidebarTab === 'activity'\)/);
  assert.match(room, /setShowSettings\(false\); if \(showHeaderPanel && sidebarTab === 'chat'\)/);
});

test('Escape closes open settings and activity/chat header panels', () => {
  assert.match(room, /if \(!showSettings && !showHeaderPanel\) return undefined/);
  assert.match(room, /event\.key !== 'Escape'/);
  assert.match(room, /setShowSettings\(false\)/);
  assert.match(room, /setShowHeaderPanel\(false\)/);
  assert.match(room, /settingsTriggerRef = useRef\(null\)/);
  assert.match(room, /activityTriggerRef = useRef\(null\)/);
  assert.match(room, /voiceChatTriggerRef = useRef\(null\)/);
  assert.match(room, /focusTarget\?\.focus\(\)/);
  assert.match(room, /ref=\{settingsTriggerRef\}/);
  assert.match(room, /ref=\{activityTriggerRef\}/);
  assert.match(room, /ref=\{voiceChatTriggerRef\}/);
  assert.match(room, /removeEventListener\('keydown', handlePanelKeyDown\)/);
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
  assert.match(arena, /return \(\) => window\.clearTimeout\(timer\)/);
});

test('reduced-motion preferences are supported by the cinematic styling', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('outside dismissal restores focus and panels respect mobile safe areas', () => {
  assert.match(room, /settingsTriggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(room, /focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /min-height: 2\.75rem/);
  assert.match(css, /overscroll-behavior: contain/);
});

test('keyboard users receive a visible focus indicator', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
});


test('cinematic player lower-third reflects player and live auction phase', () => {
  assert.match(room, /ss-cinematic-player-lower-third/);
  assert.match(room, /currentPlayer\?\.name/);
  assert.match(room, /currentPlayer\?\.role/);
  assert.match(room, /RETENTION REVIEW/);
  assert.match(css, /\.ss-cinematic-player-lower-third\s*\{/);
  assert.match(css, /@keyframes ss-lower-third-enter/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

 
test('cinematic countdown reflects intro and urgent bidding states', () => {
  assert.match(room, /ss-cinematic-countdown/);
  assert.match(room, /BIDDING OPENS IN/);
  assert.match(room, /Bidding timer: /);
  assert.match(room, /timeLeft <= 5/);
  assert.match(css, /\.ss-cinematic-countdown\.is-urgent/);
  assert.match(css, /@keyframes ss-countdown-urgent/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});


test('final five seconds are announced accessibly without announcing every tick', () => {
  assert.match(room, /className="sr-only" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(room, /Number\(timeLeft\) === 5 \? 'Five seconds remaining to bid\.' : ''/);
  assert.match(room, /aria-hidden="true">\s*<span className="ss-countdown-label">/);
});


test('player introduction uses role-specific motion and respects reduced motion', () => {
  assert.match(playerStage, /data-player-role=\{roleKey\}/);
  assert.match(playerStage, /const roleKey = isKeeper \? 'keeper' : isAllRounder \? 'allrounder' : isBowler \? 'bowler' : 'batter'/);
  assert.match(css, /ss-role-intro\[data-player-role="bowler"\] \.ss-character-arm-right/);
  assert.match(css, /@keyframes ss-character-bowler-windup/);
  assert.match(css, /@keyframes ss-character-bat-lift/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*ss-role-intro\[data-player-role\]/);
});
