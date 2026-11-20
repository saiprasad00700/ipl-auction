export function resolveRetentionOffer({ live, now }) {
  if (!live || live.status !== 'processing_sale' || live.isPaused) return { allowed: false, status: 409, reason: 'not_processing' };
  const offer = live.retentionOffer;
  if (!offer || offer.status !== 'pending') return { allowed: false, status: 409, reason: 'offer_closed' };
  const initialDeclined = offer.phase === 'initial_decision' && offer.decision === 'decline'
    && Number(offer.decidedAt) <= Number(offer.expiresAt);
  const matchDecisionMade = offer.phase === 'match_decision'
    && ['match', 'decline_counter'].includes(offer.decision)
    && Number(offer.decidedAt) <= Number(offer.expiresAt);
  if (!initialDeclined && !matchDecisionMade && Number(now) < Number(offer.expiresAt) + 1500) return { allowed: false, status: 409, reason: 'window_open' };
  const next = structuredClone(live);
  const nextOffer = next.retentionOffer;
  if (nextOffer.phase === 'counter_bid' && nextOffer.rtmUsed) {
    next.highBidderId = nextOffer.eligibleUserId;
    next.highBidderName = nextOffer.eligibleTeamName;
    next.highBidderTeamId = nextOffer.originalFranchiseId;
    next.currentBid = Number(nextOffer.bid || next.currentBid || 0);
    nextOffer.status = 'accepted';
  } else if (nextOffer.phase === 'match_decision' && nextOffer.counterBid != null) {
    if (nextOffer.decision === 'match' && Number(nextOffer.decidedAt) <= Number(nextOffer.expiresAt)) {
      next.highBidderId = nextOffer.eligibleUserId;
      next.highBidderName = nextOffer.eligibleTeamName;
      next.highBidderTeamId = nextOffer.originalFranchiseId;
      next.currentBid = Number(nextOffer.counterBid);
      nextOffer.status = 'accepted';
    } else {
      next.highBidderId = nextOffer.buyerId;
      next.highBidderName = nextOffer.buyerName;
      next.highBidderTeamId = nextOffer.buyerTeamId;
      next.currentBid = Number(nextOffer.counterBid);
      nextOffer.status = 'declined';
    }
  } else {
    nextOffer.status = nextOffer.decision === 'decline' ? 'declined' : 'expired';
  }
  next.status = next.highBidderId ? 'sold' : 'unsold';
  next.transitionDeadline = Number(now) + (next.status === 'sold' ? 5000 : 2000) + 2500;
  return { allowed: true, status: 200, live: next };
}
