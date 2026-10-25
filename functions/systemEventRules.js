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
