// Pure sale-settlement arithmetic shared by callable functions and unit tests.
const roundMoney = (value) => Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

export function applySaleToTeam(team, playerId, price, retained = false) {
  if (!team || !Array.isArray(team.squad) || typeof playerId !== "string" || !playerId.trim()) {
    return null;
  }

  // A repeated settlement for the same franchise must never deduct the purse twice.
  if (team.squad.some((player) => (typeof player === "string" ? player : player?.id) === playerId)) {
    return team;
  }

  const numericPrice = Number(price);
  const roundedPrice = Number.isFinite(numericPrice) ? roundMoney(numericPrice) : Number.NaN;
  const remaining = Number(team.budgetRemaining);
  const rawSpent = team.spent ?? 0;
  const spent = Number(rawSpent);
  const cardsRemaining = Number(team.retentionCardsRemaining ?? 2);

  if (!Number.isFinite(roundedPrice) || roundedPrice < 0
    || !Number.isFinite(remaining) || remaining < 0
    || !Number.isFinite(spent) || spent < 0
    || !Number.isInteger(cardsRemaining) || cardsRemaining < 0
    || roundedPrice > remaining) {
    return null;
  }

  // Do not silently accept an RTM settlement if the franchise has no card left.
  if (retained && cardsRemaining < 1) return null;

  return {
    ...team,
    budgetRemaining: roundMoney(remaining - roundedPrice),
    spent: roundMoney(spent + roundedPrice),
    retentionCardsRemaining: retained ? cardsRemaining - 1 : cardsRemaining,
    squad: [...team.squad, { id: playerId, bid: roundedPrice }]
  };
}
