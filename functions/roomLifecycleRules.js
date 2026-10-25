export const INACTIVE_ROOM_TTL_MS = 30 * 60 * 1000;

export function roomLastActivity(room, directoryEntry = null) {
  const candidates = [
    room?.lastActivityAt,
    room?.updatedAt,
    room?.createdAt,
    directoryEntry?.lastActivityAt,
    directoryEntry?.createdAt
  ];
  for (const candidate of candidates) {
    const timestamp = Number(candidate);
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }
  return null;
}

export function shouldDeleteInactiveRoom(room, now = Date.now(), ttlMs = INACTIVE_ROOM_TTL_MS, directoryEntry = null) {
  if (!room || typeof room !== "object" || Array.isArray(room)) return false;
  const lastActivity = roomLastActivity(room, directoryEntry);
  if (lastActivity === null || !Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  // A future timestamp may indicate clock skew; never delete on that basis.
  if (lastActivity > now) return false;
  return now - lastActivity >= ttlMs;
}
