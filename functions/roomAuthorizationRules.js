export function canSyncTeamStats(callerUid, targetUserId, hostId, isActiveMember) {
  return Boolean(isActiveMember) &&
    typeof callerUid === "string" && callerUid.length > 0 &&
    typeof targetUserId === "string" && targetUserId.length > 0 &&
    (callerUid === targetUserId || callerUid === hostId);
}

export function canStartAuction(room, liveExists, callerUid) {
  if (!room || typeof room !== "object" || liveExists) return false;
  if (room.hostId !== callerUid) return false;
  if (!["waiting", "lobby", undefined, null, ""].includes(room.status)) return false;
  const players = Array.isArray(room.players) ? room.players : [];
  const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : [];
  return players.some((player) => player?.id === callerUid && !banned.includes(callerUid));
}
