export function resolveExpiredBidding({ live, room, roomPlayers, teams, players, now, originalFranchiseResolver, canUseRetentionCard, retentionDecisionMs, retentionCardsDefault, megaOverseasLimit }) {
  if (!live || live.status !== 'bidding') return { allowed: false, status: 409, reason: 'not_bidding' };
  if (live.isPaused || room?.status !== 'active') return { allowed: false, status: 409, reason: 'paused_or_inactive' };
  if (live.timerEndsAt && Number(now) < Number(live.timerEndsAt)) return { allowed: false, status: 409, reason: 'bid_timer_open' };
  const sold = Boolean(live.highBidderId);
  let retentionOffer = null;
  if (sold) {
    const originalFranchiseId = originalFranchiseResolver(live.playerId);
    const buyerFranchiseId = live.highBidderTeamId;
    const eligiblePlayer = (roomPlayers || []).find((p) => p?.team === originalFranchiseId && p.id !== live.highBidderId);
    const eligibleTeamEntry = Object.entries(teams || {}).find(([, team]) => team?.userId === eligiblePlayer?.id && team?.teamId === originalFranchiseId);
    const eligibleTeam = eligibleTeamEntry?.[1] || {};
    const cardsRemaining = Number.isFinite(Number(eligibleTeam.retentionCardsRemaining)) ? Number(eligibleTeam.retentionCardsRemaining) : retentionCardsDefault;
    const purseRemaining = Number(eligibleTeam.budgetRemaining ?? room?.settings?.budget ?? 120);
    const player = players.find((p) => p.id === live.playerId);
    const overseas = Boolean(player && player.country !== 'IND');
    const overseasLimit = room.auctionType === 'sprint5' ? 2 : room.auctionType === 'sprint11' ? 4 : megaOverseasLimit;
    const overseasCount = (Array.isArray(eligibleTeam.squad) ? eligibleTeam.squad : []).reduce((count, item) => {
      const playerId = typeof item === 'string' ? item : item?.id;
      const squadPlayer = players.find((p) => p.id === playerId);
      return count + (squadPlayer && squadPlayer.country !== 'IND' ? 1 : 0);
    }, 0);
    const eligibleForOverseasRtm = !overseas || overseasCount < overseasLimit;
    if (originalFranchiseId && originalFranchiseId !== buyerFranchiseId && eligiblePlayer && eligibleForOverseasRtm
      && canUseRetentionCard({ originalFranchiseId, eligibleFranchiseId: eligibleTeam.teamId, cardsRemaining, purseRemaining, winningBid: Number(live.currentBid || 0) })) {
      retentionOffer = {
        playerId: live.playerId, originalFranchiseId,
        eligibleUserId: eligiblePlayer.id, eligibleTeamName: eligiblePlayer.teamName || originalFranchiseId,
        buyerId: live.highBidderId, buyerTeamId: buyerFranchiseId, buyerName: live.highBidderName,
        bid: Number(live.currentBid || 0), counterBid: null, phase: 'initial_decision',
        rtmUsed: false, expiresAt: Number(now) + retentionDecisionMs, status: 'pending', decision: null
      };
    }
  }
  const next = { ...live, status: retentionOffer ? 'processing_sale' : (sold ? 'sold' : 'unsold') };
  if (!retentionOffer) next.transitionDeadline = Number(now) + (sold ? 5000 : 2000) + 2500;
  else delete next.transitionDeadline;
  if (retentionOffer) next.retentionOffer = retentionOffer;
  return { allowed: true, status: 200, live: next, retentionOffer };
}
