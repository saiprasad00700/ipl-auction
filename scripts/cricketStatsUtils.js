const normalizeName = (value = "") => String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const numeric = (value) => {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
function oversToBalls(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/^(\d+)(?:\.(\d))?$/);
  if (!match) return null;
  const balls = Number(match[1]) * 6 + Number(match[2] || 0);
  return Number.isFinite(balls) ? balls : null;
}
function playerNameFromRow(row, role) {
  const candidates = role === "batting"
    ? [row.batsman?.name, row.batter?.name, row.name, row.player?.name]
    : [row.bowler?.name, row.batsman?.name, row.name, row.player?.name];
  return candidates.find((name) => typeof name === "string" && name.trim()) || "";
}
export function normalizeScorecard(scorecard, match, season, players) {
  const playerByName = new Map(players.map((player) => [normalizeName(player.name), player]));
  const records = new Map();
  for (const inning of Array.isArray(scorecard.scorecard) ? scorecard.scorecard : []) {
    for (const row of Array.isArray(inning.batting) ? inning.batting : []) {
      const player = playerByName.get(normalizeName(playerNameFromRow(row, "batting")));
      if (!player) continue;
      const record = records.get(player.id) || { player_id: player.id, player_name: player.name, season, match_id: match.id, match_name: match.name, batting_innings: [], bowling_innings: [] };
      record.batting_innings.push({ runs: numeric(row.r), balls: numeric(row.b), fours: numeric(row["4s"] ?? row.fours), sixes: numeric(row["6s"] ?? row.sixes), strike_rate: numeric(row.sr), dismissal: row["dismissal-text"] ?? row.dismissal ?? row.outdec ?? null, innings: inning.inning ?? inning.team ?? null });
      records.set(player.id, record);
    }
    for (const row of Array.isArray(inning.bowling) ? inning.bowling : []) {
      const player = playerByName.get(normalizeName(playerNameFromRow(row, "bowling")));
      if (!player) continue;
      const record = records.get(player.id) || { player_id: player.id, player_name: player.name, season, match_id: match.id, match_name: match.name, batting_innings: [], bowling_innings: [] };
      record.bowling_innings.push({ overs: row.o === null || row.o === undefined ? null : String(row.o), overs_balls: oversToBalls(row.o), maidens: numeric(row.m), runs_conceded: numeric(row.r), wickets: numeric(row.w), economy: numeric(row.eco) });
      records.set(player.id, record);
    }
  }
  return [...records.values()];
}
