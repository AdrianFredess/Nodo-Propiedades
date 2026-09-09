const j = $input.first().json || {};
const ids = j.photo_ids || [];
const chat = String(j.chat_id || '');
const PROP_MEDIA = __PROP_MEDIA_JSON__;
const out = [];
for (const id of ids.slice(0, 3)) {
  const m = PROP_MEDIA[String(id)];
  if (!m || !m.fotos || !m.fotos.length) continue;
  out.push({
    json: {
      chat_id: chat,
      photo_url: m.fotos[0],
      caption: String(m.caption || m.titulo || id).slice(0, 900),
      parse_mode: 'HTML',
      propiedad_id: id,
    },
  });
}
if (!out.length) return [{ json: { skip: true } }];
out[out.length - 1].json.is_last_photo = true;

// Texto corto antes de fotos
return [
  {
    json: {
      chat_id: chat,
      photo_url: out[0].json.photo_url,
      caption: 'Mira, te reenvio esto\n\n' + out[0].json.caption,
      parse_mode: 'HTML',
      propiedad_id: out[0].json.propiedad_id,
      is_last_photo: out.length === 1,
    },
  },
  ...out.slice(1),
];
