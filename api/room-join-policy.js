// Pure helpers for room-join validation and roster updates. Kept separate so
// concurrency/authorization decisions can be unit-tested without Firebase.
export function validateRoomJoin({ room, uid, teamId, bannedPlayers = [] }) {
  if (!room || typeof room !== 'object') return { allowed: false, status: 404, reason: 'room_not_found' };
  if (!uid || typeof uid !== 'string') return { allowed: false, status: 401, reason: 'identity_required' };
  if (Array.isArray(bannedPlayers) && bannedPlayers.includes(uid)) return { allowed: false, status: 403, reason: 'banned' };
  if (['completed', 'analyzing'].includes(String(room.status || '')) || room.winnerAnalysisStatus === 'completed' || Array.isArray(room.winnerRankings)) {
    return { allowed: false, status: 409, reason: 'room_closed' };
  }
  if (!['waiting', 'lobby', ''].includes(String(room.status || 'waiting'))) return { allowed: false, status: 409, reason: 'join_closed' };
  const players = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
  const existing = players.find((player) => player && (player.id === uid || player.userId === uid));
  if (teamId && !existing) {
    const conflict = players.find((player) => player && player.id !== uid && player.userId !== uid && player.team === teamId);
    if (conflict) return { allowed: false, status: 409, reason: 'franchise_taken' };
  }
  return { allowed: true, status: 200, reason: 'ok', existing };
}

export function buildJoinedRoom({ room, uid, name, teamId, teamName }) {
  const players = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
  const existing = players.find((player) => player && (player.id === uid || player.userId === uid));
  const player = {
    id: uid,
    name: String(name || existing?.name || 'Manager').slice(0, 40),
    team: String(teamId || existing?.team || ''),
    teamName: String(teamName || existing?.teamName || 'Unknown').slice(0, 80),
    isHost: existing?.isHost === true,
    isBot: false
  };
  const roster = players.filter((p) => p && p.id !== uid && p.userId !== uid);
  roster.push(player);
  return { player, roster };
}
