// Shared auction settings and bid-price calculation. Prices are in crore INR.
export const DEFAULT_BID_TIMER_SECONDS = 15;
export const MIN_BID_TIMER_SECONDS = 3;
export const MAX_BID_TIMER_SECONDS = 15;
export const MEGA_OVERSEAS_LIMIT = 4;
export const SPRINT11_OVERSEAS_LIMIT = 4;
export const SPRINT5_OVERSEAS_LIMIT = 2;
export const BID_INCREMENT_CRORE = 0.5;

export function getOverseasLimit(mode, configuredLimit) {
  const configured = Number(configuredLimit);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const normalized = String(mode || 'mega').toLowerCase();
  if (normalized.includes('sprint5') || normalized.includes('sprint 5')) return SPRINT5_OVERSEAS_LIMIT;
  if (normalized.includes('sprint11') || normalized.includes('sprint 11')) return SPRINT11_OVERSEAS_LIMIT;
  return MEGA_OVERSEAS_LIMIT;
}

export function getNextBidAmount(currentBid, basePrice = 0) {
  const bid = Number(currentBid) || 0;
  const base = Number(basePrice) || 0;
  if (bid <= 0) return Number(base.toFixed(2));
  return Number((bid + BID_INCREMENT_CRORE).toFixed(2));
}

export function clampBidTimerSeconds(value, fallback = DEFAULT_BID_TIMER_SECONDS) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  return Math.min(MAX_BID_TIMER_SECONDS, Math.max(MIN_BID_TIMER_SECONDS, Math.round(safe)));
}
