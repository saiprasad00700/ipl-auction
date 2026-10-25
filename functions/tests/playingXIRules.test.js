import test from "node:test";
import assert from "node:assert/strict";
import { validatePlayingXIComposition } from "../playingXIRules.js";

const validCatalog = {
  wk: { role: "Wicket-Keeper" },
  bat1: { role: "Batsman" },
  bat2: { role: "Batsman" },
  bat3: { role: "Batsman" },
  bat4: { role: "Batsman" },
  ar1: { role: "All-Rounder" },
  ar2: { role: "All-Rounder" },
  bowl1: { role: "Bowler" },
  bowl2: { role: "Bowler" },
  bowl3: { role: "Bowler" },
  bowl4: { role: "Bowler" }
};
const validXI = Object.keys(validCatalog);

test("accepts XI with at least two all-rounders and five bowling options", () => {
  assert.deepEqual(validatePlayingXIComposition(validXI, validCatalog), { valid: true, reason: null });
});

test("rejects XI with fewer than two all-rounders", () => {
  const catalog = { ...validCatalog, ar2: { role: "Batsman" }, bowl4: { role: "Bowler" } };
  assert.match(validatePlayingXIComposition(validXI, catalog).reason, /two all-rounders/i);
});

test("rejects XI with fewer than five bowling options including all-rounders", () => {
  const catalog = { ...validCatalog, bowl3: { role: "Batsman" }, bowl4: { role: "Batsman" } };
  assert.match(validatePlayingXIComposition(validXI, catalog).reason, /five bowling options/i);
});

test("rejects anything other than eleven starters", () => {
  assert.equal(validatePlayingXIComposition(validXI.slice(0, 10), validCatalog).valid, false);
});
