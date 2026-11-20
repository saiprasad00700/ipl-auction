// Pure room-kick transaction policy. Firebase may rerun this callback; keep it deterministic.
export function applyRoomKick({ room, uid, targetUid, now }) {
  if (!room || typeof room !== 'object') return { allowed:false, status:404, reason:'room_not_found' };
  if (!uid || typeof uid !== 'string' || !targetUid || typeof targetUid !== 'string') return { allowed:false, status:400, reason:'identity_required' };
  if (room.hostId !== uid) return { allowed:false, status:403, reason:'host_only' };
  if (uid === targetUid) return { allowed:false, status:400, reason:'cannot_kick_self' };
  const roster = Array.isArray(room.players) ? room.players : Object.values(room.players || {});
  const target = roster.find((p) => p && (p.id === targetUid || p.userId === targetUid));
  if (!target) return { allowed:false, status:404, reason:'target_not_found' };
  const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : Object.keys(room.bannedPlayers || {}).filter((k) => room.bannedPlayers[k] === true);
  const nextBanned = [...new Set([...banned, targetUid])];
  const nextRoster = roster.filter((p) => p && p.id !== targetUid && p.userId !== targetUid);
  return { allowed:true, status:200, target, room:{...room, players:nextRoster, bannedPlayers:nextBanned, lastActivityAt:Number(now)||0} };
}
