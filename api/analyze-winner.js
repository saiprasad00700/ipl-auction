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

  const prompt = `You are an expert IPL/T20 team strategist. Rank every franchise in this auction from 1 (strongest) to N (weakest), with exactly one unique integer rank per franchise and no ties.

Evaluate the submitted 11-player starting XI plus one Impact Player (12 considered players). Assess opening pair skill and compatibility, top-order stability, middle-order strength, batting depth, finishers, pace attack, spin attack, all-rounders, wicketkeeping, role coverage, Indian/overseas balance where relevant, and overall T20 suitability. Do not automatically prefer a player just because they are labelled an all-rounder. Use supplied statistics when present; missing statistics are unknown, not zero. If XIs appear similarly strong, compare the entire squads and quality/depth of backups as the tiebreaker. A franchise marked autoSelected had its XI selected from its squad due to missing submission; analyze that XI normally.

Return ONLY valid JSON in this exact shape:
{"rankings":[{"franchiseId":"...","rank":1,"score":87,"summary":"...","strengths":["..."],"risks":["..."]}]}
Every input franchiseId must appear exactly once. Ranks must be a permutation of 1..N with no ties. Do not invent player statistics. Keep summaries concise.

Auction room: ${roomId}
Franchises:
${JSON.stringify(normalized)}`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini ranking request failed", response.status, detail.slice(0, 1000));
      const error = { error: "AI ranking service failed. Please retry the analysis." };
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

    const result = { roomId, rankings, model: "gemini-2.5-flash" };
    if (res?.status) return res.status(200).json(result);
    return json(200, result);
  } catch (error) {
    console.error("Winner analysis error", error);
    const result = { error: "Could not produce a valid ranking. Please retry." };
    if (res?.status) return res.status(502).json(result);
    return json(502, result);
  }
}
