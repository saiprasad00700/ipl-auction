export function applyAuctionPauseResume({ live, action, now }) {
  if (!live || !['pause','resume'].includes(action)) return { allowed: false, status: 400, reason: 'invalid_request' };
  if (action === 'pause') {
    if (live.isPaused) return { allowed: false, status: 409, reason: 'already_paused' };
    if (['sold','unsold','awaiting_xi','completed'].includes(live.status)) return { allowed: false, status: 409, reason: 'lot_not_pausable' };
    const next={...live,isPaused:true,pausedAt:Number(now),pausedFromStatus:live.status};
    if (live.status==='bidding') {
      next.pausedTimerRemainingMs=Math.max(0,Number(live.timerEndsAt||now)-Number(now));
      next.status='paused';
    }
    return { allowed:true,status:200,live:next };
  }
  if (!live.isPaused) return { allowed:false,status:409,reason:'not_paused' };
  const pausedDuration=Math.max(0,Number(now)-Number(live.pausedAt||now));
  const next={...live};
  if (live.status==='paused') {
    next.status=live.pausedFromStatus||'bidding';
    next.timerEndsAt=Number(now)+Math.max(0,Number(live.pausedTimerRemainingMs||0));
  } else if (live.status==='processing_sale'&&live.retentionOffer?.status==='pending') {
    next.retentionOffer={...live.retentionOffer,expiresAt:Number(live.retentionOffer.expiresAt||now)+pausedDuration};
  }
  delete next.isPaused;delete next.pausedAt;delete next.pausedFromStatus;delete next.pausedTimerRemainingMs;
  return {allowed:true,status:200,live:next};
}
