export const INACTIVE_ROOM_TTL_MS = 30 * 60 * 1000;

const ACTIVITY_TIMESTAMP_KEYS = new Set([
  "lastActivityAt", "activityAt", "lastSeen", "joinedAt", "leftAt",
  "lastMessageAt", "lastChatAt", "lastBidAt", "bidAt", "timestamp",
  "createdAt", "updatedAt"
]);

export function timestampMs(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (value.trim() !== "" && Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function latestTimestampInTree(value, key = "") {
  if (value === null || value === undefined) return 0;
  let latest = ACTIVITY_TIMESTAMP_KEYS.has(key) ? timestampMs(value) : 0;
  if (Array.isArray(value)) {
    for (const child of value) latest = Math.max(latest, latestTimestampInTree(child));
  } else if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      latest = Math.max(latest, latestTimestampInTree(childValue, childKey));
    }
  }
  return latest;
}

// Legacy callers can pass only room metadata. Prefer the newest known room or
// directory timestamp so a stale heartbeat does not hide a newer update.
export function roomLastActivity(room, directoryEntry = null) {
  const candidates = [
    room?.lastActivityAt,
    room?.updatedAt,
    room?.createdAt,
    directoryEntry?.lastActivityAt,
    directoryEntry?.createdAt
  ];
  const timestamps = candidates
    .map(timestampMs)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  return timestamps.length ? Math.max(...timestamps) : null;
}

// The scheduled cleanup receives the complete auction node. Inspect timestamp
// fields in messages, presence, live bidding state, players and teams as well
// as the room heartbeat, so older clients cannot cause active rooms to expire.
export function auctionLastActivity(auctionNode, directoryEntry = null) {
  if (!auctionNode || typeof auctionNode !== "object" || Array.isArray(auctionNode)) return null;
  const candidates = [
    timestampMs(auctionNode.room?.lastActivityAt),
    timestampMs(auctionNode.live?.lastActivityAt),
    timestampMs(auctionNode.room?.createdAt),
    timestampMs(auctionNode.createdAt),
    timestampMs(auctionNode.lastActivityAt),
    timestampMs(directoryEntry?.lastActivityAt),
    timestampMs(directoryEntry?.createdAt),
    latestTimestampInTree(auctionNode.messages),
    latestTimestampInTree(auctionNode.presence),
    latestTimestampInTree(auctionNode.live),
    latestTimestampInTree(auctionNode.room?.players),
    latestTimestampInTree(auctionNode.teams)
  ].filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  return candidates.length ? Math.max(...candidates) : null;
}

export function shouldDeleteInactiveRoom(room, now = Date.now(), ttlMs = INACTIVE_ROOM_TTL_MS, directoryEntry = null) {
  if (!room || typeof room !== "object" || Array.isArray(room)) return false;
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  const lastActivity = roomLastActivity(room, directoryEntry);
  if (lastActivity === null || lastActivity > now) return false;
  return now - lastActivity >= ttlMs;
}

export function shouldDeleteInactiveAuction(auctionNode, now = Date.now(), ttlMs = INACTIVE_ROOM_TTL_MS, directoryEntry = null) {
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  const lastActivity = auctionLastActivity(auctionNode, directoryEntry);
  if (lastActivity === null || lastActivity > now) return false;
  return now - lastActivity >= ttlMs;
}
