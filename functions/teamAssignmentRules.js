// Rules shared by the trusted franchise-assignment endpoint and its tests.
export function canChangeFranchise(status) {
  return status === undefined || status === null || status === "" || status === "waiting" || status === "lobby";
}

export function isFranchiseAvailable(players, userId, teamId) {
  return (Array.isArray(players) ? players : []).every(
    (player) => player?.id === userId || player?.team !== teamId
  );
}

export function hasPurchasedPlayers(team) {
  return Number(team?.spent || 0) > 0 ||
    (Array.isArray(team?.squad) && team.squad.length > 0);
}

export function buildTeamAssignmentRecord(existingTeam, roomId, userId, teamId, teamName, defaultBudget = 120) {
  const existing = existingTeam && typeof existingTeam === "object" ? existingTeam : {};
  const budget = Number(existing.budgetRemaining ?? defaultBudget);
  const spent = Number(existing.spent || 0);
  const cards = Number(existing.retentionCardsRemaining ?? 2);
  return {
    ...existing,
    auctionId: roomId,
    userId,
    teamId,
    teamName,
    budgetRemaining: Number.isFinite(budget) && budget >= 0 ? budget : defaultBudget,
    spent: Number.isFinite(spent) && spent >= 0 ? spent : 0,
    squad: Array.isArray(existing.squad) ? existing.squad : [],
    retentionCardsRemaining: Number.isInteger(cards) && cards >= 0 && cards <= 2 ? cards : 2
  };
}
