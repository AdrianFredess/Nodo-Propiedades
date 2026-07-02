const item = $input.first().json;

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/[^\d+]/g, '');
}

function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function buildDedupeKey(phone, email, channelTarget, source) {
  if (phone) return `phone:${phone}`;
  if (email) return `email:${email}`;
  if (channelTarget && source) return `${String(source)}:${String(channelTarget)}`;
  return `anonymous:${Date.now()}`;
}

const normalizedPhone = normalizePhone(item.phone);
const normalizedEmail = normalizeEmail(item.email);
const nowIso = new Date().toISOString();
const channelTarget = item.channel_reply_target || item.telegram_chat_id || null;
const src = item.source || 'unknown';

return [{ json: {
  ...item,
  lead_id: item.lead_id || `ld_${Date.now()}`,
  normalized_phone: normalizedPhone,
  normalized_email: normalizedEmail,
  dedupe_key: item.dedupe_key || buildDedupeKey(normalizedPhone, normalizedEmail, channelTarget, src),
  created_at: item.created_at || nowIso,
  updated_at: nowIso,
  last_interaction_at: item.timestamp || nowIso
} }];
