// Pure aggregation helpers for SS AUCTION INSIGHTS phase 2.
// Country values are optional browser-locale estimates, never IP-derived.

const DAY_MS = 24 * 60 * 60 * 1000;

function validDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function istDay(value) {
  const date = value instanceof Date ? value : validDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function normalizeCountryEstimate(value) {
  if (typeof value !== 'string') return null;
  const country = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

export function buildPhaseTwoMetrics({ sessions = [], events = [], snapshots = [], now = new Date() }) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const sessionTimesByUser = new Map();
  const firstSeenByUser = new Map();

  for (const session of sessions) {
    if (!session?.firebase_uid) continue;
    const started = validDate(session.started_at);
    if (!started) continue;
    if (!sessionTimesByUser.has(session.firebase_uid)) sessionTimesByUser.set(session.firebase_uid, []);
    sessionTimesByUser.get(session.firebase_uid).push(started.getTime());
    const previous = firstSeenByUser.get(session.firebase_uid);
    if (!previous || started < previous) firstSeenByUser.set(session.firebase_uid, started);
  }

  const cohortUsers = [...firstSeenByUser.entries()];
  const retention = [1, 7, 30].map((days) => {
    const eligible = cohortUsers.filter(([, firstSeen]) => nowMs - firstSeen.getTime() >= days * DAY_MS);
    const returned = eligible.filter(([uid, firstSeen]) => {
      const activeTimes = sessionTimesByUser.get(uid) || [];
      return activeTimes.some((timestamp) => {
        const delta = timestamp - firstSeen.getTime();
        return delta >= days * DAY_MS && delta < (days + 1) * DAY_MS;
      });
    }).length;
    return { days, eligiblePlayers: eligible.length, returnedPlayers: returned,
      rate: eligible.length ? Math.round((returned / eligible.length) * 1000) / 10 : 0 };
  });

  const roomEvents = { created: 0, completed: 0 };
  const countryUsers = new Map();
  for (const event of events) {
    if (event?.event_name === 'room_created') roomEvents.created += 1;
    if (event?.event_name === 'auction_completed') roomEvents.completed += 1;
    const country = normalizeCountryEstimate(event?.metadata?.countryEstimate);
    if (country && event?.firebase_uid) {
      if (!countryUsers.has(country)) countryUsers.set(country, new Set());
      countryUsers.get(country).add(event.firebase_uid);
    }
  }

  const maxOnlinePlayers = snapshots.reduce((max, snapshot) =>
    Math.max(max, Number(snapshot?.online_players) || 0), 0);
  const maxActivePlayers = snapshots.reduce((max, snapshot) =>
    Math.max(max, Number(snapshot?.active_players) || 0), 0);

  return {
    concurrency: {
      peakOnlinePlayers: maxOnlinePlayers,
      peakActivePlayers: maxActivePlayers,
      sampledAt: snapshots.reduce((latest, snapshot) =>
        snapshot?.online_players === maxOnlinePlayers && snapshot?.sampled_at &&
        (!latest || snapshot.sampled_at > latest) ? snapshot.sampled_at : latest, null)
    },
    rooms: roomEvents,
    retention,
    countries: [...countryUsers.entries()]
      .map(([country, users]) => ({ country, players: users.size }))
      .sort((a, b) => b.players - a.players || a.country.localeCompare(b.country))
  };
}
