/**
 * SIMPLE-02 — Armar prompt (Matías + stock + bloques fotos/visita)
 */
const PROP_MEDIA = __PROP_MEDIA_JSON__;
const CITA_BASE = '__CITA_WEBHOOK_BASE__';

const prep = $('Code - Normalizar WhatsApp').item.json;

let row = {};
try {
  row = $('Google Sheets - Buscar Lead').first().json || {};
} catch (e) {
  row = {};
}

const msg = String(prep.mensaje || '').trim();
let historialPrev = '';
try {
  const hj = row.historial_json;
  if (typeof hj === 'string' && hj.trim().startsWith('[')) {
    const arr = JSON.parse(hj);
    if (Array.isArray(arr)) {
      historialPrev = arr
        .map((m) => {
          const role = String((m && m.role) || '').toLowerCase();
          const content = String((m && (m.content || m.mensaje || '')) || '').trim();
          if (!content) return '';
          if (role === 'assistant' || role === 'bot') return 'Bot: ' + content;
          return 'Cliente: ' + content;
        })
        .filter(Boolean)
        .join('\n');
    }
  }
} catch (e) {
  historialPrev = '';
}
if (!historialPrev) historialPrev = String(row.historial || '').trim();

const isKnownLead = Boolean(
  row.chat_id &&
    (historialPrev ||
      row.temperature ||
      row.status === 'abierto' ||
      row.estado_seguimiento === 'ninguno' ||
      row.estado_seguimiento === 'enviado_1' ||
      row.estado_seguimiento === 'respondido'),
);

const INTENT =
  /\b(depto|departamento|casa|lote|local|oficina|alquiler|alquilo|alquilar|comprar|compra|venta|vender|propiedad|inmueble|inmobiliaria|presupuesto|habitaci[oó]n|dormitorio|ambientes|m2|zona|barrio|mendoza|godoy|cruz|lujan|nodo)\b/i;
const PERSONAL =
  /\b(hermano|hermana|mam[aá]|pap[aá]|partido|jueguito|f[uú]tbol|asado|salimos|birra|tomamos|llamame al personal|no es por una propiedad)\b/i;

let should_reply = true;
let skip_reason = '';
if (PERSONAL.test(msg) && !INTENT.test(msg)) {
  should_reply = false;
  skip_reason = 'mensaje_personal';
} else if (!isKnownLead && !INTENT.test(msg)) {
  should_reply = false;
  skip_reason = 'sin_intencion_inmobiliaria';
}

const datosPrev = {
  operacion: row.operacion || '',
  tipo_propiedad: row.tipo_propiedad || '',
  zona: row.zona || '',
  presupuesto: row.presupuesto || '',
  dormitorios: row.dormitorios || '',
};

