// Shared auction settings and price calculation. All prices are in crore INR.
export const DEFAULT_BID_TIMER_SECONDS = 15;
export const MEGA_OVERSEAS_LIMIT = 4;
export const BID_INCREMENT_CRORE = 0.5;

export function getNextBidAmount(currentBid, basePrice = 0) {
  const bid = Number(currentBid) || 0;
  if (bid <= 0) return Number(Number(basePrice || 0).toFixed(2));
  return Number((bid + BID_INCREMENT_CRORE).toFixed(2));
}
