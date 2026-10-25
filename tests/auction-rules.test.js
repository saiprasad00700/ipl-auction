import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BID_INCREMENT_CRORE,
  DEFAULT_BID_TIMER_SECONDS,
  MIN_BID_TIMER_SECONDS,
  MAX_BID_TIMER_SECONDS,
  MEGA_OVERSEAS_LIMIT,
  SPRINT11_OVERSEAS_LIMIT,
  SPRINT5_OVERSEAS_LIMIT,
  clampBidTimerSeconds,
  getNextBidAmount,
  getOverseasLimit,
} from '../src/lib/auctionRules.js';

test('defaults use a 15-second timer and four overseas players for Mega', () => {
  assert.equal(DEFAULT_BID_TIMER_SECONDS, 15);
  assert.equal(MEGA_OVERSEAS_LIMIT, 4);
  assert.equal(SPRINT11_OVERSEAS_LIMIT, 4);
  assert.equal(SPRINT5_OVERSEAS_LIMIT, 2);
});

test('first bid uses base price and every later bid rises by ₹50 lakh', () => {
  assert.equal(BID_INCREMENT_CRORE, 0.5);
  assert.equal(getNextBidAmount(0, 0.5), 0.5);
  assert.equal(getNextBidAmount(null, 1), 1);
  assert.equal(getNextBidAmount(0.5, 1), 1);
  assert.equal(getNextBidAmount(4.9, 1), 5.4);
  assert.equal(getNextBidAmount(12.25, 1), 12.75);
});

test('timer values are rounded and clamped to the server-supported 3–15 seconds', () => {
  assert.equal(clampBidTimerSeconds(undefined), DEFAULT_BID_TIMER_SECONDS);
  assert.equal(clampBidTimerSeconds(2), MIN_BID_TIMER_SECONDS);
  assert.equal(clampBidTimerSeconds(3.4), 3);
  assert.equal(clampBidTimerSeconds(8.7), 10);
  assert.equal(clampBidTimerSeconds(60), MAX_BID_TIMER_SECONDS);
  assert.equal(clampBidTimerSeconds(7), 5);
});

test('mode-aware overseas defaults apply when room settings are absent', () => {
  assert.equal(getOverseasLimit('mega'), 4);
  assert.equal(getOverseasLimit('sprint11'), 4);
  assert.equal(getOverseasLimit('sprint5'), 2);
  assert.equal(getOverseasLimit('sprint 5'), 2);
  assert.equal(getOverseasLimit('mega', 8), 4);
});
