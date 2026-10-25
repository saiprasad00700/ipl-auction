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


export function canSubmitRtmCounterBid({ uid, room, offer, team, botAction = false, botIds = [] }) {
  if (!uid || !room || !offer || !team) return false;
  if (room.bannedPlayers?.includes(uid)) return false;
  if (botAction) {
    return room.hostId === uid
      && botIds.includes(offer.buyerId)
      && offer.buyerId === team.userId
      && team.teamId === offer.buyerTeamId;
  }
  const isMember = Array.isArray(room.players) && room.players.some((player) => player?.id === uid);
  return isMember
    && offer.buyerId === uid
    && team.userId === uid
    && team.teamId === offer.buyerTeamId;
}
