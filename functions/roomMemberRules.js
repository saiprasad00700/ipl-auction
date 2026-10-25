// Pure room-member transitions so join behavior can be tested without Firebase.
export function upsertRoomMember(room, userId, userName, now = Date.now()) {
  if (!room || typeof room !== "object" || room.status === "completed") return null;
  if (Array.isArray(room.bannedPlayers) && room.bannedPlayers.includes(userId)) return null;
  const players = Array.isArray(room.players) ? room.players : [];
  const existing = players.find((player) => player?.id === userId || player?.userId === userId);
  const cleaned = players.filter((player) => player && player.id !== userId && player.userId !== userId);
  cleaned.push({
    ...(existing || {}),
    id: userId,
    name: userName,
    team: existing?.team || "",
    teamName: existing?.teamName || "Unknown",
    isHost: userId === room.hostId
  });
  return { ...room, players: cleaned, lastActivityAt: now };
}

export function removeRoomMember(room, hostUid, targetId, now = Date.now()) {
  if (!room || typeof room !== "object" || room.hostId !== hostUid) return null;
  if (room.status && !["waiting", "lobby"].includes(room.status)) return null;
  if (typeof targetId !== "string" || !targetId || targetId === room.hostId) return null;
  const players = Array.isArray(room.players) ? room.players : [];
  const target = players.find((player) => player?.id === targetId);
  if (!target) return null;
  const banned = Array.isArray(room.bannedPlayers) ? room.bannedPlayers : [];
  return {
    target,
    room: {
      ...room,
      players: players.filter((player) => player?.id !== targetId),
      bannedPlayers: [...new Set([...banned, targetId])],
      lastActivityAt: now
    }
  };
}
