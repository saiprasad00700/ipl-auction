import test from "node:test";
import assert from "node:assert/strict";
import { canChangeFranchise } from "../teamAssignmentRules.js";

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
