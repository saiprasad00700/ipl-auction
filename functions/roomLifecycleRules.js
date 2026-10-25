export const INACTIVE_ROOM_TTL_MS = 30 * 60 * 1000;

// Some legacy clients update updatedAt/createdAt while the trusted activity
// heartbeat is absent or stale. Use the newest trustworthy timestamp rather
// than the first available field, otherwise a recently active room can be
// incorrectly removed.
export function roomLastActivity(room, directoryEntry = null) {
  const candidates = [
    room?.lastActivityAt,
    room?.updatedAt,
    room?.createdAt,
    directoryEntry?.lastActivityAt,
    directoryEntry?.createdAt
  ];
  const timestamps = candidates
    .map((candidate) => Number(candidate))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  return timestamps.length ? Math.max(...timestamps) : null;
}

export function shouldDeleteInactiveRoom(room, now = Date.now(), ttlMs = INACTIVE_ROOM_TTL_MS, directoryEntry = null) {
  if (!room || typeof room !== "object" || Array.isArray(room)) return false;
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  const lastActivity = roomLastActivity(room, directoryEntry);
  if (lastActivity === null || lastActivity > now) return false;
  return now - lastActivity >= ttlMs;
}
