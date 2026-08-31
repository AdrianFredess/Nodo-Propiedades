/**
 * Prepara envío de fichas estilo Casa Clic: 1 foto principal con tarjeta + extras.
 */
const PROP_MEDIA = __PROP_MEDIA_JSON__;
const parsed = $('Parsear Respuesta').first().json;
const chatId = String(parsed.chat_id || '').trim();
let ids = [];
try {
  ids = JSON.parse(parsed.propiedades_mostrar || '[]');
} catch (e) {
  ids = [];
}
if (!Array.isArray(ids)) ids = [];

function formatPrecio(precio, precioUsd) {
  if (precioUsd) {
    return 'USD ' + precioUsd.toLocaleString('es-AR');
  }
  return String(precio || '').trim();
}

function cardCaption(m, id) {
  const titulo = m.titulo || m.caption || id;
  const tipo = m.tipo || 'Propiedad';
  const op = m.operacion || 'Venta';
  const precio = formatPrecio(m.precio, m.precioUsd);
  const desc = String(m.descripcion || '').trim();
  const link = m.linkFicha || '';
  let cap =
    '<b>' +
    titulo +
    '</b>\n\n' +
    '🏠 Tipo: ' +
    tipo +
    '\n' +
    '🏷️ ' +
    op +
    '\n' +
    '💰 Precio: ' +
    precio;
  if (desc) cap += '\n\n' + desc;
  if (link) cap += '\n\n🔗 <a href="' + link + '">Ver ficha</a>';
  return cap.slice(0, 1000);
}

const out = [];
for (const rawId of ids.slice(0, 3)) {
  const id = String(rawId || '').trim();
  const m = PROP_MEDIA[id];
  if (!m || !Array.isArray(m.fotos) || !m.fotos.length) continue;
  const fotos = m.fotos.slice(0, 4);
  out.push({
    json: {
      chat_id: chatId,
      photo_url: fotos[0],
      caption: cardCaption(m, id),
      parse_mode: 'HTML',
      propiedad_id: id,
    },
  });
  for (let i = 1; i < fotos.length; i++) {
    out.push({
      json: {
        chat_id: chatId,
        photo_url: fotos[i],
        caption: '',
        parse_mode: 'HTML',
        propiedad_id: id,
      },
    });
  }
}

if (!out.length) {
  return [{ json: { skip: true } }];
}
out[out.length - 1].json.is_last_photo = true;
return out;
