import test from 'node:test';
import assert from 'node:assert/strict';
import { BID_INCREMENT_CRORE, DEFAULT_BID_TIMER_SECONDS, MEGA_OVERSEAS_LIMIT, getNextBidAmount } from '../src/lib/auctionRules.js';

test('mega auction defaults to a 15-second bid timer and four overseas players', () => {
  assert.equal(DEFAULT_BID_TIMER_SECONDS, 15);
  assert.equal(MEGA_OVERSEAS_LIMIT, 4);
});

test('first bid uses the player base price', () => {
  assert.equal(getNextBidAmount(0, 0.5), 0.5);
  assert.equal(getNextBidAmount(null, 1.0), 1.0);
});

test('subsequent bids rise by ₹50 lakh (0.5 crore) at every price level', () => {
  assert.equal(BID_INCREMENT_CRORE, 0.5);
  assert.equal(getNextBidAmount(0.5, 1), 1.0);
  assert.equal(getNextBidAmount(4.9, 1), 5.4);
  assert.equal(getNextBidAmount(12.25, 1), 12.75);
});

test('rounds bid values to two decimal places', () => {
  assert.equal(getNextBidAmount(3.1, 1), 3.6);
});
