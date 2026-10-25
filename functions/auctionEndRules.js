export const MIN_MEGA_SQUAD_SIZE = 18;

export function evaluateEndAuctionTeams(teams, mode = "mega") {
  const source = teams && typeof teams === "object" && !Array.isArray(teams) ? teams : {};
  const normalizedMode = String(mode || "mega").toLowerCase();
  const minimumApplies = normalizedMode === "mega";
  const updatedTeams = { ...source };
  const disqualifiedNames = [];

  for (const [teamKey, team] of Object.entries(source)) {
    if (!team || typeof team !== "object" || !team.teamId || team.teamId === "NONE") continue;
    const squadCount = Array.isArray(team.squad) ? team.squad.length : 0;
    const disqualified = minimumApplies && squadCount < MIN_MEGA_SQUAD_SIZE;
    updatedTeams[teamKey] = {
      ...team,
      disqualified,
      disqualificationReason: disqualified
        ? `Only ${squadCount} players bought; at least ${MIN_MEGA_SQUAD_SIZE} are required.`
        : null,
      squadCountAtEnd: squadCount
    };
    if (disqualified) disqualifiedNames.push(`${team.teamName || team.teamId} (${squadCount}/${MIN_MEGA_SQUAD_SIZE})`);
  }

  return { teams: updatedTeams, disqualifiedNames, minimumApplies };
}
