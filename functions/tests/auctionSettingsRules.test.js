import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAuctionSettings } from "../auctionSettingsRules.js";

test("accepts supported timer settings and valid custom Mega budget", () => {
  assert.deepEqual(normalizeAuctionSettings({ bidTimer: 5, budget: 150 }, "mega"), {
    valid: true, settings: { bidTimer: 5, budget: 150 }, modeChanged: false
  });
});

test("accepts slider timer values from 3 to 15 and rejects out-of-range values", () => {
  assert.equal(normalizeAuctionSettings({ bidTimer: 4 }).valid, true);
  assert.equal(normalizeAuctionSettings({ bidTimer: 2 }).valid, false);
  assert.equal(normalizeAuctionSettings({ bidTimer: 16 }).valid, false);
  assert.equal(normalizeAuctionSettings({ budget: -1 }).valid, false);
  assert.equal(normalizeAuctionSettings({ budget: 1001 }).valid, false);
});

test("switching auction mode always applies consistent mode defaults", () => {
  assert.deepEqual(normalizeAuctionSettings({
    auctionType: "sprint5", budget: 120, squadLimit: 25, overseasLimit: 4
  }, "mega"), {
    valid: true,
    settings: { auctionType: "sprint5", budget: 60, squadLimit: 5, overseasLimit: 2 },
    modeChanged: true
  });
  assert.deepEqual(normalizeAuctionSettings({ auctionType: "sprint11" }, "mega"), {
    valid: true,
    settings: { auctionType: "sprint11", budget: 90, squadLimit: 11, overseasLimit: 4 },
    modeChanged: true
  });
});

test("enforces fixed squad sizes and mode-specific overseas caps", () => {
  assert.equal(normalizeAuctionSettings({ squadLimit: 20 }, "mega").valid, false);
  assert.equal(normalizeAuctionSettings({ squadLimit: 25 }, "sprint5").valid, false);
  assert.equal(normalizeAuctionSettings({ overseasLimit: 3 }, "sprint5").valid, false);
  assert.equal(normalizeAuctionSettings({ overseasLimit: 4 }, "mega").valid, true);
});

test("rejects invalid modes and unknown-only payloads", () => {
  assert.equal(normalizeAuctionSettings({ auctionType: "unknown" }).valid, false);
  assert.equal(normalizeAuctionSettings({ randomSetting: true }).valid, false);
});
