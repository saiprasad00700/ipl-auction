// Modified from the upstream project by saiprasad00700.
/**
 * Pure helpers for the post-auction squad evaluation workflow.
 * Kept independent of React/Firebase so the rules can be unit-tested.
 */
export const PLAYING_XI_DEADLINE_MS = 3 * 60 * 1000;
export const RETENTION_DECISION_MS = 10 * 1000;
export const RETENTION_CARDS_PER_FRANCHISE = 2;
export const PLAYING_XI_SIZE = 11;
export const IMPACT_PLAYER_COUNT = 1;
export const MAX_OVERSEAS_PLAYERS_IN_XI = 4;
export const MAX_OVERSEAS_PLAYERS_IN_SELECTION = 4;
export const MIN_ALL_ROUNDERS_IN_XI = 2;
export const MIN_BOWLERS_IN_XI = 5;

const normalizeRole = (player) => {
  const role = String(player?.role || player?.playingRole || '').toLowerCase();
  if (role.includes('keeper') || role.includes('wicket')) return 'wk';
  if (role.includes('all')) return 'ar';
  if (role.includes('bat')) return 'bat';
  if (role.includes('bowl')) return 'bowl';
  return 'unknown';
};

const playerId = (player) => typeof player === 'string' ? player : player?.id;

