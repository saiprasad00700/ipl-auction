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
