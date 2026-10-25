import test from "node:test";
import assert from "node:assert/strict";
import {
  BID_INCREMENT_CRORE,
  DEFAULT_BID_TIMER_SECONDS,
  nextBidAmount,
  clampBidTimerSeconds,
  effectiveOverseasLimit,
  transitionBiddingTimer
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

test("pausing preserves remaining time and records pause timestamp", () => {
  const result = transitionBiddingTimer({ status: "bidding", timerEndsAt: 12500 }, "pause", 15, 10000);
  assert.equal(result.ok, true);
  assert.equal(result.live.status, "paused");
  assert.equal(result.live.pausedRemainingMs, 2500);
  assert.equal(result.live.pausedAt, 10000);
});

test("resuming restores the saved time instead of resetting the full timer", () => {
  const result = transitionBiddingTimer({ status: "paused", pausedRemainingMs: 2200, pausedAt: 10000 }, "resume", 15, 20000);
  assert.equal(result.ok, true);
  assert.equal(result.live.status, "bidding");
  assert.equal(result.live.timerEndsAt, 22200);
  assert.equal(result.live.pausedRemainingMs, null);
  assert.equal(result.live.pausedAt, null);
});

test("invalid timer transitions are rejected and fallback resume never has zero time", () => {
  assert.equal(transitionBiddingTimer({ status: "paused" }, "pause", 15, 1).ok, false);
  assert.equal(transitionBiddingTimer({ status: "bidding" }, "resume", 15, 1).ok, false);
  const resumed = transitionBiddingTimer({ status: "paused", pausedRemainingMs: 0 }, "resume", 15, 100);
  assert.equal(resumed.live.timerEndsAt, 15100);
  assert.equal(transitionBiddingTimer(null, "pause", 15, 1).ok, false);
});
