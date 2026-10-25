import test from "node:test";
import assert from "node:assert/strict";
import {
  BID_INCREMENT_CRORE,
  DEFAULT_BID_TIMER_SECONDS,
  nextBidAmount,
  clampBidTimerSeconds,
  effectiveOverseasLimit
} from "../auctionRules.js";

test("backend bid amount starts at base price and then increases by fifty lakh", () => {
  assert.equal(nextBidAmount(0, 2), 2);
  assert.equal(nextBidAmount(3, 0.3), 3.5);
  assert.equal(nextBidAmount(4.9, 0.3), 5.4);
  assert.equal(nextBidAmount(0.3, 0.3), 0.8);
  assert.equal(BID_INCREMENT_CRORE, 0.5);
});

test("bid timer defaults to 15 seconds and clamps to supported range", () => {
  assert.equal(DEFAULT_BID_TIMER_SECONDS, 15);
  assert.equal(clampBidTimerSeconds(undefined), 15);
  assert.equal(clampBidTimerSeconds(5), 5);
  assert.equal(clampBidTimerSeconds(60), 15);
  assert.equal(clampBidTimerSeconds(1), 3);
  assert.equal(clampBidTimerSeconds("invalid", 10), 10);
});

test("overseas limit honors mode maximum and prevents legacy settings exceeding four", () => {
  assert.equal(effectiveOverseasLimit({ auctionType: "mega", overseasLimit: 8 }), 4);
  assert.equal(effectiveOverseasLimit({ auctionType: "sprint5", overseasLimit: 4 }), 2);
  assert.equal(effectiveOverseasLimit({ auctionType: "sprint5" }), 2);
  assert.equal(effectiveOverseasLimit({ settings: { auctionType: "mega", overseasLimit: 3 } }), 3);
  assert.equal(effectiveOverseasLimit({}), 4);
});
