export function applyFranchiseClaim({root,roomId,uid,teamId,teamNames,budget,now}){
 const room=root?.room;if(!room)return {allowed:false,status:404,reason:'room_not_found'};
 if(room.status!=='waiting')return {allowed:false,status:409,reason:'join_closed'};
 if(!uid||!teamNames[teamId])return {allowed:false,status:400,reason:'invalid_identity_or_team'};
 const players=Array.isArray(room.players)?room.players:Object.values(room.players||{});
 const banned=Array.isArray(room.bannedPlayers)?room.bannedPlayers:Object.keys(room.bannedPlayers||{}).filter(k=>room.bannedPlayers[k]===true);
 if(banned.includes(uid))return {allowed:false,status:403,reason:'banned'};
 if(!players.some(p=>p&&(p.id===uid||p.userId===uid)))return {allowed:false,status:403,reason:'room_member_required'};
 const botId='bot_'+teamId;const bot=players.find(p=>p?.isBot&&p.id===botId&&p.team===teamId);
 const conflict=players.find(p=>p&&p.team===teamId&&p.id!==uid&&p.userId!==uid&&!(p.isBot&&p.id===botId));
 if(conflict)return {allowed:false,status:409,reason:'franchise_taken'};
 const teamName=teamNames[teamId];
 const updatedPlayer={...players.find(p=>p&&(p.id===uid||p.userId===uid)),id:uid,team:teamId,teamName,isBot:false};
 const roster=players.filter(p=>p&&p.id!==uid&&p.userId!==uid&&!(p.isBot&&p.id===botId));roster.push(updatedPlayer);
 const teams={...(root.teams||{})};if(bot)delete teams[roomId+'_bot_'+teamId];
 const humanKey=roomId+'_'+uid;
 const existing=teams[humanKey]||{};teams[humanKey]={...existing,auctionId:roomId,userId:uid,teamId,teamName,budgetRemaining:existing.budgetRemaining??budget,spent:Number(existing.spent||0),squad:Array.isArray(existing.squad)?existing.squad:[],retentionCardsRemaining:Number(existing.retentionCardsRemaining??2)};
 const roomNext={...room,players:roster,lastActivityAt:Number(now)};
 return {allowed:true,status:200,root:{...root,room:roomNext,teams},player:updatedPlayer,botId:bot?botId:null};
}
