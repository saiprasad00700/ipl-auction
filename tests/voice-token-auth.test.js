import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRtcAccount } from '../api/voice-token-auth.js';

test('requires authenticated Firebase identity and RTC identity', () => {
  assert.equal(validateRtcAccount({ uid: '', rtcAccount: 'u1' }).reason, 'identity_required');
  assert.equal(validateRtcAccount({ uid: 'u1', rtcAccount: '' }).reason, 'rtc_identity_required');
});

test('rejects RTC account impersonation', () => {
  assert.equal(validateRtcAccount({ uid: 'u1', rtcAccount: 'u2' }).reason, 'rtc_identity_mismatch');
});

test('allows RTC account matching authenticated UID', () => {
  assert.equal(validateRtcAccount({ uid: 'u1', rtcAccount: 'u1' }).allowed, true);
});
