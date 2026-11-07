// Shared auction settings and price calculation. All prices are in crore INR.
export const DEFAULT_BID_TIMER_SECONDS = 15;
export const MEGA_OVERSEAS_LIMIT = 8;
export const BID_INCREMENT_CRORE = 0.5;
export const MARQUEE_BID_INCREMENT_CRORE = 0.25;
export const SET_1_BID_INCREMENT_CRORE = 0.25;
export const SET_2_BID_INCREMENT_CRORE = 0.15;

export function getNextBidAmount(currentBid, basePrice = 0, playerSet = '') {
  const bid = Number(currentBid) || 0;
  if (bid <= 0) return Number(Number(basePrice || 0).toFixed(2));

  const setName = String(playerSet || '');
  let increment = BID_INCREMENT_CRORE;

  // Marquee players keep the existing ₹25 lakh increment.
  if (/\bMarquee\b/i.test(setName) || /\bSet\s*1\b/i.test(setName)) {
    increment = SET_1_BID_INCREMENT_CRORE;
  } else if (/\bSet\s*2\b/i.test(setName)) {
    increment = SET_2_BID_INCREMENT_CRORE;
  }

  return Number((bid + increment).toFixed(2));
}
