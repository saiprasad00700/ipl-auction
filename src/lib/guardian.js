// Lightweight browser-side reporting for SS AUCTION Guardian.
export function reportGuardianError({ operation = 'frontend', severity = 'high', message, roomId, fingerprint } = {}) {
  if (typeof window === 'undefined' || !message) return;
  const payload = {
    operation,
    severity,
    message: String(message).slice(0, 1800),
    roomId: roomId ? String(roomId).slice(0, 80) : null,
    fingerprint: fingerprint ? String(fingerprint).slice(0, 120) : null
  };
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/guardian/report', blob)) return;
    }
    void fetch('/api/guardian/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  } catch {
    // Monitoring must never interrupt the auction experience.
  }
}
