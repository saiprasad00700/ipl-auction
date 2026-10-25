import test from "node:test";
import assert from "node:assert/strict";
import {
  canChangeFranchise,
  isFranchiseAvailable,
  hasPurchasedPlayers,
  buildTeamAssignmentRecord
} from "../teamAssignmentRules.js";

test("franchise selection is allowed in waiting and lobby states", () => {
  assert.equal(canChangeFranchise("waiting"), true);
  assert.equal(canChangeFranchise("lobby"), true);
});

test("legacy rooms without an explicit status remain joinable before auction", () => {
  assert.equal(canChangeFranchise(undefined), true);
  assert.equal(canChangeFranchise(null), true);
  assert.equal(canChangeFranchise(""), true);
});

test("franchise selection is blocked after auction starts or ends", () => {
  for (const status of ["active", "paused", "awaiting_xi", "analyzing", "completed"]) {
    assert.equal(canChangeFranchise(status), false, status);
  }
});

test("a franchise cannot be selected by two different managers", () => {
  const players = [{ id: "u1", team: "CSK" }, { id: "u2", team: "MI" }];
  assert.equal(isFranchiseAvailable(players, "u1", "CSK"), true);
  assert.equal(isFranchiseAvailable(players, "u2", "CSK"), false);
  assert.equal(isFranchiseAvailable(players, "u2", "RCB"), true);
});

test("a franchise can be reselected by its current manager", () => {
  assert.equal(isFranchiseAvailable([{ id: "u1", team: "CSK" }], "u1", "CSK"), true);
});

test("purchased players or spending locks a manager's franchise", () => {
  assert.equal(hasPurchasedPlayers({ spent: 0, squad: [] }), false);
  assert.equal(hasPurchasedPlayers({ spent: 0.5, squad: [] }), true);
  assert.equal(hasPurchasedPlayers({ spent: 0, squad: ["p_1"] }), true);
});

test("team assignment preserves valid purse and squad data while sanitizing invalid fields", () => {
  const built = buildTeamAssignmentRecord(
    { budgetRemaining: 90, spent: 10, squad: ["p_1"], retentionCardsRemaining: 1 },
    "room1", "u1", "MI", "Mumbai Indians", 120
  );
  assert.equal(built.budgetRemaining, 90);
  assert.equal(built.spent, 10);
  assert.deepEqual(built.squad, ["p_1"]);
  assert.equal(built.retentionCardsRemaining, 1);
  assert.equal(built.teamId, "MI");
  const safe = buildTeamAssignmentRecord(
    { budgetRemaining: -10, spent: "NaN", squad: "bad", retentionCardsRemaining: 99 },
    "room1", "u2", "CSK", "Chennai Super Kings", 120
  );
  assert.equal(safe.budgetRemaining, 120);
  assert.equal(safe.spent, 0);
  assert.deepEqual(safe.squad, []);
  assert.equal(safe.retentionCardsRemaining, 2);
});
