export function validateWinnerAnalysisResult({ room, teams, uid, rankings, model, completedAt }) {
  if (!room || typeof room !== 'object') return { allowed:false, status:404, reason:'room_not_found' };
  if (room.hostId !== uid) return { allowed:false, status:403, reason:'host_only' };
  if (room.status !== 'analyzing') return { allowed:false, status:409, reason:'analysis_not_running' };
  const teamEntries = Object.values(teams || {}).filter(t => t?.teamId && t.teamId !== 'NONE');
  if (!Array.isArray(rankings) || rankings.length > 10 || rankings.length !== teamEntries.length) return { allowed:false, status:400, reason:'invalid_rankings' };
  const eligibleIds = new Set(teamEntries.filter(t => !t.disqualified).map(t => String(t.teamId)));
  const seen = new Set();
  for (const item of rankings) {
    const id = String(item?.franchiseId || '');
    const rank = Number(item?.rank);
    if (!eligibleIds.has(id) && !teamEntries.some(t => String(t.teamId) === id && t.disqualified)) return { allowed:false, status:400, reason:'unknown_franchise' };
    if (seen.has(id) || !Number.isInteger(rank) || rank < 1 || rank > rankings.length) return { allowed:false, status:400, reason:'invalid_rankings' };
    seen.add(id);
  }
  const sorted = [...rankings].sort((a,b)=>Number(a.rank)-Number(b.rank));
  if (sorted.some((item,index)=>Number(item.rank)!==index+1)) return { allowed:false, status:400, reason:'invalid_rankings' };
  const timestamp = Number(completedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { allowed:false, status:400, reason:'invalid_timestamp' };
  if (seen.size !== teamEntries.length) return { allowed:false, status:400, reason:'invalid_rankings' };
  const safeRankings = rankings.map(item => ({...item, franchiseId:String(item.franchiseId), rank:Number(item.rank)}));
  const safeModel = String(model || 'AI').slice(0,80);
  return { allowed:true,status:200,room:{...room,status:'completed',completedAt:timestamp,winnerAnalysisStatus:'completed',winnerRankings:safeRankings,winnerAnalysisModel:safeModel,winnerAnalysisCompletedAt:timestamp} };
}
