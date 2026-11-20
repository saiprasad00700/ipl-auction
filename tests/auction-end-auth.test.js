import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuctionEnd } from '../api/auction-end-auth.js';

const room={hostId:'host',status:'active',auctionType:'mega'};
const teams={CSK:{teamId:'CSK',teamName:'Chennai',squad:Array(17).fill({id:'p'})},MI:{teamId:'MI',squad:Array(18).fill({id:'p'})}};

test('rejects non-host and already-ended auction',()=>{
 assert.equal(resolveAuctionEnd({room,teams,uid:'guest',now:1000,xiDeadlineMs:300000}).reason,'host_only');
 assert.equal(resolveAuctionEnd({room:{...room,status:'awaiting_xi'},teams,uid:'host',now:1000,xiDeadlineMs:300000}).reason,'already_ended');
});

test('ends mega auction and disqualifies teams below 18',()=>{
 const result=resolveAuctionEnd({room,teams,uid:'host',now:1000,xiDeadlineMs:300000});
 assert.equal(result.allowed,true);assert.equal(result.room.status,'awaiting_xi');assert.equal(result.room.xiSubmissionDeadline,1000);
 assert.equal(result.teams.CSK.disqualified,true);assert.equal(result.teams.MI.disqualified,false);assert.equal(result.disqualified.length,1);
});

test('sprint ends immediately with squad balance analysis phase',()=>{
 const result=resolveAuctionEnd({room:{...room,auctionType:'sprint5'},teams,uid:'host',now:1000,xiDeadlineMs:300000});
 assert.equal(result.usesSquadBalanceAnalysis,true);assert.equal(result.room.xiSubmissionDeadline,301000);assert.equal(result.room.minimumSquadSize,null);
});
