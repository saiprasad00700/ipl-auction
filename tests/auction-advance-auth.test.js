import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuctionAdvance } from '../api/auction-advance-auth.js';

const players=[{id:'p1'},{id:'p2'}];
const live={playerId:'p1',status:'sold',transitionDeadline:1000};
const room={status:'active',settings:{bidTimer:15}};

test('rejects lot progression before transition deadline',()=>{
  assert.equal(resolveAuctionAdvance({live,room,order:[0,1],players,now:999}).reason,'transition_waiting');
});

test('rejects progression while paused or room inactive',()=>{
  assert.equal(resolveAuctionAdvance({live:{...live,isPaused:true},room,order:[0,1],players,now:1000}).reason,'paused_or_inactive');
  assert.equal(resolveAuctionAdvance({live,room:{...room,status:'paused'},order:[0,1],players,now:1000}).reason,'paused_or_inactive');
});

test('advances to next player with reset auction state',()=>{
  const result=resolveAuctionAdvance({live,room,order:[0,1],players,now:1000});
  assert.equal(result.action,'advance');
  assert.equal(result.live.playerId,'p2');
  assert.equal(result.live.currentBid,0);
  assert.equal(result.live.status,'bidding');
  assert.equal(result.live.timerEndsAt,16000);
});

test('rejects a current player not present in the auction order',()=>{
  assert.equal(resolveAuctionAdvance({live:{...live,playerId:'unknown'},room,order:[0,1],players,now:1000}).reason,'current_player_not_in_order');
});

test('marks auction finished after final lot',()=>{
  const result=resolveAuctionAdvance({live:{...live,playerId:'p2'},room,order:[0,1],players,now:1000});
  assert.equal(result.action,'finish');
  assert.equal(result.live.status,'awaiting_xi');
});
