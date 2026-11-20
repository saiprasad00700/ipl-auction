// Agora RTC identity must be bound to the authenticated Firebase identity.
// Prevents a room member from minting a voice token as another participant.
export function validateRtcAccount({ uid, rtcAccount }) {
  if (!uid || typeof uid !== 'string') return { allowed: false, reason: 'identity_required' };
  if (!rtcAccount || typeof rtcAccount !== 'string') return { allowed: false, reason: 'rtc_identity_required' };
  if (rtcAccount !== uid) return { allowed: false, reason: 'rtc_identity_mismatch' };
  return { allowed: true };
}
