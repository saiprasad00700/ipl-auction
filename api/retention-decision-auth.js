export function validateRetentionDecision({ offer, uid, decision, now }) {
  if (!offer || offer.status !== 'pending') return { allowed: false, status: 409, reason: 'offer_closed' };
  if (Number(now) > Number(offer.expiresAt) + 1500) return { allowed: false, status: 409, reason: 'offer_expired' };
  if (offer.phase === 'initial_decision') {
    if (offer.eligibleUserId !== uid) return { allowed: false, status: 403, reason: 'not_eligible' };
    if (!['accept', 'decline'].includes(decision)) return { allowed: false, status: 400, reason: 'invalid_initial_decision' };
    return { allowed: true, status: 200, phase: offer.phase, decision, now: Math.min(Number(now), Number(offer.expiresAt)) };
  }
  if (offer.phase === 'match_decision') {
    if (offer.eligibleUserId !== uid) return { allowed: false, status: 403, reason: 'not_eligible' };
    if (!['match', 'decline_counter'].includes(decision)) return { allowed: false, status: 400, reason: 'invalid_match_decision' };
    return { allowed: true, status: 200, phase: offer.phase, decision, now: Math.min(Number(now), Number(offer.expiresAt)) };
  }
  return { allowed: false, status: 409, reason: 'wrong_phase' };
}
