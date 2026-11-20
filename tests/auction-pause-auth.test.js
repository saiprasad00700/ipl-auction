import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAuctionPauseResume } from '../api/auction-pause-auth.js';

test('pause freezes bidding timer and marks pause state',()=>{
 const live={status:'bidding',timerEndsAt:1500};
 const result=applyAuctionPauseResume({live,action:'pause',now:1000});
 assert.equal(result.allowed,true);assert.equal(result.live.status,'paused');
 assert.equal(result.live.pausedTimerRemainingMs,500);
});

test('pause freezes RTM stage without replacing processing status',()=>{
 const live={status:'processing_sale',retentionOffer:{status:'pending',expiresAt:5000}};
 const result=applyAuctionPauseResume({live,action:'pause',now:2000});
 assert.equal(result.live.status,'processing_sale');assert.equal(result.live.isPaused,true);
});

test('resume restores bidding countdown or extends RTM expiry',()=>{
 const bidding={status:'paused',pausedFromStatus:'bidding',pausedAt:1000,pausedTimerRemainingMs:500,isPaused:true};
 const resumed=applyAuctionPauseResume({live:bidding,action:'resume',now:3000});
 assert.equal(resumed.live.status,'bidding');assert.equal(resumed.live.timerEndsAt,3500);
 const rtm={status:'processing_sale',isPaused:true,pausedAt:1000,retentionOffer:{status:'pending',expiresAt:5000}};
 const r=applyAuctionPauseResume({live:rtm,action:'resume',now:3000});
 assert.equal(r.live.retentionOffer.expiresAt,7000);assert.equal(r.live.isPaused,undefined);
});

test('rejects invalid pause/resume state',()=>{
 assert.equal(applyAuctionPauseResume({live:{status:'sold'},action:'pause',now:1}).reason,'lot_not_pausable');
 assert.equal(applyAuctionPauseResume({live:{status:'bidding'},action:'resume',now:1}).reason,'not_paused');
});
