/**
 * Tras enviar texto por WAHA, prepara ítems para sendImage.
 */
const PROP_MEDIA = __PROP_MEDIA_JSON__;
const parsed = $('Code - Procesar IA').first().json;
const chatId = String(parsed.chat_id || '').trim();
let ids = [];
try {
  ids = JSON.parse(parsed.propiedades_mostrar || '[]');
} catch (e) {
  ids = [];
}
if (!Array.isArray(ids)) ids = [];

const out = [];
for (const rawId of ids.slice(0, 3)) {
  const id = String(rawId || '').trim();
  const m = PROP_MEDIA[id];
  if (!m || !Array.isArray(m.fotos)) continue;
  const fotos = m.fotos.slice(0, 4);
  fotos.forEach((url, idx) => {
    const caption =
      idx === 0
        ? String(m.caption || id) + (m.linkFicha ? '\nVer ficha: ' + m.linkFicha : '')
        : '';
    out.push({
      json: {
        chat_id: chatId,
        photo_url: url,
        caption,
        propiedad_id: id,
      },
    });
  });
}

if (!out.length) {
  return [{ json: { skip: true } }];
}
return out;
