/* Modified from the upstream project by saiprasad00700. */
/**
 * Server-side AI ranking endpoint for IPL auction rooms.
 *
 * Deploy this endpoint on a platform that supports the /api serverless convention
 * (for example Vercel). Configure GEMINI_API_KEY as a server-side environment
 * variable. Never expose this key through Vite/VITE_* variables.
 */
const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const getText = (value) => (typeof value === "string" ? value.trim() : "");

import { recordGuardianError } from './guardian.js';

export default async function handler(req, res) {
  // Supports both Vercel's Node request/response shape and API-gateway style.
  const method = req.method || req.httpMethod;
  if (method !== "POST") {
    const result = json(405, { error: "Method not allowed" });
    if (res?.status) return res.status(405).json({ error: "Method not allowed" });
    return result;
  }

  const body = req.body && typeof req.body === "object"
    ? req.body
    : (() => { try { return JSON.parse(req.body || "{}"); } catch { return {}; } })();

  const roomId = getText(body.roomId);
  const franchises = Array.isArray(body.franchises) ? body.franchises : [];
  const auctionType = getText(body.auctionType) || "mega";
  const usesSquadBalanceAnalysis = ["sprint5", "sprint11"].includes(auctionType);
  const minimumFranchises = usesSquadBalanceAnalysis ? 1 : 2;
  if (!roomId || franchises.length < minimumFranchises || franchises.length > 20) {
    const error = { error: `Provide a roomId and between ${minimumFranchises} and 20 franchises.` };
    if (res?.status) return res.status(400).json(error);
    return json(400, error);
  }

  // Bound payload size and normalize untrusted client data before sending to AI.
  const normalized = franchises.map((team, index) => ({
    franchiseId: getText(team?.franchiseId) || `franchise-${index + 1}`,
    franchiseName: getText(team?.franchiseName) || `Franchise ${index + 1}`,
    submittedXI: Array.isArray(team?.submittedXI) ? team.submittedXI.slice(0, 13) : [],
    impactPlayerChasing: team?.impactPlayerChasing && typeof team.impactPlayerChasing === 'object' ? team.impactPlayerChasing : null,
    impactPlayerDefending: team?.impactPlayerDefending && typeof team.impactPlayerDefending === 'object' ? team.impactPlayerDefending : null,
    fullSquad: Array.isArray(team?.fullSquad) ? team.fullSquad.slice(0, 35) : [],
    autoSelected: Boolean(team?.autoSelected),
  }));
  if (JSON.stringify(normalized).length > 180_000) {
    const error = { error: "Analysis payload is too large." };
    if (res?.status) return res.status(413).json(error);
    return json(413, error);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = { error: "AI analysis is not configured. Set GEMINI_API_KEY on the server." };
    if (res?.status) return res.status(503).json(error);
    return json(503, error);
  }


  // Load verified recent IPL match records from the server-only Supabase table.
  // Player IDs in the auction catalogue (p_...) are the same IDs used by the
  // approved mapping import; never match these records by display name.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Recent IPL statistics are not configured. Check Supabase server environment variables.");
  }

  const playerById = new Map();
  for (const team of normalized) {
    for (const player of [...team.submittedXI, ...team.fullSquad]) {
      const id = getText(player?.id);
      if (id && /^p_[a-zA-Z0-9_-]+$/.test(id)) playerById.set(id, getText(player?.name) || id);
    }
  }
  const recentStatsByPlayer = new Map();
  let statsRowsLoaded = 0;
  if (playerById.size) {
    const base = supabaseUrl.replace(/\/$/, "") + "/rest/v1/cricket_player_match_stats";
    const ids = [...playerById.keys()];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const url = new URL(base);
      url.searchParams.set("select", "player_id,player_name,season,batting_innings,bowling_innings");
      url.searchParams.set("player_id", "in.(" + ids.join(",") + ")");
      url.searchParams.set("season", "gte.2024");
      url.searchParams.set("order", "season.asc,player_id.asc");
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("offset", String(offset));
      const statsResponse = await fetch(url, {
        headers: { apikey: supabaseServiceKey, Authorization: "Bearer " + supabaseServiceKey }
      });
      if (!statsResponse.ok) {
        const detail = (await statsResponse.text()).slice(0, 400);
        console.error("[AI stats] Supabase lookup failed", statsResponse.status, detail);
        throw new Error("Could not load recent IPL player statistics from Supabase (HTTP " + statsResponse.status + ").");
      }
      const rows = await statsResponse.json();
      if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid recent IPL statistics response.");
      statsRowsLoaded += rows.length;
      for (const row of rows) {
        const id = getText(row.player_id);
        const season = String(row.season);
        if (!playerById.has(id) || !["2024", "2025", "2026"].includes(season)) continue;
        if (!recentStatsByPlayer.has(id)) recentStatsByPlayer.set(id, new Map());
        const seasons = recentStatsByPlayer.get(id);
        if (!seasons.has(season)) seasons.set(season, {
          season: Number(season), matches: 0, battingInnings: [], bowlingInnings: []
        });
        const summary = seasons.get(season);
        summary.matches += 1;
        const asArray = (value) => {
          if (Array.isArray(value)) return value;
          if (value && typeof value === "object") return [value];
          return [];
        };
        summary.battingInnings.push(...asArray(row.batting_innings));
        summary.bowlingInnings.push(...asArray(row.bowling_innings));
      }
      if (rows.length < pageSize) break;
    }
  }

  if (statsRowsLoaded === 0 || recentStatsByPlayer.size === 0) {
    throw new Error("No recent IPL statistics matched the auction player IDs in Supabase. Check the player mapping before retrying; Gemini ranking was stopped to avoid unsupported rankings.");
  }

  console.log("[AI stats] Loaded recent IPL records", {
    matchRecords: statsRowsLoaded,
    matchedPlayers: recentStatsByPlayer.size,
    auctionPlayers: playerById.size
  });

  // Attach season-by-season evidence to both the selected XI and full squad.
  // Raw innings objects are retained so the model can use source field names
  // without us inventing or miscalculating cricket metrics.
  const sum = (items, key) => items.reduce((total, item) => {
    const value = Number(item?.[key]);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
  const average = (numerator, denominator) => denominator > 0
    ? Number((numerator / denominator).toFixed(2)) : null;
  const summarizeSeason = (season) => {
    const bat = season.battingInnings;
    const bowl = season.bowlingInnings;
    const runs = sum(bat, "runs");
    const balls = sum(bat, "balls_faced") + sum(bat, "balls");
    const fours = sum(bat, "fours");
    const sixes = sum(bat, "sixes");
    const dismissals = bat.filter((inning) => {
      if (typeof inning?.dismissed === "boolean") return inning.dismissed;
      const dismissal = getText(inning?.dismissal_kind ?? inning?.dismissal).toLowerCase();
      return Boolean(dismissal && !dismissal.includes("not out"));
    }).length;
    const wickets = sum(bowl, "wickets");
    const conceded = sum(bowl, "runs_conceded");
    const bowlingBalls = sum(bowl, "balls_bowled") + sum(bowl, "overs_balls");
    return {
      season: season.season,
      matches: season.matches,
      batting: {
        innings: bat.length, runs, balls, fours, sixes, dismissals,
        average: average(runs, dismissals),
        strikeRate: average(runs * 100, balls)
      },
      bowling: {
        innings: bowl.length, balls: bowlingBalls,
        overs: average(bowlingBalls, 6),
        runsConceded: conceded, wickets,
        maidens: sum(bowl, "maidens"),
        economy: average(conceded * 6, bowlingBalls),
        average: average(conceded, wickets),
        strikeRate: average(bowlingBalls, wickets)
      }
    };
  };
  const attachRecentStats = (player) => {
    if (!player || typeof player !== "object") return player;
    const seasons = recentStatsByPlayer.get(getText(player.id));
    return {
      ...player,
      recentIplStats: seasons
        ? [...seasons.values()].sort((a, b) => a.season - b.season).map(summarizeSeason)
        : { status: "no_mapped_recent_ipl_records" }
    };
  };
  for (const team of normalized) {
    team.submittedXI = team.submittedXI.map(attachRecentStats);
    team.fullSquad = team.fullSquad.map(attachRecentStats);
  }
  if (JSON.stringify(normalized).length > 850_000) {
    throw new Error("Recent IPL statistics made the analysis payload too large. Reduce the squad payload and retry.");
  }

  const prompt = usesSquadBalanceAnalysis
    ? `You are an expert IPL/T20 analyst and franchise squad strategist. This is a ${auctionType === "sprint5" ? "Sprint (5-player)" : "Classic (11-player)"} auction. Rank every franchise from 1 (strongest) to N (weakest), with one unique integer rank per franchise and no ties.

MODE RULES:
- Evaluate each franchise's COMPLETE purchased squad. Do not expect a submitted Playing XI or Impact Player; neither is used in Classic or Sprint.
- There is NO minimum squad-size requirement. Never disqualify, exclude, or penalize a franchise simply because it bought fewer players.
- Assess each squad as it stands. Compare wicketkeeping, batting roles, finishing, batting depth, all-rounders, pace, spin, death bowling, role flexibility, overseas/Indian balance, and depth relative to this format.
- Sprint has a compact 5-player squad cap: prioritize versatility and coverage across the small squad. Classic has an 11-player squad cap: assess balance across the full 11-player squad.
- Use the attached recentIplStats data for each player as the primary IPL evidence. It contains player-match records grouped by IPL season (2024, 2025, 2026), with per-season batting and bowling totals and rates calculated from the stored innings. Treat matches as player-match appearances; use the supplied runs, balls, boundaries, wickets, runs conceded, average, strike rate, and economy exactly as supplied. If a player has no_mapped_recent_ipl_records, treat recent IPL database coverage as unavailable for that player. Recent international T20/ODI evidence is a fallback only when recent IPL evidence is too limited. Never invent statistics or claim live research. Unknown data must remain uncertain.
- Ignore artificial catalogue ratings. Judge players by roles and reliable performance evidence.
- For EVERY franchise, explain why it earned its exact rank compared with the other teams. Include specific strengths, weaknesses/gaps, and the decisive reason it ranks above/below the nearest team.
- Return every franchise exactly once, with unique ranks 1..N.

Return ONLY valid JSON:
{"rankings":[{"franchiseId":"...","rank":1,"score":87,"summary":"Specific comparison-based explanation including strengths, weaknesses and decisive reason.","strengths":["..."],"risks":["..."]}]}

Auction room: ${roomId}
Franchises:
${JSON.stringify(normalized)}`
    : `You are an expert IPL/T20 analyst, cricket statistician, and franchise team strategist. Rank every franchise in this auction from 1 (strongest) to N (weakest), with exactly one unique integer rank per franchise and no ties.

PERFORMANCE EVIDENCE — IPL FIRST, LAST THREE YEARS ONLY (ESSENTIAL):
- Base each player's performance assessment primarily and strictly on IPL matches from the most recent three IPL seasons/years available. Do not use older IPL seasons, lifetime career totals, or general reputation to inflate or reduce a player's assessment.
- Use recent IPL performance as the default evidence for EVERY player, including international players. Do NOT combine IPL and international performances automatically.
- INTERNATIONAL PERFORMANCE IS A FALLBACK ONLY: if a player has too few IPL appearances in that three-year window to make a reasonably reliable assessment (use fewer than 5 IPL matches as the practical threshold), then use recent international performance as supporting/alternative evidence. Prefer recent T20Is first, then relevant recent ODI performances; use Tests only cautiously for skills that translate to T20 cricket. If the player has no meaningful recent IPL or international evidence, acknowledge uncertainty rather than inventing performance.
- For players with at least 5 IPL matches in the window, assess their recent IPL output and role-specific impact; do not let international performances override that IPL evidence. International data may be mentioned only as context, not as the basis of the rating.
- Judge recent IPL consistency, role-specific contribution, batting/bowling effectiveness, fielding where known, and performance under pressure where reliable evidence is available. Do not invent exact runs, wickets, averages, strike rates, economy rates, match counts, injuries, or results. Missing data is unknown, not zero.
- Use the attached recentIplStats data for each player as the primary evidence. It contains one record per player per match, grouped by IPL season (2024, 2025, 2026), with per-season totals and derived batting/bowling rates calculated from the stored innings. Matches are player-match appearances; batting/bowling innings are counted separately. Use the supplied runs, balls, fours, sixes, dismissals, wickets, runs conceded, bowling balls, average, strike rate, and economy exactly as supplied. Do not invent missing values or treat them as zero. If recentIplStats says no_mapped_recent_ipl_records, say recent IPL database coverage is unavailable for that player and use the existing international fallback rule only when justified. The attached database data, not general model memory, is the source of exact IPL figures.

RANKING METHOD — FOLLOW THIS ORDER:
1. First assess each submitted starting XI (11 starters) in the exact supplied array order. The array's first 11 players are slots 1–11; their `battingOrder`/array position is intentional and MUST NOT be rearranged or guessed. The first three are the selected openers group, slots 4–7 are middle-order/finishers, and slots 8–11 are finishers/bowlers. Respect the supplied order when discussing the lineup.
2. The two entries after the 11 starters are separate Impact Player options: `impactScenario: 'chasing'` is Impact Player (Chasing), and `impactScenario: 'defending'` is Impact Player (Defending). They may be the same player. Evaluate both as situational options, but do not count them as starting XI batting-order slots. The separate `impactPlayerChasing` and `impactPlayerDefending` fields repeat these choices for clarity.
3. Evaluate role fit and balance: opening pair skill/compatibility, top-order stability, middle-order strength, batting depth, finishers, wicketkeeping, pace, spin, death bowling, all-round options, and sufficient bowling choices. Consider recent IPL and international performance as described above. Do not automatically prefer a player merely because they are labelled an all-rounder; evaluate their actual batting and bowling value.
4. Compare the starting XIs directly. Give the main weight to the quality, recent form, role coverage, and balance of the 11 ordered starters plus the two situational Impact options. Explain meaningful advantages and weaknesses.
5. ONLY when two or more starting XIs are equally strong or almost equally strong, compare their backup players and then the overall squad. Assess backup quality by role, bench depth, replacements for weaknesses, injury/rotation cover, and whether the squad can maintain balance if a starter underperforms. Use the full squad as a tie-breaker, not as a reason to overlook a clearly stronger starting XI.
6. Produce a unique, defensible ranking for every franchise. Do not force artificial differences based on reputation when the teams are genuinely close; use the backup/squad tie-break process and explain the decisive factor. Do not invent player statistics.

EXPLANATION REQUIRED FOR EVERY FRANCHISE:
- Give a concise, franchise-specific overview explaining why it received that exact rank relative to the other teams.
- Include its main strengths, main weaknesses/risks, and the most important reason it ranks above the next team or below the team immediately above it.
- Mention whether its rank was primarily determined by its starting XI/Impact Player or, if the XIs were close, by backup quality and overall squad depth.
- Be specific to the players and roles in the supplied squad. Avoid generic praise, repetitive summaries, and unsupported statistical claims.

Return ONLY valid JSON in this exact shape:
{"rankings":[{"franchiseId":"...","rank":1,"score":87,"summary":"Concise explanation of why this team earned this rank, including its key strength, weakness, and decisive comparison.","strengths":["..."],"risks":["..."]}]}
Every input franchiseId must appear exactly once. Ranks must be a permutation of 1..N with no ties. Keep summaries concise but meaningful; strengths and risks must be specific to the supplied franchise squad.

Auction room: ${roomId}
Franchises:
${JSON.stringify(normalized)}`;

  try {
    // Gemini can temporarily return 503 during demand spikes. Retry transient failures,
    // then fall back to a widely supported Flash model instead of failing immediately.
    // Use the current stable Gemini Flash model. Do not fall back to retired Gemini 2.5 Flash.
    // Keep a lower-demand Flash-Lite fallback so a temporary 503 on the primary
    // model does not make the entire auction ranking fail.
    const models = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash"];
    let response = null;
    let activeModel = models[0];
    let lastDetail = "";
    for (const model of models) {
      activeModel = model;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(apiKey),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: "application/json",
                  // Structured output reduces missing IDs, duplicate ranks, and malformed JSON.
                  responseSchema: {
                    type: "OBJECT",
                    properties: {
                      rankings: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: {
                            franchiseId: { type: "STRING" },
                            rank: { type: "INTEGER" },
                            score: { type: "NUMBER" },
                            summary: { type: "STRING" },
                            strengths: { type: "ARRAY", items: { type: "STRING" } },
                            risks: { type: "ARRAY", items: { type: "STRING" } },
                          },
                          required: ["franchiseId", "rank", "score", "summary", "strengths", "risks"],
                        },
                      },
                    },
                    required: ["rankings"],
                  },
                  temperature: 0.1,
                  maxOutputTokens: 12000,
                },
              }),
            },
          );
        } catch (error) {
          lastDetail = getText(error?.message);
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
            continue;
          }
          response = null;
          break;
        }
        if (response.ok) break;
        lastDetail = await response.text();
        if (![429, 500, 502, 503, 504].includes(response.status)) break;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          continue;
        }
      }
      if (response?.ok) break;
      if (response && ![429, 500, 502, 503, 504, 404].includes(response.status)) break;
    }
    if (!response) {
      throw new Error("Gemini is temporarily unavailable. Please retry the analysis in a moment.");
    }

    if (!response.ok) {
      // The response body was already consumed in the retry loop; reuse its saved text.
      const detail = lastDetail;
      console.error("Gemini ranking request failed", response.status, detail.slice(0, 1000));
      let providerMessage = "";
      try {
        providerMessage = getText(JSON.parse(detail)?.error?.message).slice(0, 300);
      } catch {
        providerMessage = "";
      }
      let message;
      if (response.status === 401 || response.status === 403) {
        message = `Gemini rejected the server API key or its permissions (HTTP ${response.status}). Check GEMINI_API_KEY and Generative Language API access in Render/Google AI Studio.`;
      } else if (response.status === 429) {
        message = "Gemini quota or rate limit reached (HTTP 429). Check the API quota/billing and retry after it resets.";
      } else if (response.status === 404) {
        message = "The configured Gemini model/API endpoint was not found (HTTP 404). Check model availability for this API key.";
      } else if (response.status === 400) {
        message = `Gemini rejected the analysis request (HTTP 400)${providerMessage ? `: ${providerMessage}` : "."}`;
      } else {
        message = `Gemini analysis request failed (HTTP ${response.status})${providerMessage ? `: ${providerMessage}` : ". Check the server logs and API configuration."}`;
      }
      const error = { error: message };
      if (res?.status) return res.status(502).json(error);
      return json(502, error);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    const expectedIds = normalized.map((team) => team.franchiseId);
    const validateRankings = (items) => {
      const rows = Array.isArray(items) ? items : [];
      const validIds = rows.length === expectedIds.length &&
        new Set(rows.map((item) => item.franchiseId)).size === expectedIds.length &&
        expectedIds.every((id) => rows.some((item) => item.franchiseId === id));
      const validRanks = rows.every((item) =>
        Number.isInteger(item.rank) && item.rank >= 1 && item.rank <= expectedIds.length
      ) && new Set(rows.map((item) => item.rank)).size === expectedIds.length;
      return { rows, valid: validIds && validRanks };
    };

    let validation = validateRankings(parsed.rankings);
    let received = validation.rows;

    // Gemini sometimes omits one franchise even with a JSON response schema.
    // Ask the same model to repair the complete ranking once, explicitly listing
    // every required franchise ID. Never invent a missing team's rank locally.
    if (!validation.valid) {
      const missingIds = expectedIds.filter((id) => !received.some((item) => item?.franchiseId === id));
      console.warn("Gemini omitted or mis-ranked franchises; requesting one complete correction", {
        expectedFranchiseIds: expectedIds,
        receivedFranchiseIds: received.map((item) => getText(item?.franchiseId)),
        missingFranchiseIds: missingIds,
      });

      const correctionPrompt = `${prompt}

CORRECTION REQUIRED: Your previous answer was incomplete or invalid. Return a COMPLETE replacement JSON object, not a partial patch.
You must include every franchise exactly once. Required franchise IDs, copied exactly:
${JSON.stringify(expectedIds)}
The previous response omitted or incorrectly ranked these IDs:
${JSON.stringify(missingIds)}
There must be exactly ${expectedIds.length} ranking objects and ranks must be the unique integers 1 through ${expectedIds.length}. Re-evaluate all franchises using the supplied squad data. Do not omit SRH or any other franchise. Return only the required JSON object.`;

      const correctionResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + activeModel + ":generateContent?key=" + encodeURIComponent(apiKey),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: correctionPrompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  rankings: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        franchiseId: { type: "STRING" },
                        rank: { type: "INTEGER" },
                        score: { type: "NUMBER" },
                        summary: { type: "STRING" },
                        strengths: { type: "ARRAY", items: { type: "STRING" } },
                        risks: { type: "ARRAY", items: { type: "STRING" } },
                      },
                      required: ["franchiseId", "rank", "score", "summary", "strengths", "risks"],
                    },
                  },
                },
                required: ["rankings"],
              },
              temperature: 0.1,
              maxOutputTokens: 12000,
            },
          }),
        },
      );

      if (correctionResponse.ok) {
        const correctionData = await correctionResponse.json();
        const correctionText = correctionData?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
        try {
          const corrected = JSON.parse(correctionText);
          validation = validateRankings(corrected.rankings);
          received = validation.rows;
        } catch {
          console.error("Gemini correction response was not valid JSON");
        }
      } else {
        const correctionDetail = await correctionResponse.text();
        console.error("Gemini ranking correction request failed", correctionResponse.status, correctionDetail.slice(0, 800));
      }
    }

    if (!validation.valid) {
      console.error("Gemini ranking validation failed after correction attempt", {
        expectedFranchiseIds: expectedIds,
        receivedFranchiseIds: received.map((item) => getText(item?.franchiseId)),
        expectedCount: expectedIds.length,
        receivedCount: received.length,
        receivedRanks: received.map((item) => item?.rank),
      });
      throw new Error("AI response failed ranking validation after automatic correction");
    }

    const rankings = received
      .map((item) => ({
        franchiseId: item.franchiseId,
        rank: item.rank,
        score: Number.isFinite(Number(item.score)) ? Math.max(0, Math.min(100, Number(item.score))) : null,
        summary: getText(item.summary).slice(0, 1200),
        strengths: Array.isArray(item.strengths) ? item.strengths.slice(0, 6).map(getText).filter(Boolean) : [],
        risks: Array.isArray(item.risks) ? item.risks.slice(0, 6).map(getText).filter(Boolean) : [],
      }))
      .sort((a, b) => a.rank - b.rank);

    const result = { roomId, rankings, model: activeModel };
    if (res?.status) return res.status(200).json(result);
    return json(200, result);
  } catch (error) {
    const rawMessage = getText(error?.message);
    try { await recordGuardianError({ operation: 'ai_analysis', severity: 'high', message: rawMessage || 'AI analysis failed', roomId, source: 'server', fingerprint: 'ai-analysis-failed' }); }
    catch (guardianError) { console.warn('[Guardian] Could not record AI analysis failure:', guardianError?.message || guardianError); }
    console.error("Winner analysis error", error?.stack || rawMessage || error);

    // Return a safe, actionable diagnostic instead of hiding every failure behind
    // the same message. Never include the API key or request URL in the response.
    let message = "AI analysis failed while processing the model response. Please retry.";
    if (rawMessage === "AI returned invalid JSON") {
      message = "Gemini responded, but its answer was not valid JSON. Retry the analysis.";
    } else if (rawMessage === "AI response failed ranking validation") {
      message = "Gemini responded, but the rankings were incomplete or invalid. Retry the analysis.";
    } else if (/fetch failed|network|socket|ECONN|ETIMEDOUT|ENOTFOUND/i.test(rawMessage)) {
      message = "The server could not connect to Gemini. Check Render server logs and outbound API connectivity.";
    } else if (rawMessage) {
      message = `AI analysis processing error: ${rawMessage.slice(0, 240)}`;
    }
    const result = { error: message };
    if (res?.status) return res.status(502).json(result);
    return json(502, result);
  }
}
