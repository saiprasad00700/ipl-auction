import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEndAuctionTeams, MIN_MEGA_SQUAD_SIZE } from "../auctionEndRules.js";

const squad = (count) => Array.from({ length: count }, (_, i) => ({ id: `p_${i}` }));

test("Mega mode disqualifies franchise squads below 18 and preserves eligible squads", () => {
  const input = {
    csk: { teamId: "CSK", teamName: "Chennai", squad: squad(17) },
    mi: { teamId: "MI", teamName: "Mumbai", squad: squad(18) },
    none: { teamId: "NONE", squad: [] }
  };
  const result = evaluateEndAuctionTeams(input, "mega");
  assert.equal(MIN_MEGA_SQUAD_SIZE, 18);
  assert.equal(result.teams.csk.disqualified, true);
  assert.match(result.teams.csk.disqualificationReason, /17 players bought/);
  assert.equal(result.teams.mi.disqualified, false);
  assert.equal(result.teams.mi.squadCountAtEnd, 18);
  assert.equal(result.teams.none, input.none);
  assert.deepEqual(result.disqualifiedNames, ["Chennai (17/18)"]);
});

test("Mega mode accepts exactly 18 and reports empty franchise squads", () => {
  const result = evaluateEndAuctionTeams({
    exactly: { teamId: "GT", squad: squad(18) },
    empty: { teamId: "RR", teamName: "Rajasthan", squad: [] }
  }, "mega");
  assert.equal(result.teams.exactly.disqualified, false);
  assert.equal(result.teams.empty.disqualified, true);
  assert.deepEqual(result.disqualifiedNames, ["Rajasthan (0/18)"]);
});

test("Sprint modes do not apply the Mega minimum-squad rule", () => {
  for (const mode of ["sprint11", "sprint5"]) {
    const result = evaluateEndAuctionTeams({
      team: { teamId: "RCB", squad: squad(5), disqualified: true }
    }, mode);
    assert.equal(result.minimumApplies, false);
    assert.equal(result.teams.team.disqualified, false);
    assert.equal(result.teams.team.disqualificationReason, null);
    assert.equal(result.disqualifiedNames.length, 0);
  }
});

test("missing or malformed squad data is safely treated as zero players", () => {
  const result = evaluateEndAuctionTeams({
    missing: { teamId: "KKR" },
    malformed: { teamId: "DC", squad: "not-an-array" }
  }, "mega");
  assert.equal(result.teams.missing.squadCountAtEnd, 0);
  assert.equal(result.teams.malformed.disqualified, true);
  assert.equal(result.disqualifiedNames.length, 2);
});

test("non-franchise entries are not changed", () => {
  const botless = { userId: "manager", teamId: "NONE", squad: [] };
  const result = evaluateEndAuctionTeams({ manager: botless }, "mega");
  assert.equal(result.teams.manager, botless);
});
