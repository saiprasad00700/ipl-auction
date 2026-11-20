import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExpiredBidding } from '../api/expired-bidding-auth.js';

const players=[{id:'p1',country:'IND'},{id:'p2',country:'AUS'}];
const room={status:'active',auctionType:'mega',settings:{budget:120}};
const roomPlayers=[{id:'buyer',team:'MI'},{id:'original',team:'CSK',teamName:'Chennai Super Kings'}];
const teams={CSK:{userId:'original',teamId:'CSK',budgetRemaining:50,retentionCardsRemaining:2,squad:[]}};
const resolve=id=>id==='p1'?'CSK':null;
const canUse=({originalFranchiseId,eligibleFranchiseId,cardsRemaining,purseRemaining,winningBid})=>originalFranchiseId===eligibleFranchiseId&&cardsRemaining>0&&purseRemaining>=winningBid;

test('rejects bidding before timer expiry or inactive room',()=>{
  const live={status:'bidding',playerId:'p1',timerEndsAt:1000};
  assert.equal(resolveExpiredBidding({live,room,roomPlayers,teams,players,now:999,originalFranchiseResolver:resolve,canUseRetentionCard:canUse,retentionDecisionMs:10000,retentionCardsDefault:2,megaOverseasLimit:8}).reason,'bid_timer_open');
  assert.equal(resolveExpiredBidding({live:{...live,timerEndsAt:0},room:{...room,status:'waiting'},roomPlayers,teams,players,now:1000,originalFranchiseResolver:resolve,canUseRetentionCard:canUse,retentionDecisionMs:10000,retentionCardsDefault:2,megaOverseasLimit:8}).reason,'paused_or_inactive');
});

test('creates eligible RTM offer on expired sold bid',()=>{
  const live={status:'bidding',playerId:'p1',highBidderId:'buyer',highBidderName:'Buyer',highBidderTeamId:'MI',currentBid:10,timerEndsAt:1000};
  const result=resolveExpiredBidding({live,room,roomPlayers,teams,players,now:1000,originalFranchiseResolver:resolve,canUseRetentionCard:canUse,retentionDecisionMs:10000,retentionCardsDefault:2,megaOverseasLimit:8});
  assert.equal(result.allowed,true);
  assert.equal(result.live.status,'processing_sale');
  assert.equal(result.retentionOffer.eligibleUserId,'original');
  assert.equal(result.retentionOffer.expiresAt,11000);
});

test('skips RTM when no eligible manager/card/purse/overseas capacity and marks sold',()=>{
  const live={status:'bidding',playerId:'p2',highBidderId:'buyer',highBidderName:'Buyer',highBidderTeamId:'MI',currentBid:10,timerEndsAt:1000};
  const blockedTeams={CSK:{...teams.CSK,retentionCardsRemaining:0}};
  const result=resolveExpiredBidding({live,room,roomPlayers,teams:blockedTeams,players,now:1000,originalFranchiseResolver:()=> 'CSK',canUseRetentionCard:canUse,retentionDecisionMs:10000,retentionCardsDefault:2,megaOverseasLimit:8});
  assert.equal(result.live.status,'sold');
  assert.equal(result.retentionOffer,null);
});
