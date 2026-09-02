/**
 * SIMPLE-03 — Normalizar inbound Meta Messenger
 */
const root = $input.first().json;
const body = root.body || root;

try {
  const entry = body.entry?.[0];
  const messaging = entry?.messaging?.[0];

  if (!messaging) return [];

  if (messaging.message?.is_echo) return [];

  const sender_id = String(messaging.sender?.id || '').trim();
  let texto = String(messaging.message?.text || '').trim();

  if (!texto && messaging.message?.attachments?.length) {
    const att = messaging.message.attachments[0];
    if (att?.type === 'image') texto = '[foto]';
    else if (att?.type === 'file') texto = '[archivo]';
    else texto = '[adjunto]';
  }

  if (!sender_id || !texto) return [];

  const nombre =
    messaging.sender?.name ||
    body.entry?.[0]?.changes?.[0]?.value?.sender?.name ||
    'Cliente Messenger';

  return [
    {
      json: {
        canal: 'messenger',
        chat_id: sender_id,
        dedupe_key: 'messenger:' + sender_id,
        lead_name: nombre,
        phone: sender_id,
        mensaje: texto,
        fecha: new Date().toISOString(),
      },
    },
  ];
} catch (e) {
  return [];
}
