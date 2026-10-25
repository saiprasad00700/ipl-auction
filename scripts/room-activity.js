// Modified from the upstream project by saiprasad00700.
// Shared timestamp parsing for the scheduled inactive-room cleanup and its tests.
const ACTIVITY_TIMESTAMP_KEYS = new Set([
  'lastActivityAt', 'activityAt', 'lastSeen', 'joinedAt', 'leftAt',
  'lastMessageAt', 'lastChatAt', 'lastBidAt', 'bidAt', 'timestamp',
  'createdAt', 'updatedAt',
]);

export function timestampMs(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim() !== '' && Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function latestTimestampInTree(value, key = '') {
  if (value === null || value === undefined) return 0;
  let latest = ACTIVITY_TIMESTAMP_KEYS.has(key) ? timestampMs(value) : 0;
  if (Array.isArray(value)) {
    for (const child of value) latest = Math.max(latest, latestTimestampInTree(child));
  } else if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      latest = Math.max(latest, latestTimestampInTree(childValue, childKey));
    }
  }
  return latest;
}

export function latestActivityAt(value) {
  return Math.max(
    timestampMs(value?.room?.lastActivityAt),
    timestampMs(value?.live?.lastActivityAt),
    timestampMs(value?.room?.createdAt),
    timestampMs(value?.createdAt),
    timestampMs(value?.lastActivityAt),
    latestTimestampInTree(value?.messages),
    latestTimestampInTree(value?.presence),
    latestTimestampInTree(value?.live),
    latestTimestampInTree(value?.room?.players),
    latestTimestampInTree(value?.teams)
  );
}

export function isInactive(value, now, inactivityMs) {
  const latest = latestActivityAt(value);
  return latest > 0 && now - latest >= inactivityMs;
}
