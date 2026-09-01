/**
 * Expande mensajes_extra del procesamiento IA en items para WhatsApp (burbujas cortas).
 */
const parsed = $('Code - Procesar IA').first().json;
const chatId = String(parsed.chat_id || '').trim();
let extras = [];
try {
  extras = JSON.parse(parsed.mensajes_extra || '[]');
} catch (e) {
  extras = [];
}
if (!Array.isArray(extras)) extras = [];

const limpios = extras
  .map((t) => String(t || '').trim())
  .filter(Boolean)
  .slice(0, 4);

if (!limpios.length) {
  return [{ json: { skip: true } }];
}

return limpios.map((text, i) => ({
  json: {
    chat_id: chatId,
    text,
    is_last_burbuja: i === limpios.length - 1,
  },
}));
