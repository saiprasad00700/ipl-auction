// Server-side bid validation helpers.
export function validateBidRequest({ room, live, team, uid, now, players, nextBidAmount }) {
  if (!room || !live) return { allowed: false, status: 404, reason: 'room_or_live_state_missing' };
  if (!uid) return { allowed: false, status: 401, reason: 'identity_required' };
  const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
  const participant = roster.find((p) => p && (p.id === uid || p.userId === uid));
  if (!participant || participant.isBot) return { allowed: false, status: 403, reason: 'participant_required' };
  const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : Object.keys(room.bannedPlayers || {}).filter((key) => room.bannedPlayers[key] === true);
  if (banned.includes(uid)) return { allowed: false, status: 403, reason: 'banned' };
  if (!['active', 'bidding'].includes(String(room.status || '')) || live.status !== 'bidding') return { allowed: false, status: 409, reason: 'auction_not_bidding' };
  if (live.highBidderId === uid) return { allowed: false, status: 409, reason: 'already_high_bidder' };
  if (live.timerEndsAt && Number(now) >= Number(live.timerEndsAt)) return { allowed: false, status: 409, reason: 'bid_timer_expired' };
  if (!team || team.userId !== uid || team.teamId !== participant.team) return { allowed: false, status: 403, reason: 'team_record_mismatch' };
  const player = players.find((p) => p.id === live.playerId);
  if (!player) return { allowed: false, status: 409, reason: 'current_player_unknown' };
  const squad = Array.isArray(team.squad) ? team.squad : [];
  const squadLimit = Number(room.squadLimit || 25);
  if (squad.length >= squadLimit) return { allowed: false, status: 409, reason: 'squad_limit' };
  const overseasLimit = Number(room.overseasLimit || 8);
  const isOverseas = player.country !== 'IND';
  if (isOverseas && squad.reduce((count, item) => {
    const p = players.find((candidate) => candidate.id === (typeof item === 'string' ? item : item?.id));
    return count + (p && p.country !== 'IND' ? 1 : 0);
  }, 0) >= overseasLimit) return { allowed: false, status: 409, reason: 'overseas_limit' };
  const amount = Number(nextBidAmount(live.currentBid || 0, player));
  const budget = Number(team.budgetRemaining ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || budget < amount) return { allowed: false, status: 409, reason: 'insufficient_budget' };
  return { allowed: true, status: 200, amount, participant, player };
}
