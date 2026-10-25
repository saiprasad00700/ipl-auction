import test from "node:test";
import assert from "node:assert/strict";
import { applySaleToTeam, canAffordRtmMatch } from "../saleSettlementHelpers.js";

const makeTeam = (overrides = {}) => ({
  budgetRemaining: 100,
  spent: 20,
  retentionCardsRemaining: 2,
  squad: [{ id: "p_old", bid: 5 }],
  ...overrides
});

test("sale settlement deducts purse and adds player once", () => {
  const settled = applySaleToTeam(makeTeam(), "p_new", 10, false);
  assert.equal(settled.budgetRemaining, 90);
  assert.equal(settled.spent, 30);
  assert.equal(settled.squad.length, 2);
  assert.deepEqual(settled.squad[1], { id: "p_new", bid: 10 });
  assert.equal(settled.retentionCardsRemaining, 2);
});

test("RTM settlement consumes exactly one retention card", () => {
  const settled = applySaleToTeam(makeTeam({ spent: 0, squad: [] }), "p_new", 10, true);
  assert.equal(settled.retentionCardsRemaining, 1);
  assert.equal(settled.budgetRemaining, 90);
});

test("duplicate player settlement is idempotent and does not deduct twice", () => {
  const team = makeTeam({
    budgetRemaining: 90,
    spent: 10,
    retentionCardsRemaining: 1,
    squad: [{ id: "p_new", bid: 10 }]
  });
  assert.equal(applySaleToTeam(team, "p_new", 10, true), team);
});

test("invalid, negative, or unaffordable prices are rejected", () => {
  const team = makeTeam({ budgetRemaining: 5, spent: 0, squad: [] });
  assert.equal(applySaleToTeam(team, "p_new", 10, false), null);
  assert.equal(applySaleToTeam(team, "p_new", -1, false), null);
  assert.equal(applySaleToTeam(team, "p_new", Number.NaN, false), null);
  assert.equal(applySaleToTeam(team, "p_new", Number.POSITIVE_INFINITY, false), null);
});

test("RTM settlement is rejected when no retention card remains", () => {
  const team = makeTeam({ retentionCardsRemaining: 0, squad: [] });
  assert.equal(applySaleToTeam(team, "p_new", 10, true), null);
});

test("money is rounded to two decimal places without floating-point drift", () => {
  const team = makeTeam({ budgetRemaining: 1, spent: 0, squad: [] });
  const settled = applySaleToTeam(team, "p_new", 0.3, false);
  assert.equal(settled.budgetRemaining, 0.7);
  assert.equal(settled.spent, 0.3);
  assert.equal(settled.squad[0].bid, 0.3);
});

test("malformed team purse, spent amount, and squad data are rejected", () => {
  assert.equal(applySaleToTeam(makeTeam({ budgetRemaining: "not-money" }), "p_new", 1), null);
  assert.equal(applySaleToTeam(makeTeam({ spent: -1 }), "p_new", 1), null);
  assert.equal(applySaleToTeam({ budgetRemaining: 10, spent: 0 }, "p_new", 1), null);
});

test("RTM match is allowed only when the original franchise can afford the counter-price", () => {
  assert.equal(canAffordRtmMatch({ budgetRemaining: 15 }, 15), true);
  assert.equal(canAffordRtmMatch({ budgetRemaining: 14.5 }, 15), false);
  assert.equal(canAffordRtmMatch({ budgetRemaining: 0 }, 0.5), false);
  assert.equal(canAffordRtmMatch({ budgetRemaining: "invalid" }, 1), false);
  assert.equal(canAffordRtmMatch(null, 1), false);
});
