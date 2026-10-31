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
  if (!roomId || franchises.length < 2 || franchises.length > 20) {
    const error = { error: "Provide a roomId and between 2 and 20 franchises." };
    if (res?.status) return res.status(400).json(error);
    return json(400, error);
  }

  // Bound payload size and normalize untrusted client data before sending to AI.
  const normalized = franchises.map((team, index) => ({
    franchiseId: getText(team?.franchiseId) || `franchise-${index + 1}`,
    franchiseName: getText(team?.franchiseName) || `Franchise ${index + 1}`,
    submittedXI: Array.isArray(team?.submittedXI) ? team.submittedXI.slice(0, 12) : [],
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

  const prompt = `You are an expert IPL/T20 analyst, cricket statistician, and franchise team strategist. Rank every franchise in this auction from 1 (strongest) to N (weakest), with exactly one unique integer rank per franchise and no ties.

PERFORMANCE EVIDENCE — IPL FIRST, LAST THREE YEARS ONLY (ESSENTIAL):
- Base each player's performance assessment primarily and strictly on IPL matches from the most recent three IPL seasons/years available. Do not use older IPL seasons, lifetime career totals, or general reputation to inflate or reduce a player's assessment.
- Use recent IPL performance as the default evidence for EVERY player, including international players. Do NOT combine IPL and international performances automatically.
- INTERNATIONAL PERFORMANCE IS A FALLBACK ONLY: if a player has too few IPL appearances in that three-year window to make a reasonably reliable assessment (use fewer than 5 IPL matches as the practical threshold), then use recent international performance as supporting/alternative evidence. Prefer recent T20Is first, then relevant recent ODI performances; use Tests only cautiously for skills that translate to T20 cricket. If the player has no meaningful recent IPL or international evidence, acknowledge uncertainty rather than inventing performance.
- For players with at least 5 IPL matches in the window, assess their recent IPL output and role-specific impact; do not let international performances override that IPL evidence. International data may be mentioned only as context, not as the basis of the rating.
- Judge recent IPL consistency, role-specific contribution, batting/bowling effectiveness, fielding where known, and performance under pressure where reliable evidence is available. Do not invent exact runs, wickets, averages, strike rates, economy rates, match counts, injuries, or results. Missing data is unknown, not zero.
- Do not claim you browsed live statistics or cite specific matches/seasons unless you can support those details. If recent statistics are not included in the input and are not reliably known, be transparent about uncertainty; do not pretend to have looked up live data.

RANKING METHOD — FOLLOW THIS ORDER:
1. First assess each submitted starting XI (11 starters) and its Impact Player as the primary basis. Evaluate role fit and balance: opening pair skill/compatibility, top-order stability, middle-order strength, batting depth, finishers, wicketkeeping, pace, spin, death bowling, all-round options, and sufficient bowling choices. Consider recent IPL and international performance as described above. Do not automatically prefer a player merely because they are labelled an all-rounder; evaluate their actual batting and bowling value.
2. Compare the starting XIs directly. Give the main weight to the quality, recent form, role coverage, and balance of these 12 selected players. Explain meaningful advantages and weaknesses.
3. ONLY when two or more starting XIs are equally strong or almost equally strong, compare their backup players and then the overall squad. Assess backup quality by role, bench depth, replacements for weaknesses, injury/rotation cover, and whether the squad can maintain balance if a starter underperforms. Use the full squad as a tie-breaker, not as a reason to overlook a clearly stronger starting XI.
4. Produce a unique, defensible ranking for every franchise. Do not force artificial differences based on reputation when the teams are genuinely close; use the backup/squad tie-break process and explain the decisive factor. Do not invent player statistics.

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
    const models = ["gemini-3.8-flash"];
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

    const received = Array.isArray(parsed.rankings) ? parsed.rankings : [];
    const expectedIds = normalized.map((team) => team.franchiseId);
    const validIds = received.length === expectedIds.length &&
      new Set(received.map((item) => item.franchiseId)).size === expectedIds.length &&
      expectedIds.every((id) => received.some((item) => item.franchiseId === id));
    const validRanks = received.every((item) =>
      Number.isInteger(item.rank) && item.rank >= 1 && item.rank <= expectedIds.length
    ) && new Set(received.map((item) => item.rank)).size === expectedIds.length;

    if (!validIds || !validRanks) {
      throw new Error("AI response failed ranking validation");
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
