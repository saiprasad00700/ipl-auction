export function resolveAuctionAdvance({ live, room, order, players, now, bidTimerSeconds }) {
  if (!live || !['sold', 'unsold'].includes(live.status)) return { allowed: false, status: 409, reason: 'lot_not_finished' };
  if (Number(live.transitionDeadline || 0) > Number(now)) return { allowed: false, status: 409, reason: 'transition_waiting' };
  const playerOrder = Array.isArray(order) && order.length ? order : players.map((_, index) => index);
  const currentIndex = playerOrder.findIndex((idx) => players[idx]?.id === live.playerId);
  const nextIndex = currentIndex >= 0 ? playerOrder[currentIndex + 1] : playerOrder[0];
  if (nextIndex === undefined || !players[nextIndex]) {
    return { allowed: true, status: 200, action: 'finish', live: { ...live, status: 'awaiting_xi', transitionDeadline: null }, nextIndex: null };
  }
  return {
    allowed: true,
    status: 200,
    action: 'advance',
    nextIndex,
    live: {
      playerId: players[nextIndex].id,
      currentBid: 0,
      highBidderId: '',
      highBidderName: 'No Bids',
      timerEndsAt: Number(now) + Number(bidTimerSeconds || 15) * 1000,
      status: 'bidding'
    }
  };
}
