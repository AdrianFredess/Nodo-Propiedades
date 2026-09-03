/**
 * SIMPLE-02 — Normalizar inbound Meta WhatsApp Cloud API
 */
const root = $input.first().json;
const body = root.body || root;

try {
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const msg = value?.messages?.[0];

  if (!msg) return [];

  // Status updates, delivery receipts, etc.
  if (msg.type !== 'text') {
    // Audios/notas de voz: pasa media_id para transcribir con Groq Whisper
    if (msg.type === 'audio' || msg.type === 'voice') {
      const phone = String(msg.from || '').replace(/\D/g, '');
      if (!phone) return [];
      const nombre = value.contacts?.[0]?.profile?.name || 'Cliente';
      const audio = msg.audio || msg.voice || {};
      return [
        {
          json: {
            canal: 'whatsapp',
            chat_id: phone,
            dedupe_key: 'whatsapp:' + phone,
            lead_name: nombre,
            phone: phone,
            mensaje: '',
            es_audio: true,
            audio_media_id: String(audio.id || ''),
            audio_mime: String(audio.mime_type || 'audio/ogg'),
            es_audio_sin_transcripcion: false,
            waba_message_id: msg.id || '',
            fecha: new Date().toISOString(),
          },
        },
      ];
    }
    return [];
  }

  const phone = String(msg.from || '').replace(/\D/g, '');
  const texto = String(msg.text?.body || '').trim();
  if (!phone || !texto) return [];

  const nombre = value.contacts?.[0]?.profile?.name || 'Cliente';

  return [
    {
      json: {
        canal: 'whatsapp',
        chat_id: phone,
        dedupe_key: 'whatsapp:' + phone,
        lead_name: nombre,
        phone: phone,
        mensaje: texto,
        waba_message_id: msg.id || '',
        fecha: new Date().toISOString(),
      },
    },
  ];
} catch (e) {
  return [];
}
