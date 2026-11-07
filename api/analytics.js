// Pure helpers for SS AUCTION INSIGHTS live-presence analytics.
const BOT_UID_PATTERN = /^(bot[_-]|auctionbot[_-])/i;
const ACTIVE_STATUSES = new Set(['active', 'started', 'in_progress', 'bidding', 'paused']);

export function isRealAnalyticsUser(uid) {
  return typeof uid === 'string' && uid.length > 0 && !BOT_UID_PATTERN.test(uid);
}

export function buildLiveAnalyticsSnapshot(auctions, now = Date.now()) {
  const onlineUsers = new Set();
  const activePlayers = new Set();
  let activeRooms = 0;
  let waitingRooms = 0;
  let onlineRoomMemberships = 0;

  for (const roomNode of Object.values(auctions || {})) {
    if (!roomNode || typeof roomNode !== 'object') continue;
    const room = roomNode.room || {};
    const live = roomNode.live || {};
    const status = String(live.status || room.status || 'waiting').toLowerCase();
    const isActive = ACTIVE_STATUSES.has(status);
    if (isActive) activeRooms += 1;
    else if (status === 'waiting') waitingRooms += 1;

    const rosterValue = room.players || [];
    const roster = Array.isArray(rosterValue) ? rosterValue : Object.values(rosterValue);
    const rosterIds = new Set(roster
      .filter((player) => player && !player.isBot)
      .map((player) => player.id || player.userId)
      .filter(isRealAnalyticsUser));

    const presence = roomNode.presence || {};
    for (const [uid, entry] of Object.entries(presence)) {
      if (!isRealAnalyticsUser(uid) || entry?.online !== true) continue;
      onlineUsers.add(uid);
      onlineRoomMemberships += 1;
      if (isActive && rosterIds.has(uid)) activePlayers.add(uid);
    }
  }

  return {
    onlinePlayers: onlineUsers.size,
    activePlayers: activePlayers.size,
    activeRooms,
    waitingRooms,
    onlineRoomMemberships,
    measuredAt: new Date(now).toISOString()
  };
}
