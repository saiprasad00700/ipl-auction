import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBotBidRequest } from '../api/bot-bid-auth.js';

const room={status:'active',hostId:'host',players:[{id:'bot_CSK',team:'CSK',isBot:true}]};
const live={status:'bidding',playerId:'p1',currentBid:1,highBidderId:'u1',timerEndsAt:5000};
const team={userId:'bot_CSK',teamId:'CSK',budgetRemaining:20};
const decision={shouldBid:true,botUserId:'bot_CSK',teamId:'CSK',nextBid:1.2};

test('allows host to request a valid bot bid for an active room bot',()=>{
 const result=validateBotBidRequest({room,live,team,uid:'host',botUserId:'bot_CSK',now:1000,decision});
 assert.equal(result.allowed,true);assert.equal(result.amount,1.2);
});

test('rejects non-host, missing bot, and team identity mismatch',()=>{
 assert.equal(validateBotBidRequest({room,live,team,uid:'guest',botUserId:'bot_CSK',now:1000,decision}).reason,'host_only');
 assert.equal(validateBotBidRequest({room,live,team,uid:'host',botUserId:'bot_MI',now:1000,decision}).reason,'bot_not_in_room');
 assert.equal(validateBotBidRequest({room,live,team:{...team,teamId:'MI'},uid:'host',botUserId:'bot_CSK',now:1000,decision}).reason,'bot_team_mismatch');
});

test('rejects inactive, expired, and invalid bot decisions',()=>{
 assert.equal(validateBotBidRequest({room,live:{...live,status:'sold'},team,uid:'host',botUserId:'bot_CSK',now:1000,decision}).reason,'auction_not_bidding');
 assert.equal(validateBotBidRequest({room,live,team,uid:'host',botUserId:'bot_CSK',now:5000,decision}).reason,'bid_timer_expired');
 assert.equal(validateBotBidRequest({room,live,team,uid:'host',botUserId:'bot_CSK',now:1000,decision:{...decision,shouldBid:false}}).reason,'bot_bid_not_eligible');
 assert.equal(validateBotBidRequest({room,live,team,uid:'host',botUserId:'bot_CSK',now:1000,decision:{...decision,nextBid:30}}).reason,'invalid_bot_bid_amount');
});
