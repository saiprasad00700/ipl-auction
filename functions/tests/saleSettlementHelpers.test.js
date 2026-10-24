import test from "node:test";
import assert from "node:assert/strict";
import { applySaleToTeam } from "../saleSettlementHelpers.js";

test("sale settlement deducts purse and adds player once", () => {
  const team = { budgetRemaining: 100, spent: 20, retentionCardsRemaining: 2, squad: [{ id: "p_old", bid: 5 }] };
  const settled = applySaleToTeam(team, "p_new", 10, false);
  assert.equal(settled.budgetRemaining, 90);
  assert.equal(settled.spent, 30);
  assert.equal(settled.squad.length, 2);
  assert.equal(settled.squad[1].id, "p_new");
  assert.equal(settled.retentionCardsRemaining, 2);
});

test("RTM settlement consumes exactly one retention card", () => {
  const team = { budgetRemaining: 100, spent: 0, retentionCardsRemaining: 2, squad: [] };
  const settled = applySaleToTeam(team, "p_new", 10, true);
  assert.equal(settled.retentionCardsRemaining, 1);
});

test("duplicate player settlement is idempotent", () => {
  const team = { budgetRemaining: 90, spent: 10, retentionCardsRemaining: 1, squad: [{ id: "p_new", bid: 10 }] };
  assert.equal(applySaleToTeam(team, "p_new", 10, true), team);
});

test("invalid or unaffordable prices are rejected", () => {
  const team = { budgetRemaining: 5, spent: 0, retentionCardsRemaining: 2, squad: [] };
  assert.equal(applySaleToTeam(team, "p_new", 10, false), null);
  assert.equal(applySaleToTeam(team, "p_new", -1, false), null);
  assert.equal(applySaleToTeam(team, "p_new", Number.NaN, false), null);
});
