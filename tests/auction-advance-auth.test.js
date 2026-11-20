import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuctionAdvance } from '../api/auction-advance-auth.js';

const players=[{id:'p1'},{id:'p2'}];
const live={playerId:'p1',status:'sold',transitionDeadline:1000};
const room={settings:{bidTimer:15}};

test('rejects lot progression before transition deadline',()=>{
  assert.equal(resolveAuctionAdvance({live,room,order:[0,1],players,now:999}).reason,'transition_waiting');
});

test('advances to next player with reset auction state',()=>{
  const result=resolveAuctionAdvance({live,room,order:[0,1],players,now:1000});
  assert.equal(result.action,'advance');
  assert.equal(result.live.playerId,'p2');
  assert.equal(result.live.currentBid,0);
  assert.equal(result.live.status,'bidding');
  assert.equal(result.live.timerEndsAt,16000);
});

test('marks auction finished after final lot',()=>{
  const result=resolveAuctionAdvance({live:{...live,playerId:'p2'},room,order:[0,1],players,now:1000});
  assert.equal(result.action,'finish');
  assert.equal(result.live.status,'awaiting_xi');
});
