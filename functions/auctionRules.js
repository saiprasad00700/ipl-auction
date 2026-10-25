export const BID_INCREMENT_CRORE = 0.5;
export const DEFAULT_BID_TIMER_SECONDS = 15;

const roundMoney = (value) => Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

export function nextBidAmount(currentBid, basePrice = 0) {
  const current = Number(currentBid) || 0;
  if (current <= 0) return roundMoney(Number(basePrice) || 0);
  return roundMoney(current + BID_INCREMENT_CRORE);
}

export function clampBidTimerSeconds(value, fallback = DEFAULT_BID_TIMER_SECONDS) {
  const parsed = Number(value);
  const safeFallback = Number(fallback);
  const seconds = Number.isFinite(parsed) && parsed > 0
    ? parsed
    : Number.isFinite(safeFallback) && safeFallback > 0
      ? safeFallback
      : DEFAULT_BID_TIMER_SECONDS;
  return Math.max(3, Math.min(DEFAULT_BID_TIMER_SECONDS, seconds));
}

export function effectiveOverseasLimit(room) {
  const mode = room?.settings?.auctionType || room?.auctionType || "mega";
  const modeMaximum = mode === "sprint5" ? 2 : 4;
  const configured = Number(room?.settings?.overseasLimit ?? room?.overseasLimit ?? modeMaximum);
  return Number.isFinite(configured) ? Math.max(0, Math.min(modeMaximum, configured)) : modeMaximum;
}
