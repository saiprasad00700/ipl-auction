export function validateSaleSettlement({ room, live, team, players }) {
  if (!room || !live || live.status !== 'sold') return { allowed: false, status: 409, reason: 'sale_not_sold' };
  const uid = live.highBidderId;
  const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
  const participant = roster.find((p) => p && (p.id === uid || p.userId === uid));
  if (!uid || !participant || participant.isBot !== true && !participant.team) return { allowed: false, status: 403, reason: 'winner_not_in_room' };
  if (!live.playerId || !players.some((p) => p.id === live.playerId)) return { allowed: false, status: 409, reason: 'unknown_player' };
  if (!Number.isFinite(Number(live.currentBid)) || Number(live.currentBid) < 0) return { allowed: false, status: 409, reason: 'invalid_sale_price' };
  if (team && team.userId && team.userId !== uid) return { allowed: false, status: 409, reason: 'team_identity_mismatch' };
  const retained = live.retentionOffer?.status === 'accepted'
    && live.highBidderTeamId === live.retentionOffer.originalFranchiseId
    && (live.retentionOffer.decision === 'match'
      || (live.retentionOffer.phase === 'counter_bid' && live.retentionOffer.decision === 'accept'));
  return { allowed: true, status: 200, uid, playerId: live.playerId, bid: Number(live.currentBid), teamId: live.highBidderTeamId, retained };
}
