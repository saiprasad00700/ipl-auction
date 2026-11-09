// SS AUCTION Guardian: server-side error storage and Telegram notifications.
const MAX_MESSAGE_LENGTH = 1800;
const recentAlerts = new Map();
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const ALLOWED_OPERATIONS = new Set([
  'frontend', 'auction', 'bidding', 'rtm', 'ai_analysis', 'room_join',
  'firebase', 'supabase', 'voice', 'unknown'
]);

function safeText(value, limit = MAX_MESSAGE_LENGTH) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

async function sendEmailAlert(error) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.GUARDIAN_EMAIL_TO;
  const from = process.env.GUARDIAN_EMAIL_FROM;
  if (!apiKey || !recipient || !from) return;
  const subject = '[SS AUCTION Guardian] ' + error.severity.toUpperCase() + ': ' + error.operation;
  const html = '<h2>SS AUCTION Guardian Alert</h2>' +
    '<p><strong>Severity:</strong> ' + safeText(error.severity, 20) + '</p>' +
    '<p><strong>Operation:</strong> ' + safeText(error.operation, 40) + '</p>' +
    '<p><strong>Issue:</strong> ' + safeText(error.message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' +
    (error.room_id ? '<p><strong>Room:</strong> ' + safeText(error.room_id, 80) + '</p>' : '') +
    '<p><strong>Error ID:</strong> ' + safeText(error.id, 30) + '</p>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [recipient], subject, html })
  });
  if (!response.ok) console.warn('[Guardian] Email delivery failed:', response.status);
}

export async function recordGuardianError(input) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Guardian storage is not configured');

  const operation = ALLOWED_OPERATIONS.has(input.operation) ? input.operation : 'unknown';
  const severity = input.severity === 'critical' || input.severity === 'high' ? input.severity : 'medium';
  const row = {
    operation,
    severity,
    message: safeText(input.message),
    room_id: safeText(input.roomId, 80) || null,
    source: safeText(input.source, 80) || 'server',
    fingerprint: safeText(input.fingerprint, 120) || null
  };
  const response = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/guardian_errors', {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!response.ok) throw new Error('Guardian database insert failed: ' + response.status);
  const rows = await response.json();
  const saved = Array.isArray(rows) ? rows[0] : null;

  // Avoid alert flooding: notify once per fingerprint in a 10-minute window.
  const alertKey = row.fingerprint || (row.operation + ':' + row.message);
  const lastAlertAt = recentAlerts.get(alertKey) || 0;
  if (saved && severity !== 'medium' && Date.now() - lastAlertAt >= ALERT_COOLDOWN_MS) {
    recentAlerts.set(alertKey, Date.now());
    try {
      await Promise.allSettled([
        sendTelegramAlert({ ...row, id: saved.id, created_at: saved.created_at }),
        sendEmailAlert({ ...row, id: saved.id, created_at: saved.created_at })
      ]);
    } catch (error) {
      console.warn('[Guardian] Telegram delivery error:', error?.message || error);
    }
    if (recentAlerts.size > 2000) {
      const cutoff = Date.now() - ALERT_COOLDOWN_MS;
      for (const [key, timestamp] of recentAlerts) if (timestamp < cutoff) recentAlerts.delete(key);
    }
  }
  return saved;
}

async function sendTelegramAlert(error) {
  const token = process.env.GUARDIAN_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.GUARDIAN_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const message = [
    '🚨 SS AUCTION GUARDIAN',
    'Severity: ' + error.severity.toUpperCase(),
    'Operation: ' + error.operation,
    'Issue: ' + error.message,
    error.room_id ? 'Room: ' + error.room_id : '',
    'Time: ' + new Date(error.created_at || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    'Error ID: ' + error.id
  ].filter(Boolean).join('\n');
  const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true })
  });
  if (!response.ok) console.warn('[Guardian] Telegram delivery failed:', response.status);
}

export function sanitizeGuardianInput(body = {}) {
  return {
    operation: safeText(body.operation, 40).toLowerCase(),
    severity: safeText(body.severity, 20).toLowerCase(),
    message: safeText(body.message),
    roomId: safeText(body.roomId, 80),
    source: safeText(body.source, 80),
    fingerprint: safeText(body.fingerprint, 120)
  };
}
