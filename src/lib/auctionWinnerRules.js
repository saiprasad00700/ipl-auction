/**
 * Pure helpers for the post-auction squad evaluation workflow.
 * Kept independent of React/Firebase so the rules can be unit-tested.
 */
export const PLAYING_XI_DEADLINE_MS = 2 * 60 * 1000;
export const RETENTION_DECISION_MS = 10 * 1000;
export const RETENTION_CARDS_PER_FRANCHISE = 2;
export const PLAYING_XI_SIZE = 11;
export const IMPACT_PLAYER_COUNT = 1;
export const MAX_OVERSEAS_PLAYERS_IN_XI = 4;

const normalizeRole = (player) => {
  const role = String(player?.role || player?.playingRole || '').toLowerCase();
  if (role.includes('keeper') || role.includes('wicket')) return 'wk';
  if (role.includes('all')) return 'ar';
  if (role.includes('bat')) return 'bat';
  if (role.includes('bowl')) return 'bowl';
  return 'unknown';
};

const playerId = (player) => typeof player === 'string' ? player : player?.id;

const toPlayer = (squadItem, playerCatalog) => {
  const id = playerId(squadItem);
  const catalogPlayer = playerCatalog.find((player) => player.id === id);
  if (!catalogPlayer) return null;
  return { ...catalogPlayer, ...((typeof squadItem === 'object' && squadItem) || {}) , id };
};

/**
 * Role-balanced XI fallback. Uses only the actual franchise squad and role metadata;
 * it does not depend on artificial player ratings.
 */
export function autoSelectBestXI(squad, playerCatalog = []) {
  const players = (Array.isArray(squad) ? squad : [])
    .map((item) => toPlayer(item, playerCatalog))
    .filter(Boolean);
  const unique = [...new Map(players.map((p) => [p.id, p])).values()];
  const selected = [];
  const addBest = (predicate, categoryLimit) => {
    const alreadySelected = selected.filter(predicate).length;
    const needed = Math.max(0, categoryLimit - alreadySelected);
    const candidates = unique
      .filter((p) => !selected.some((s) => s.id === p.id) && predicate(p))
      .sort((a, b) => unique.indexOf(a) - unique.indexOf(b));
    selected.push(...candidates.slice(0, needed));
  };

  addBest((p) => normalizeRole(p) === 'wk', 1);
  addBest((p) => normalizeRole(p) === 'bat', 4);
  addBest((p) => normalizeRole(p) === 'ar', 2);
  addBest((p) => normalizeRole(p) === 'bowl', 4);
  addBest(() => true, PLAYING_XI_SIZE);
  const startingXI = selected.slice(0, PLAYING_XI_SIZE);
  const impact = unique
    .filter((p) => !startingXI.some((s) => s.id === p.id))
    [0] || null;

  return { startingXI, impactPlayer: impact, autoSelected: true };
}

export function validatePlayingXI(startingXI, impactPlayer, squad, playerCatalog = []) {
  if (!Array.isArray(startingXI) || startingXI.length !== PLAYING_XI_SIZE || !impactPlayer) return false;
  const squadIds = new Set((squad || []).map(playerId).filter(Boolean));
  const selectedIds = [...startingXI.map(playerId), playerId(impactPlayer)];
  if (!selectedIds.every(Boolean)
    || new Set(selectedIds).size !== PLAYING_XI_SIZE + IMPACT_PLAYER_COUNT
    || !selectedIds.every((id) => squadIds.has(id))) return false;

  // IPL's four-overseas-player restriction applies to the starting XI, not the full squad.
  const overseasInXI = startingXI.reduce((count, item) => {
    const player = toPlayer(item, playerCatalog);
    return count + (player && player.country !== 'IND' ? 1 : 0);
  }, 0);
  return overseasInXI <= MAX_OVERSEAS_PLAYERS_IN_XI;
}

/** Deterministic validation of the no-ties 1..N ranking contract. */
export function validateUniqueRankings(rankings, franchiseIds) {
  if (!Array.isArray(rankings) || rankings.length !== franchiseIds.length) return false;
  const ids = rankings.map((r) => r.franchiseId);
  const ranks = rankings.map((r) => r.rank);
  return new Set(ids).size === franchiseIds.length
    && franchiseIds.every((id) => ids.includes(id))
    && ranks.every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= franchiseIds.length)
    && new Set(ranks).size === franchiseIds.length;
}

/** Retention eligibility is limited to the player's original IPL franchise. */
export function canUseRetentionCard({ originalFranchiseId, eligibleFranchiseId, cardsRemaining, purseRemaining, winningBid }) {
  return Boolean(originalFranchiseId)
    && originalFranchiseId === eligibleFranchiseId
    && Number(cardsRemaining) > 0
    && Number.isFinite(Number(winningBid))
    && Number(winningBid) >= 0
    && Number(purseRemaining) >= Number(winningBid);
}
