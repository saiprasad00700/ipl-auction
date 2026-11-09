// SS AUCTION Guardian: server-side error storage and Telegram notifications.
const MAX_MESSAGE_LENGTH = 500;
const ALLOWED_OPERATIONS = new Set([
  'frontend', 'auction', 'bidding', 'rtm', 'ai_analysis', 'room_join',
  'firebase', 'supabase', 'voice', 'unknown'
]);

function safeText(value, limit = MAX_MESSAGE_LENGTH) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
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
  if (saved && severity !== 'medium') {
    await sendTelegramAlert({ ...row, id: saved.id, created_at: saved.created_at });
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
