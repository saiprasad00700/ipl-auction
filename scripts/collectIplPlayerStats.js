/**
 * Resumable IPL player-stat collector.
 * Required env: CRICKET_API_KEY, SUPABASE_URL (or VITE_SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY. Run: node scripts/collectIplPlayerStats.js
 */
import { IPL_PLAYERS } from "../src/data/players.js";
import { normalizeScorecard } from "./cricketStatsUtils.js";

const API_BASE = "https://api.cricapi.com/v1";
const SEASONS = [2024, 2025, 2026];
const API_KEY = process.env.CRICKET_API_KEY;
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!API_KEY) throw new Error("Missing CRICKET_API_KEY. Set it in local .env or server environment.");
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

async function cricApi(endpoint) {
  const url = new URL(API_BASE + "/" + endpoint);
  url.searchParams.set("apikey", API_KEY);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "success") {
    const reason = payload.reason || `HTTP ${response.status}`;
    if (/hits.*(exceeded|limit)|daily.*limit|quota/i.test(reason)) {
      const error = new Error(reason); error.code = "DAILY_LIMIT"; throw error;
    }
    throw new Error(`CricAPI request failed: ${reason}`);
  }
  return payload.data;
}

async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json", ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 700)}`);
  return response.status === 204 ? null : response.json();
}

async function findSeries(year) {
  for (let offset = 0; offset < 2000; offset += 1) {
    const rows = await cricApi(`series?offset=${offset}`);
    const found = rows.find((item) => {
      const name = String(item.name || "").toLowerCase();
      return name.includes("indian premier league") && name.includes(String(year));
    });
    if (found) return found;
    if (!rows.length) break;
  }
  throw new Error(`IPL ${year} series not found in CricAPI.`);
}

async function wasSaved(matchId) {
  const params = new URLSearchParams({ select: "match_id", match_id: "eq." + matchId, limit: "1" });
  return (await supabase("cricket_player_match_stats?" + params)).length > 0;
}

async function saveRows(rows) {
  for (let i = 0; i < rows.length; i += 100) {
    await supabase("cricket_player_match_stats?on_conflict=player_id,match_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 100)),
    });
  }
}

async function main() {
  console.log(`[Stats] Loaded ${IPL_PLAYERS.length} auction players.`);
  let savedMatches = 0, savedRows = 0;
  for (const season of SEASONS) {
    console.log(`[Stats] Looking up IPL ${season}...`);
    const series = await findSeries(season);
    const details = await cricApi(`series_info?id=${encodeURIComponent(series.id)}`);
    const matches = (details.matchList || []).filter((m) =>
      m.id && (m.matchEnded === true || /won|drawn|tied|no result|abandoned/i.test(m.status || ""))
    );
    console.log(`[Stats] ${series.name}: ${matches.length} completed matches.`);
    for (const match of matches) {
      if (await wasSaved(match.id)) continue;
      const scorecard = await cricApi(`match_scorecard?id=${encodeURIComponent(match.id)}`);
      const rows = normalizeScorecard(scorecard, match, season, IPL_PLAYERS)
        .map((row) => ({ ...row, updated_at: new Date().toISOString() }));
      await saveRows(rows);
      savedMatches += 1; savedRows += rows.length;
      console.log(`[Stats] Saved ${rows.length} players: ${match.name}`);
    }
  }
  console.log(`[Stats] Run complete. New matches: ${savedMatches}; player-match records: ${savedRows}.`);
}
main().catch((error) => {
  if (error.code === "DAILY_LIMIT") {
    console.warn("[Stats] Daily API limit reached. Saved matches are retained; run again tomorrow.");
    process.exitCode = 0;
  } else {
    console.error("[Stats] Collection failed:", error.message);
    process.exitCode = 1;
  }
});
