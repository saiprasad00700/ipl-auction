export function applySaleToTeam(team, playerId, price, retained) {
  if (!team || !Array.isArray(team.squad) || team.squad.some((p) => (typeof p === "string" ? p : p?.id) === playerId)) return team;
  const remaining = Number(team.budgetRemaining);
  if (!Number.isFinite(remaining) || !Number.isFinite(price) || price < 0 || price > remaining) return null;
  return {
    ...team,
    budgetRemaining: Number((remaining - price).toFixed(2)),
    spent: Number((Number(team.spent || 0) + price).toFixed(2)),
    retentionCardsRemaining: retained ? Math.max(0, Number(team.retentionCardsRemaining ?? 2) - 1) : Number(team.retentionCardsRemaining ?? 2),
    squad: [...team.squad, { id: playerId, bid: price }]
  };
}
