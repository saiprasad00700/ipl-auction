// Stable idempotency keys for system messages. Several clients may observe the
// same RTDB transition and request the same announcement at nearly the same time.
export function systemEventReceiptKey(event, room = {}, live = {}, uid = "") {
  const safe = (value) => String(value ?? "unknown").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  if (event === "sale_result" || event === "rtm_result") {
    const lotIdentity = live?.timerEndsAt ?? live?.transitionDeadline ?? live?.lastActivityAt ?? live?.status;
    return safe(`${event}_${live?.playerId}_${lotIdentity}`);
  }
  if (["auction_started", "bidding_ended", "auction_ended", "auction_completed"].includes(event)) {
    return safe(event);
  }
  if (event === "xi_submitted") return safe(`${event}_${uid}`);
  if (event === "player_removed" || event === "auction_paused" || event === "auction_resumed") {
    return safe(`${event}_${room?.lastActivityAt ?? room?.status}`);
  }
  return safe(`${event}_${room?.lastActivityAt ?? "once"}`);
}


const HOST_ONLY_SYSTEM_EVENTS = new Set([
  "auction_started",
  "bidding_ended",
  "auction_paused",
  "auction_resumed",
  "auction_ended",
  "auction_completed",
  "sale_result",
  "rtm_result",
  "player_removed"
]);

export function canPostSystemEvent({ event, uid, room, hasSavedXI = false }) {
  if (!uid || !room || !Array.isArray(room.players)) return false;
  const member = room.players.some((player) => player?.id === uid);
  if (!member || room.bannedPlayers?.includes(uid)) return false;
  if (HOST_ONLY_SYSTEM_EVENTS.has(event) && room.hostId !== uid) return false;
  if (event === "xi_submitted" && !hasSavedXI) return false;
  if (event === "auction_started" && room.status !== "active") return false;
  if (event === "bidding_ended" && room.status !== "awaiting_xi") return false;
  if (event === "auction_ended" && !["awaiting_xi", "analyzing", "completed"].includes(room.status)) return false;
  if (event === "auction_completed" && room.status !== "completed") return false;
  return true;
}
