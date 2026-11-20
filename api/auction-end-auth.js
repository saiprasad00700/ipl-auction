export function resolveAuctionEnd({ room, teams, uid, now, xiDeadlineMs }) {
  if (!room || !uid) return { allowed:false,status:401,reason:'identity_required' };
  if (room.hostId!==uid) return { allowed:false,status:403,reason:'host_only' };
  if (['awaiting_xi','analyzing','completed','analysis_failed'].includes(room.status)) return { allowed:false,status:409,reason:'already_ended' };
  const isMega=(room.auctionType||'mega')==='mega';
  const disqualified=[];const updates={};
  for(const [key,team] of Object.entries(teams||{})){
    if(!team?.teamId||team.teamId==='NONE')continue;
    const count=Array.isArray(team.squad)?team.squad.length:0;const dq=isMega&&count<18;
    updates[key]={...team,disqualified:dq,disqualificationReason:dq?'Only '+count+' players bought; at least 18 are required.':null,squadCountAtEnd:count};
    if(dq)disqualified.push((team.teamName||team.teamId)+' ('+count+'/18)');
  }
  const deadline=isMega?Number(now):Number(now)+Number(xiDeadlineMs||300000);
  return {allowed:true,status:200,room:{...room,status:'awaiting_xi',xiSubmissionStartedAt:Number(now),xiSubmissionDeadline:deadline,winnerAnalysisStatus:'collecting',minimumSquadSize:isMega?18:null},teams:updates,disqualified,isMega,usesSquadBalanceAnalysis:!isMega};
}
