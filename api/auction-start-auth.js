export function buildAuctionStart({ room, players, random = Math.random, now, bidTimerSeconds }) {
  const roster = Array.isArray(room?.players) ? room.players : Object.values(room?.players || {});
  const participants = new Set(roster.map((p) => String(p?.id || p?.userId || '').trim()).filter(Boolean));
  if (!room || room.status !== 'waiting') return { allowed: false, status: 409, reason: 'room_not_waiting' };
  if (participants.size < 2) return { allowed: false, status: 409, reason: 'minimum_members' };
  const auctionType = room.auctionType || 'mega';
  const targetPlayers = auctionType === 'sprint11' ? 150 : auctionType === 'sprint5' ? 75 : players.length;
  const marquee = [];
  const byRole = {};
  players.forEach((player, index) => {
    if (String(player.set || '').includes('Marquee')) marquee.push(index);
    else (byRole[player.role] ||= []).push(index);
  });
  const selected = new Set(marquee);
  const fraction = Math.max(0, targetPlayers - marquee.length) / Math.max(1, players.length - marquee.length);
  const shuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  for (const roleIndices of Object.values(byRole)) {
    const shuffled = shuffle(roleIndices);
    const limit = auctionType === 'mega' ? shuffled.length : Math.max(1, Math.ceil(shuffled.length * fraction));
    shuffled.slice(0, limit).forEach((index) => selected.add(index));
  }
  const sets = [...new Set(players.map((player) => player.set))];
  const order = [];
  for (const setName of sets) {
    const setIndices = players.map((player, index) => player.set === setName && selected.has(index) ? index : -1).filter(index => index >= 0);
    order.push(...shuffle(setIndices));
  }
  if (!order.length) return { allowed: false, status: 409, reason: 'empty_player_order' };
  const configuredTimer = Number(bidTimerSeconds || 15);
  const timerSeconds = [3, 5, 10, 15].includes(configuredTimer) ? configuredTimer : 15;
  const live = {
    playerId: players[order[0]].id,
    currentBid: 0,
    highBidderId: '',
    highBidderName: 'No Bids',
    timerEndsAt: Number(now) + timerSeconds * 1000,
    status: 'bidding'
  };
  return { allowed: true, status: 200, order, live, room: { ...room, status: 'active', playerOrder: order, lastActivityAt: Number(now) } };
}