// The player dataset uses country="IND" for Indian players and "OS" for
// overseas players. Support readable labels too, while treating missing
// nationality as unknown rather than incorrectly counting it as overseas.
const isOverseasPlayer = (player) => {
  const country = String(player?.country || '').trim().toUpperCase();
  const type = String(player?.type || '').trim().toUpperCase();
  if (type === 'OVERSEAS' || type === 'OS') return true;
  if (!country) return false;
  return !['IND', 'IN', 'INDIA', 'INDIAN'].includes(country);
};

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
const numericStat = (player, keys) => {
  for (const key of keys) {
    const value = Number(player?.recentStats?.[key] ?? player?.stats?.[key] ?? player?.[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
};

// Use only explicitly supplied recent performance statistics. The legacy
// artificial "rating" field is deliberately ignored.
const performanceScore = (player) => {
  const runs = numericStat(player, ['runsLast3Years', 'recentRuns', 'runs']);
  const wickets = numericStat(player, ['wicketsLast3Years', 'recentWickets', 'wickets']);
  const strikeRate = numericStat(player, ['strikeRateLast3Years', 'recentStrikeRate', 'strikeRate']);
  const economy = numericStat(player, ['economyLast3Years', 'recentEconomy', 'economy']);
  const average = numericStat(player, ['averageLast3Years', 'recentAverage', 'average']);
  const scores = [];
  if (runs !== null) scores.push(Math.min(runs / 100, 100));
  if (wickets !== null) scores.push(Math.min(wickets * 2, 100));
  if (strikeRate !== null) scores.push(Math.min(strikeRate / 2, 100));
  if (economy !== null) scores.push(Math.max(0, 100 - economy * 8));
  if (average !== null) scores.push(Math.min(average * 2, 100));
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
};

const roleValue = (player) => {
  const role = normalizeRole(player);
  return role === 'wk' ? 4 : role === 'ar' ? 3 : role === 'bat' ? 2 : role === 'bowl' ? 1 : 0;
};

/**
 * Select a valid, role-balanced XI and Impact Player from the actual squad.
 * Recent performance fields are used only when explicitly present. Artificial
 * player ratings and squad ordering are never treated as performance evidence.
 */
export function autoSelectBestXI(squad, playerCatalog = []) {
  const players = (Array.isArray(squad) ? squad : [])
    .map((item) => toPlayer(item, playerCatalog))
    .filter(Boolean);
  const unique = [...new Map(players.map((p) => [p.id, p])).values()];
  const selected = [];
  const overseasCount = (items) => items.filter(isOverseasPlayer).length;
  const ordered = (items) => [...items].sort((a, b) => {
    const aScore = performanceScore(a);
    const bScore = performanceScore(b);
    if (aScore !== null || bScore !== null) {
      if (aScore === null) return 1;
      if (bScore === null) return -1;
      if (bScore !== aScore) return bScore - aScore;
    }
    return roleValue(b) - roleValue(a) || String(a.name || a.id).localeCompare(String(b.name || b.id));
  });
  const addBest = (predicate, categoryLimit) => {
    let needed = Math.max(0, categoryLimit - selected.filter(predicate).length);
    for (const candidate of ordered(unique.filter((p) => !selected.some((s) => s.id === p.id) && predicate(p)))) {
      if (needed <= 0 || selected.length >= PLAYING_XI_SIZE) break;
      if (isOverseasPlayer(candidate) && overseasCount(selected) >= MAX_OVERSEAS_PLAYERS_IN_XI) continue;
      selected.push(candidate);
      needed -= 1;
    }
  };

  addBest((p) => normalizeRole(p) === 'wk', 1);
  addBest((p) => normalizeRole(p) === 'bat', 4);
  addBest((p) => normalizeRole(p) === 'ar', MIN_ALL_ROUNDERS_IN_XI);
  addBest((p) => normalizeRole(p) === 'bowl', MIN_BOWLERS_IN_XI - MIN_ALL_ROUNDERS_IN_XI);
  addBest(() => true, PLAYING_XI_SIZE);

  const startingXI = selected.slice(0, PLAYING_XI_SIZE);
  const impactPlayer = ordered(unique
    .filter((p) => !startingXI.some((s) => s.id === p.id))
    .filter((candidate) => overseasCount([...startingXI, candidate]) <= MAX_OVERSEAS_PLAYERS_IN_SELECTION))[0] || null;

  const valid = validatePlayingXI(startingXI, impactPlayer, squad, playerCatalog);
  return { startingXI: valid ? startingXI : [], impactPlayer: valid ? impactPlayer : null, impactPlayerChasing: valid ? impactPlayer : null, impactPlayerDefending: valid ? impactPlayer : null, autoSelected: true, selectionStatus: valid ? 'selected' : 'ineligible_squad' };
}

export function validatePlayingXI(startingXI, impactPlayer, squad, playerCatalog = []) {
  if (!Array.isArray(startingXI) || startingXI.length !== PLAYING_XI_SIZE || !impactPlayer) return false;
  const squadIds = new Set((squad || []).map(playerId).filter(Boolean));
  const selectedIds = [...startingXI.map(playerId), playerId(impactPlayer)];
  if (!selectedIds.every(Boolean)
    || new Set(selectedIds).size !== PLAYING_XI_SIZE + IMPACT_PLAYER_COUNT
    || !selectedIds.every((id) => squadIds.has(id))) return false;

  // The four-overseas-player restriction covers all 12 selected players,
  // including the Impact Player slot.
  const resolvedXI = startingXI.map((item) => toPlayer(item, playerCatalog)).filter(Boolean);
  const resolvedImpactPlayer = toPlayer(impactPlayer, playerCatalog);
  if (resolvedXI.length !== PLAYING_XI_SIZE || !resolvedImpactPlayer) return false;
  const overseasInSelection = [...resolvedXI, resolvedImpactPlayer].filter(isOverseasPlayer).length;
  const allRoundersInXI = resolvedXI.filter((player) => normalizeRole(player) === 'ar').length;
  // All-rounders count toward the five-player bowling group, as required by the game rules.
  const bowlingOptionsInXI = resolvedXI.filter((player) =>
    ['ar', 'bowl'].includes(normalizeRole(player))
  ).length;

  return overseasInSelection <= MAX_OVERSEAS_PLAYERS_IN_SELECTION
    && allRoundersInXI >= MIN_ALL_ROUNDERS_IN_XI
    && bowlingOptionsInXI >= MIN_BOWLERS_IN_XI;
}

/**
 * Validate 11 ordered starters and two Impact Player choices.
 * The Impact slots may contain the same player, but neither may duplicate a starter.
 */
export function validatePlayingXIOptions(startingXI, impactPlayerChasing, impactPlayerDefending, squad, playerCatalog = []) {
  if (!Array.isArray(startingXI) || startingXI.length !== PLAYING_XI_SIZE || !impactPlayerChasing || !impactPlayerDefending) return false;
  const squadIds = new Set((squad || []).map(playerId).filter(Boolean));
  const starterIds = startingXI.map(playerId);
  const chasingId = playerId(impactPlayerChasing);
  const defendingId = playerId(impactPlayerDefending);
  if (!starterIds.every(Boolean) || new Set(starterIds).size !== PLAYING_XI_SIZE) return false;
  if (!chasingId || !defendingId || starterIds.includes(chasingId) || starterIds.includes(defendingId)) return false;
  if (![...starterIds, chasingId, defendingId].every((id) => squadIds.has(id))) return false;

  const resolvedXI = startingXI.map((item) => toPlayer(item, playerCatalog)).filter(Boolean);
  const chasing = toPlayer(impactPlayerChasing, playerCatalog);
  const defending = toPlayer(impactPlayerDefending, playerCatalog);
  if (resolvedXI.length !== PLAYING_XI_SIZE || !chasing || !defending) return false;
  const uniqueSelected = [...new Map([...resolvedXI, chasing, defending].map((player) => [player.id, player])).values()];
  const overseasCount = uniqueSelected.filter(isOverseasPlayer).length;
  const allRounders = resolvedXI.filter((player) => normalizeRole(player) === 'ar').length;
  const bowlingOptions = resolvedXI.filter((player) => ['ar', 'bowl'].includes(normalizeRole(player))).length;
  return overseasCount <= MAX_OVERSEAS_PLAYERS_IN_SELECTION
    && allRounders >= MIN_ALL_ROUNDERS_IN_XI
    && bowlingOptions >= MIN_BOWLERS_IN_XI;
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
