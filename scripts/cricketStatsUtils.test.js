import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScorecard } from "../scripts/cricketStatsUtils.js";

test("maps nested CricAPI batting and bowling names to auction player IDs", () => {
  const players = [{ id: "p1", name: "Virat Kohli" }, { id: "p2", name: "Jasprit Bumrah" }];
  const scorecard = { scorecard: [{ batting: [{ batsman: { name: "Virat Kohli" }, r: "45", b: "30", "4s": "4", "6s": "2", sr: "150.00" }], bowling: [{ bowler: { name: "Jasprit Bumrah" }, o: "4", m: "0", r: "22", w: "2", eco: "5.50" }] }] };
  const rows = normalizeScorecard(scorecard, { id: "m1", name: "RCB vs MI" }, 2026, players);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.player_id === "p1").batting_innings[0].runs, 45);
  assert.equal(rows.find((row) => row.player_id === "p2").bowling_innings[0].wickets, 2);
});


test("preserves CricAPI dismissal text and converts cricket overs to balls", () => {
  const players = [{ id: "p1", name: "Sanju Samson" }, { id: "p2", name: "Jamie Overton" }];
  const scorecard = { scorecard: [{
    batting: [{ batsman: { name: "Sanju Samson" }, r: 115, b: 56, "dismissal-text": "not out" }],
    bowling: [{ bowler: { name: "Jamie Overton" }, o: "3.5", m: 0, r: 18, w: 4, eco: 4.5 }]
  }] };
  const rows = normalizeScorecard(scorecard, { id: "m2", name: "CSK vs DC" }, 2026, players);
  assert.equal(rows.find((row) => row.player_id === "p1").batting_innings[0].dismissal, "not out");
  const bowling = rows.find((row) => row.player_id === "p2").bowling_innings[0];
  assert.equal(bowling.overs, "3.5");
  assert.equal(bowling.overs_balls, 23);
});
