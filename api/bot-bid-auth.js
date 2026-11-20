export function validateBotBidRequest({ room, live, team, uid, botUserId, now, decision }) {
  if (!room || !live) return { allowed:false,status:404,reason:'room_or_live_state_missing' };
  if (!uid || room.hostId !== uid) return { allowed:false,status:403,reason:'host_only' };
  if (!botUserId || !String(botUserId).startsWith('bot_')) return { allowed:false,status:400,reason:'invalid_bot_identity' };
  const roster=Array.isArray(room.players)?room.players:Object.values(room.players||{});
  const bot=roster.find(p=>p&&p.id===botUserId&&p.isBot===true);
  if(!bot)return {allowed:false,status:403,reason:'bot_not_in_room'};
  if(!team||team.userId!==botUserId||team.teamId!==bot.team)return {allowed:false,status:409,reason:'bot_team_mismatch'};
  if(room.status!=='active'||live.status!=='bidding'||live.isPaused)return {allowed:false,status:409,reason:'auction_not_bidding'};
  if(live.highBidderId===botUserId)return {allowed:false,status:409,reason:'already_high_bidder'};
  if(live.timerEndsAt&&Number(now)>=Number(live.timerEndsAt))return {allowed:false,status:409,reason:'bid_timer_expired'};
  if(!decision||decision.shouldBid!==true||decision.botUserId!==botUserId||decision.teamId!==bot.team)return {allowed:false,status:409,reason:'bot_bid_not_eligible'};
  const amount=Number(decision.nextBid);
  if(!Number.isFinite(amount)||amount<=Number(live.currentBid||0)||amount>Number(team.budgetRemaining||0))return {allowed:false,status:409,reason:'invalid_bot_bid_amount'};
  return {allowed:true,status:200,bot,amount};
}
