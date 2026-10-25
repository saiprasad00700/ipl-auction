// Pure validation for the required role balance in a submitted Playing XI.
const normalizedRole = (player) => String(player?.role || "").trim().toLowerCase();

export function validatePlayingXIComposition(playerIds, playerCatalog) {
  if (!Array.isArray(playerIds) || playerIds.length !== 11) {
    return { valid: false, reason: "Choose exactly 11 starting players." };
  }

  const roles = playerIds.map((id) => normalizedRole(playerCatalog?.[id]));
  const allRounders = roles.filter((role) => role.includes("all")).length;
  const bowlingOptions = roles.filter((role) => role.includes("all") || role.includes("bowl")).length;

  if (allRounders < 2) {
    return { valid: false, reason: "Your Playing XI must include at least two all-rounders." };
  }
  if (bowlingOptions < 5) {
    return { valid: false, reason: "Your Playing XI must include at least five bowling options, including all-rounders." };
  }
  return { valid: true, reason: null };
}
