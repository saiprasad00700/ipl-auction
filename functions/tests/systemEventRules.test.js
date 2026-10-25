import test from "node:test";
import assert from "node:assert/strict";
import { systemEventReceiptKey } from "../systemEventRules.js";

test("one-shot lifecycle announcements have stable idempotency keys", () => {
  for (const event of ["auction_started", "bidding_ended", "auction_ended", "auction_completed"]) {
    assert.equal(systemEventReceiptKey(event, { lastActivityAt: 10 }), systemEventReceiptKey(event, { lastActivityAt: 99 }));
  }
});

test("sale and RTM announcements are unique to a specific lot transition", () => {
  const first = { playerId: "p_100", timerEndsAt: 1000, status: "sold" };
  assert.equal(systemEventReceiptKey("sale_result", {}, first), systemEventReceiptKey("sale_result", {}, first));
  assert.notEqual(systemEventReceiptKey("sale_result", {}, first), systemEventReceiptKey("sale_result", {}, { ...first, timerEndsAt: 2000 }));
  assert.notEqual(systemEventReceiptKey("rtm_result", {}, first), systemEventReceiptKey("sale_result", {}, first));
});

test("each manager can have their own Playing XI announcement", () => {
  assert.notEqual(
    systemEventReceiptKey("xi_submitted", {}, {}, "manager_a"),
    systemEventReceiptKey("xi_submitted", {}, {}, "manager_b")
  );
});

test("unsafe database key characters are normalized", () => {
  assert.equal(systemEventReceiptKey("sale_result", {}, { playerId: "a/b.#$[]", timerEndsAt: 1 }).includes("/"), false);
});


import { canPostSystemEvent } from "../systemEventRules.js";

const roomFixture = (overrides = {}) => ({
  hostId: "host",
  status: "active",
  players: [{ id: "host" }, { id: "manager" }],
  ...overrides
});

test("only the host can post lifecycle, sale, RTM, and removal events", () => {
  for (const event of ["auction_started", "bidding_ended", "auction_paused", "auction_resumed", "auction_ended", "auction_completed", "sale_result", "rtm_result", "player_removed"]) {
    assert.equal(canPostSystemEvent({ event, uid: "manager", room: roomFixture({ status: event === "bidding_ended" ? "awaiting_xi" : event === "auction_completed" ? "completed" : "active" }) }), false, event);
  }
  assert.equal(canPostSystemEvent({ event: "sale_result", uid: "host", room: roomFixture() }), true);
});

test("Playing XI announcement is limited to the submitting manager with a saved XI", () => {
  const room = roomFixture();
  assert.equal(canPostSystemEvent({ event: "xi_submitted", uid: "manager", room, hasSavedXI: false }), false);
  assert.equal(canPostSystemEvent({ event: "xi_submitted", uid: "manager", room, hasSavedXI: true }), true);
  assert.equal(canPostSystemEvent({ event: "xi_submitted", uid: "host", room, hasSavedXI: true }), true);
});

test("system events reject non-members, banned members, and premature results", () => {
  const room = roomFixture();
  assert.equal(canPostSystemEvent({ event: "xi_submitted", uid: "outsider", room, hasSavedXI: true }), false);
  assert.equal(canPostSystemEvent({ event: "xi_submitted", uid: "manager", room: roomFixture({ bannedPlayers: ["manager"] }), hasSavedXI: true }), false);
  assert.equal(canPostSystemEvent({ event: "auction_completed", uid: "host", room: roomFixture({ status: "analyzing" }) }), false);
  assert.equal(canPostSystemEvent({ event: "auction_completed", uid: "host", room: roomFixture({ status: "completed" }) }), true);
});