function pick(r, keys) {
  for (const k of keys) {
    if (r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
  }
  return '';
}

function mediaFor(id) {
  if (!id) return null;
  return PROP_MEDIA[id] || PROP_MEDIA[String(id).toUpperCase()] || null;
}

let stockItems = [];
try {
  stockItems = $('Leer Stock Propiedades WA')
    .all()
    .map((item) => item.json)
    .filter(
      (r) =>
        r &&
        typeof r === 'object' &&
        !(
          typeof r.error === 'string' &&
          /authorization grant|invalid_grant|token is invalid|OAuth2/i.test(r.error)
        ) &&
        !(Object.keys(r).length === 1 && Object.prototype.hasOwnProperty.call(r, 'error')),
    );
} catch (e) {
  stockItems = [];
}

function rowToStockLine(r) {
  const id = pick(r, ['id', 'ID', 'codigo']);
  const tipo = pick(r, ['tipo', 'Tipo', 'tipologia']);
  const zona = pick(r, ['zona', 'Zona', 'barrio']);
  const precio = pick(r, ['precio', 'Precio', 'precio_usd']);
  const operacion = pick(r, ['operacion', 'Operacion', 'tipo_operacion']);
  const desc = pick(r, ['descripcion', 'Descripcion', 'detalle']);
  const dorm = pick(r, ['dormitorios', 'Dormitorios', 'ambientes']);
  const m = mediaFor(id);
  const linkFicha = m?.linkFicha || pick(r, ['link_ficha', 'linkFicha']);
  const bits = [tipo, zona, dorm ? dorm + ' amb' : '', operacion ? 'op:' + operacion : '', precio].filter(Boolean);
  const head = id ? '[' + id + '] ' : '';
  const linkBit = linkFicha ? ' | ficha:' + linkFicha : '';
  return head + bits.join(' | ') + linkBit + (desc ? ' — ' + desc : '');
}

let stockText = '';
if (stockItems.length) {
  stockText = stockItems.map(rowToStockLine).map((l) => '- ' + l).join('\n');
} else {
  stockText = '- (Sin stock cargado. Pedí datos y ofrecé que un asesor contacte.)';
}

const historialBlock = historialPrev
  ? historialPrev
  : '(Sin historial previo. Es el primer contacto calificado.)';

const citaLinkWa =
  CITA_BASE +
  '/webhook/cita-form?chat_id=' +
  encodeURIComponent(String(prep.chat_id || '')) +
  '&nombre=' +
  encodeURIComponent(String(prep.lead_name || '')) +
  '&canal=whatsapp' +
  (datosPrev.zona ? '&zona=' + encodeURIComponent(String(datosPrev.zona)) : '');

const prompt = `Sos Matías, asesor inmobiliario de Nodo Propiedades (Mendoza). Persona real: serio, responsable y amable. Atendés por WhatsApp.

VOZ (obligatorio):
- Profesional y cercano. Sin apodos, sin "che", sin revelar bot/IA/automatización.
- 2–4 oraciones por turno. Una pregunta por mensaje.
- Leé TODO el historial; no repitas ni ignores datos ya dados.

STOCK (solo IDs de esta lista; máximo 3 por mensaje):
${stockText}

CUANDO RECOMIENDES PROPIEDADES:
- Texto breve + hasta 3 opciones con tipo, zona, precio, detalle y link ficha del stock.
- Dentro del campo "respuesta" del JSON, al final agregá (el cliente no ve estos bloques como texto suelto):
###MOSTRAR_PROPIEDADES###
["MZA-001","MZA-004"]
###FIN_MOSTRAR###
(solo IDs válidos del stock; 1 a 3)

VISITAS:
- Link turnos: ${citaLinkWa}
- Si confirma visita con asesor humano, en "respuesta" usá EXACTAMENTE:
"Perfecto, ya le avisé a un asesor de Nodo Propiedades para que se ponga en contacto con vos en breve y coordinen una visita.\\n\\nCualquier cosa que necesites, estoy acá."
- Y agregá:
###SOLICITUD_VISITA###
{"propiedad_id":"ID","zona":"...","presupuesto":"...","nota":"..."}
###FIN_VISITA###

TEMPERATURA:
- frio: curiosidad sin datos; tibio: interés con zona/presupuesto sin urgencia; caliente: urgencia, visita o datos completos.
- No marques caliente solo por preguntar precio.

DATOS YA CARGADOS:
${JSON.stringify(datosPrev)}

HISTORIAL:
${historialBlock}

CLIENTE: ${prep.lead_name}
MENSAJE ACTUAL: "${msg}"

Responde SOLO JSON válido:
{"temperatura":"frio|tibio|caliente","intencion":"frase corta","operacion":"","tipo_propiedad":"","zona":"","presupuesto":"","dormitorios":"","lead_completo":false,"respuesta":"mensaje para el cliente (puede incluir bloques MOSTRAR/VISITA al final)"}`;

return [
  {
    json: {
      ...prep,
      isKnownLead,
      should_reply,
      skip_reason,
      historial_prev: historialPrev,
      historial_json_prev: String(row.historial_json || '').trim(),
      ultima_prev: row.ultima_actualizacion || row.last_interaction_at || row.updated_at || '',
      consultas_count_prev: row.consultas_count || '0',
      operacion_prev: datosPrev.operacion,
      tipo_prev: datosPrev.tipo_propiedad,
      zona_prev: datosPrev.zona,
      presupuesto_prev: datosPrev.presupuesto,
      dormitorios_prev: datosPrev.dormitorios,
      prompt_groq: prompt,
    },
  },
];
