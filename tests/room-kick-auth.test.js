import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRoomKick } from '../api/room-kick-auth.js';

const room={hostId:'host',status:'waiting',players:[{id:'host',isHost:true},{id:'guest',team:'MI'},{id:'bot_RCB',isBot:true}],bannedPlayers:[]};
test('host can kick a room participant and ban them',()=>{const r=applyRoomKick({room,uid:'host',targetUid:'guest',now:100});assert.equal(r.allowed,true);assert.deepEqual(r.room.players.map(p=>p.id),['host','bot_RCB']);assert.deepEqual(r.room.bannedPlayers,['guest']);assert.equal(r.room.lastActivityAt,100);});
test('non-host cannot kick',()=>assert.equal(applyRoomKick({room,uid:'guest',targetUid:'bot_RCB',now:100}).reason,'host_only'));
test('host cannot kick themselves',()=>assert.equal(applyRoomKick({room,uid:'host',targetUid:'host',now:100}).reason,'cannot_kick_self'));
test('missing target is rejected',()=>assert.equal(applyRoomKick({room,uid:'host',targetUid:'missing',now:100}).reason,'target_not_found'));
test('existing bans are preserved without duplicates',()=>{const r=applyRoomKick({room:{...room,bannedPlayers:['guest']},uid:'host',targetUid:'guest',now:100});assert.deepEqual(r.room.bannedPlayers,['guest']);});
