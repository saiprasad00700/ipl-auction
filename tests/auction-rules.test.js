import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BID_INCREMENT_CRORE,
  MARQUEE_BID_INCREMENT_CRORE,
  SET_1_BID_INCREMENT_CRORE,
  SET_2_BID_INCREMENT_CRORE,
  DEFAULT_BID_TIMER_SECONDS,
  MEGA_OVERSEAS_LIMIT,
  getNextBidAmount
} from '../src/lib/auctionRules.js';

test('mega auction defaults to a 15-second bid timer and eight overseas squad players', () => {
  assert.equal(DEFAULT_BID_TIMER_SECONDS, 15);
  assert.equal(MEGA_OVERSEAS_LIMIT, 8);
});

test('first bid uses the player base price', () => {
  assert.equal(getNextBidAmount(0, 0.5), 0.5);
  assert.equal(getNextBidAmount(null, 1.0), 1.0);
});

test('Set 1 players use a ₹25 lakh (0.25 crore) bid increment', () => {
  assert.equal(SET_1_BID_INCREMENT_CRORE, 0.25);
  assert.equal(getNextBidAmount(2, 2, 'Set 1'), 2.25);
  assert.equal(getNextBidAmount(2.25, 2, 'Set 1'), 2.5);
  assert.equal(getNextBidAmount(2.5, 2, 'Set 1'), 2.75);
});

test('Set 2 players use a ₹15 lakh (0.15 crore) bid increment', () => {
  assert.equal(SET_2_BID_INCREMENT_CRORE, 0.15);
  assert.equal(getNextBidAmount(2, 2, 'Set 2'), 2.15);
  assert.equal(getNextBidAmount(2.15, 2, 'Set 2'), 2.3);
  assert.equal(getNextBidAmount(2.3, 2, 'Set 2'), 2.45);
});

test('Marquee players retain a ₹25 lakh (0.25 crore) bid increment', () => {
  assert.equal(MARQUEE_BID_INCREMENT_CRORE, 0.25);
  assert.equal(getNextBidAmount(2, 2, 'Marquee Set 1'), 2.25);
  assert.equal(getNextBidAmount(2.25, 2, 'Marquee Set 1'), 2.5);
  assert.equal(getNextBidAmount(2.5, 2, 'Marquee Set 1'), 2.75);
});

test('players outside Marquee, Set 1 and Set 2 retain the default ₹50 lakh increment', () => {
  assert.equal(BID_INCREMENT_CRORE, 0.5);
  assert.equal(getNextBidAmount(0.5, 1, 'Set 3'), 1);
  assert.equal(getNextBidAmount(4.9, 1, 'Set 3'), 5.4);
  assert.equal(getNextBidAmount(12.25, 1, 'Set 3'), 12.75);
});

test('rounds bid values to two decimal places', () => {
  assert.equal(getNextBidAmount(3.1, 1), 3.6);
});
