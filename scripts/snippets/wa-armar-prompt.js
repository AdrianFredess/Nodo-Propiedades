/**
 * SIMPLE-02 — Armar prompt (Matías + stock + bloques fotos/visita — formato Casa Clic)
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

function parseUsd(s) {
  const m = String(s || '')
    .replace(/\./g, '')
    .match(/(\d{4,7})/);
  return m ? parseInt(m[1], 10) : null;
}

function extractPresupuestoUsd(text) {
  const t = String(text || '').toLowerCase();
  let m = t.match(
    /(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})\s*(?:usd|u\$s|dolar(?:es)?|dolares)/i,
  );
  if (m) return parseInt(m[1].replace(/[.\s]/g, ''), 10);
  m = t.match(/(\d{2,3})\s*mil\s*(?:usd|u\$s|dolar(?:es)?)?/i);
  if (m) return parseInt(m[1], 10) * 1000;
  m = t.match(/\b(\d{2,3})k\b/i);
  if (m) return parseInt(m[1], 10) * 1000;
  m = t.match(/por\s+(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})/i);
  if (m) return parseInt(m[1].replace(/[.\s]/g, ''), 10);
  return null;
}

function extractZona(text) {
  const t = String(text || '').toLowerCase();
  const zonas = [
    'godoy cruz',
    'guaymallen',
    'guaymallén',
    'capital',
    'lujan',
    'luján',
    'maipu',
    'maipú',
    'las heras',
    'san martin',
    'san martín',
    'mendoza',
  ];
  for (const z of zonas) {
    if (t.includes(z)) return z;
  }
  return '';
}

function sugerirIds(stock, budgetUsd, zonaHint) {
  const scored = [];
  for (const r of stock) {
    const id = pick(r, ['id', 'ID', 'codigo']);
    const precio = parseUsd(pick(r, ['precio', 'Precio']));
    const zona = pick(r, ['zona', 'Zona']).toLowerCase();
    if (!id || !precio) continue;
    let score = Math.abs(precio - (budgetUsd || precio));
    if (budgetUsd && precio > budgetUsd * 1.18) score += 50000;
    if (budgetUsd && precio < budgetUsd * 0.45) score += 30000;
    if (zonaHint && zona.includes(zonaHint.split(' ')[0])) score -= 15000;
    scored.push({ id, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 3).map((x) => x.id);
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
  const operacion = pick(r, ['operacion', 'Operacion', 'tipo_operacion']) || 'venta';
  const desc = pick(r, ['descripcion', 'Descripcion', 'detalle']);
  const dorm = pick(r, ['dormitorios', 'Dormitorios', 'ambientes']);
  const m = mediaFor(id);
  const linkFicha = m?.linkFicha || pick(r, ['link_ficha', 'linkFicha']);
  const bits = [tipo, zona, dorm ? dorm + ' amb' : '', 'op:' + operacion, precio].filter(Boolean);
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

const textoCompleto = (historialPrev + '\n' + msg).trim();
const presupuestoUsd =
  extractPresupuestoUsd(msg) || extractPresupuestoUsd(historialPrev);
const zonaDetectada = extractZona(msg) || extractZona(historialPrev) || '';

const pideOpciones =
  /\b(mandame|mandá|mostrame|mostrá|pasame|pasá|que ten[eé]s|qué ten[eé]s|opciones|ver algo|catalogo|catálogo|mostrar|enviame|enviá|algo para|propiedades para|dentro de|hasta)\b/i.test(
    msg,
  ) ||
  (Boolean(presupuestoUsd) &&
    /\b(tengo|presupuesto|usd|u\$s|dolar|busco|quiero)\b/i.test(msg));

const debeMostrarPropiedades =
  stockItems.length > 0 &&
  (pideOpciones ||
    Boolean(presupuestoUsd) ||
    /\b(propiedad|propiedades|depto|departamento|casa|ten[eé]s|tienen)\b/i.test(msg));

const sugerenciasIds =
  stockItems.length > 0 ? sugerirIds(stockItems, presupuestoUsd, zonaDetectada) : [];

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
- Profesional y cercano. Sin apodos, sin "che", sin revelar bot/IA.
- Burbujas cortas: 1-3 frases por mensaje. Una pregunta por turno.
- Leé TODO el historial; no repitas ni ignores datos ya dados.
- Default: VENTA en USD. Alquiler solo si el cliente lo pidió explícitamente.

STOCK (solo IDs de esta lista; nunca inventes):
${stockText}

MOSTRAR PROPIEDADES (estilo Casa Clic — OBLIGATORIO cuando recomiendes opciones):
- Tu "respuesta" visible = SOLO 1 frase intro (ej: "¡Claro! Acá te muestro opciones dentro de tu presupuesto.").
- NO listes propiedades en texto. Las fichas (foto + tipo + precio + link) las envía el sistema.
- Al final del campo "respuesta" agregá:
###MOSTRAR_PROPIEDADES###
["MZA-001","MZA-004"]
###FIN_MOSTRAR###
(solo IDs válidos del stock; 1 a 3)
- Después de las fotos el sistema manda cierre: "¿Cuál te llama más la atención?"
${debeMostrarPropiedades && sugerenciasIds.length ? '- IDs sugeridos del stock: ' + JSON.stringify(sugerenciasIds) : ''}

DETALLE DE UNA PROPIEDAD:
- Usá bloque ###BURBUJAS### con array JSON de mensajes cortos:
###BURBUJAS###
["📍 Zona y dirección","Detalle amb/m²","USD X · ¿Querés más fotos?"]
###FIN_BURBUJAS###

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
{"temperatura":"frio|tibio|caliente","intencion":"frase corta","operacion":"","tipo_propiedad":"","zona":"","presupuesto":"","dormitorios":"","lead_completo":false,"respuesta":"mensaje intro + bloques MOSTRAR/BURBUJAS/VISITA al final (invisibles al cliente como texto suelto)"}`;

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
      sugerencias_ids: JSON.stringify(sugerenciasIds),
      debe_mostrar_propiedades: debeMostrarPropiedades,
      presupuesto_detectado: presupuestoUsd ? String(presupuestoUsd) : '',
      pide_opciones: pideOpciones,
    },
  },
];
