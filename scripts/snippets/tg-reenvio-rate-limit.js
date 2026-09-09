/**
 * Tras rate limit (429): espera ~60s y si el cliente no escribio,
 * reenvia fichas o link de agenda pendientes.
 */
const PROP_MEDIA = __PROP_MEDIA_JSON__;
const parsed = $('Parsear Respuesta').first().json || {};
const chatId = String(parsed.chat_id || '').trim();
const reenvio = Boolean(parsed.reenvio_rate_limit);
const tipo = String(parsed.reenvio_tipo || '').trim();
let ids = [];
try {
  ids = JSON.parse(parsed.reenvio_ids || '[]');
} catch (e) {
  ids = [];
}
if (!Array.isArray(ids)) ids = [];
const link = String(parsed.reenvio_link || '').trim();

if (!reenvio || !chatId) {
  return [{ json: { skip: true } }];
}

let huboMsgNuevo = false;
try {
  const sd = $getWorkflowStaticData('global');
  const pend = sd.pendienteReenvio && sd.pendienteReenvio[chatId];
  const desde = pend && pend.at ? Number(pend.at) : Date.now() - 60000;
  const histRaw = String(parsed.historial_json || '[]');
  let hist = [];
  try {
    hist = JSON.parse(histRaw);
  } catch (e2) {
    hist = [];
  }
  for (const m of hist) {
    const role = String((m && m.role) || '').toLowerCase();
    if (role !== 'user' && role !== 'cliente') continue;
    const ts = m.ts || m.timestamp || m.fecha || '';
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (!isNaN(t) && t > desde + 2000) {
      huboMsgNuevo = true;
      break;
    }
  }
  if (huboMsgNuevo && sd.pendienteReenvio) {
    delete sd.pendienteReenvio[chatId];
  }
} catch (e3) {}

if (huboMsgNuevo) {
  return [{ json: { skip: true, motivo: 'cliente_respondio' } }];
}

if (tipo === 'link' && link) {
  return [
    {
      json: {
        skip: false,
        modo: 'texto',
        chat_id: chatId,
        texto:
          'Ahi te dejo el link para agendar la visita: ' +
          link +
          ' Cuando lo completes el asesor te confirma.',
      },
    },
  ];
}

const idsOk = ids.filter((id) => PROP_MEDIA[String(id)] && PROP_MEDIA[String(id)].fotos);
if (!idsOk.length && link) {
  return [
    {
      json: {
        skip: false,
        modo: 'texto',
        chat_id: chatId,
        texto: 'Te dejo el link de agenda: ' + link,
      },
    },
  ];
}
if (!idsOk.length) {
  return [{ json: { skip: true, motivo: 'sin_media' } }];
}

// Marca para que Preparar Fotos use estos IDs (via override en static / respuesta)
try {
  const sd2 = $getWorkflowStaticData('global');
  if (!sd2.pendienteReenvio) sd2.pendienteReenvio = {};
  delete sd2.pendienteReenvio[chatId];
} catch (e4) {}

return [
  {
    json: {
      skip: false,
      modo: 'fichas',
      chat_id: chatId,
      texto: 'Mira, te reenvio las opciones',
      propiedades_mostrar: JSON.stringify(idsOk.slice(0, 3)),
      // Compat con Preparar Fotos Propiedad (lee Parsear Respuesta):
      // este nodo tambien puede alimentar un sendPhoto si se cablea aparte.
      photo_ids: idsOk.slice(0, 3),
    },
  },
];
