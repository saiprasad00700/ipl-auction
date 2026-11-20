// Authorization policy for the winner-analysis API. This is deliberately
// independent of Firebase so the policy can be unit-tested without credentials.
export function authorizeWinnerAnalysis({ uid, room, roomStatus }) {
  if (!uid || !room || typeof room !== 'object') return { allowed: false, status: 404, reason: 'room_not_found' };
  if (room.hostId !== uid) return { allowed: false, status: 403, reason: 'host_only' };
  if (!['awaiting_xi', 'analyzing'].includes(String(roomStatus || room.status || ''))) {
    return { allowed: false, status: 409, reason: 'invalid_phase' };
  }
  return { allowed: true, status: 200, reason: 'authorized' };
}
