import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuctionStart } from '../api/auction-start-auth.js';

const players=[
 {id:'m1',set:'Marquee',role:'BAT'},
 {id:'p1',set:'Set 1',role:'BAT'},
 {id:'p2',set:'Set 1',role:'BAT'},
 {id:'p3',set:'Set 2',role:'BOWL'},
 {id:'p4',set:'Set 2',role:'BOWL'}
];
const random=()=>0.5;

test('rejects non-waiting rooms and fewer than two participants',()=>{
 assert.equal(buildAuctionStart({room:{status:'active',players:[{id:'a'},{id:'b'}]},players,random,now:1000}).reason,'room_not_waiting');
 assert.equal(buildAuctionStart({room:{status:'waiting',players:[{id:'a'}]},players,random,now:1000}).reason,'minimum_members');
});

test('starts a waiting auction with two participants and timer initialized',()=>{
 const result=buildAuctionStart({room:{status:'waiting',auctionType:'mega',players:[{id:'a'},{id:'b'}],settings:{bidTimer:10}},players,random,now:1000});
 assert.equal(result.allowed,true);
 assert.ok(result.order.length>=1);
 assert.equal(result.room.status,'active');
 assert.equal(result.live.status,'bidding');
 assert.equal(result.live.playerId,players[result.order[0]].id);
 assert.equal(result.live.timerEndsAt,11000);
 assert.ok(result.order.includes(0));
});

test('sprint auction uses target-size selection while retaining marquee',()=>{
 const result=buildAuctionStart({room:{status:'waiting',auctionType:'sprint5',players:[{id:'a'},{id:'b'}]},players,random,now:0});
 assert.equal(result.allowed,true);
 assert.ok(result.order.includes(0));
});
