export function validateRetentionCounterBid({ offer, uid, amount, team, now }) {
  const counterBid = Number(Number(amount).toFixed(2));
  if (!offer || offer.status !== 'pending' || offer.phase !== 'counter_bid') return { allowed: false, status: 409, reason: 'wrong_phase' };
  if (offer.buyerId !== uid) return { allowed: false, status: 403, reason: 'not_buyer' };
  if (Number(now) > Number(offer.expiresAt)) return { allowed: false, status: 409, reason: 'offer_expired' };
  if (!Number.isFinite(counterBid) || counterBid <= Number(offer.bid || 0)) return { allowed: false, status: 400, reason: 'counter_not_higher' };
  if (!team || team.userId !== uid) return { allowed: false, status: 403, reason: 'team_record_mismatch' };
  const budget = Number(team.budgetRemaining ?? 0);
  if (counterBid > budget || counterBid > budget + Number(team.spent || 0)) return { allowed: false, status: 409, reason: 'insufficient_budget' };
  return { allowed: true, status: 200, counterBid };
}
