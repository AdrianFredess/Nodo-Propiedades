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
  m = t.match(/(\d{2,3})\s*mil\b/i);
  if (m && !/\b(alquil|mensual|por mes)\b/i.test(t)) return parseInt(m[1], 10) * 1000;
  return null;
}

const chatKey = String(prep.chat_id || prep.phone || 'unknown');
const sd = $getWorkflowStaticData('global');
if (!sd.offTopicCount) sd.offTopicCount = {};

const esAudioSinTexto = Boolean(prep.es_audio_sin_transcripcion);

let historialJsonArrEarly = [];
try {
  const hj = row.historial_json;
  if (typeof hj === 'string' && hj.trim().startsWith('[')) historialJsonArrEarly = JSON.parse(hj);
  else if (Array.isArray(hj)) historialJsonArrEarly = hj;
} catch (e) {
  historialJsonArrEarly = [];
}

let stockItemsEarly = [];
try {
  stockItemsEarly = $('Leer Stock Propiedades WA')
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
  stockItemsEarly = [];
}

const clasif = clasificarIntencionCliente(msg, historialPrev, {
  esAudioSinTexto,
  isKnownLead,
  stockDisponible: stockItemsEarly.length > 0,
  historialJsonArr: historialJsonArrEarly,
});

const presupuestoUsdEarly = clasif.presupuesto_usd;
const onTopic =
  esAudioSinTexto ||
  clasif.mostrar_stock ||
  clasif.intencion !== 'off_topic' ||
  clasif.es_saludo;
const offTopic = clasif.es_off_topic && !clasif.mostrar_stock && !clasif.es_saludo;

let offTopicCount = Number(sd.offTopicCount[chatKey] || 0) || 0;
if (onTopic) {
  offTopicCount = 0;
} else if (offTopic) {
  offTopicCount += 1;
}
sd.offTopicCount[chatKey] = offTopicCount;

let should_reply = true;
let skip_reason = '';
if (offTopicCount >= 3) {
  should_reply = false;
  skip_reason = 'off_topic_x3';
}

const OFF_TOPIC_MSG_1 =
  'Solo trabajo con propiedades. Si buscás depto o casa en Mendoza, avisame.';
const OFF_TOPIC_MSG_2 =
  'Acá solo propiedades. Si te interesa un depto o casa, decime.';
const AUDIO_MSG =
  'Todavía no puedo escuchar audios, escribime por texto y te ayudo con propiedades';
const respuesta_forzada = esAudioSinTexto
  ? AUDIO_MSG
  : offTopic && offTopicCount >= 1 && offTopicCount < 3
    ? offTopicCount <= 1
      ? OFF_TOPIC_MSG_1
      : OFF_TOPIC_MSG_2
    : '';

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

function extractOperacion(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(alquil|rent)/i.test(t)) return 'alquiler';
  if (/\b(compr|venta|vend)/i.test(t)) return 'compra';
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

function sugerirIdsVariados(stock) {
  const rows = [];
  for (const r of stock) {
    const id = pick(r, ['id', 'ID', 'codigo']);
    const precio = parseUsd(pick(r, ['precio', 'Precio']));
    const zona = pick(r, ['zona', 'Zona']).toLowerCase();
    if (!id || !precio) continue;
    rows.push({ id, precio, zona });
  }
  if (!rows.length) return [];
  rows.sort((a, b) => a.precio - b.precio);
  const picked = [];
  const zonasUsadas = new Set();
  for (const r of rows) {
    if (picked.length >= 3) break;
    const zonaKey = (r.zona || 'x').split(' ')[0];
    if (!zonasUsadas.has(zonaKey)) {
      picked.push(r.id);
      zonasUsadas.add(zonaKey);
    }
  }
  if (picked.length < 3) {
    const tiers = [0, Math.floor(rows.length / 2), rows.length - 1];
    for (const i of tiers) {
      const id = rows[i]?.id;
      if (id && !picked.includes(id)) picked.push(id);
      if (picked.length >= 3) break;
    }
  }
  for (const r of rows) {
    if (picked.length >= 3) break;
    if (!picked.includes(r.id)) picked.push(r.id);
  }
  return picked.slice(0, 3);
}

let stockItems = stockItemsEarly;

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
  stockText = '- (Sin stock cargado. Pedí zona y presupuesto; no inventes propiedades.)';
}

const textoCompleto = (historialPrev + '\n' + msg).trim();
const presupuestoUsd = presupuestoUsdEarly;
const zonaDetectada = clasif.zona || extractZona(msg) || extractZona(historialPrev) || '';
const operacionDetectada =
  clasif.operacion || extractOperacion(msg) || extractOperacion(historialPrev) || '';
const esAlquilerPresupuestoAlto =
  operacionDetectada === 'alquiler' &&
  Boolean(presupuestoUsd) &&
  presupuestoUsd >= 15000;

const esCurioso = clasif.modo_curioso;
const pideOpciones =
  clasif.intencion === 'pedir_opciones' ||
  clasif.mostrar_stock ||
  esCurioso;

const debeMostrarPropiedades =
  stockItems.length > 0 &&
  !esAlquilerPresupuestoAlto &&
  clasif.mostrar_stock;

const sugerenciasIds =
  stockItems.length > 0
    ? presupuestoUsd || zonaDetectada
      ? sugerirIds(stockItems, presupuestoUsd, zonaDetectada)
      : sugerirIdsVariados(stockItems)
    : [];

const historialBlock = historialPrev
  ? historialPrev
  : '(Sin historial previo. Es el primer contacto calificado.)';

let historialJsonArr = historialJsonArrEarly;

function esConsultaRepetidaPrompt(mensaje, historialArr) {
  const actual = String(mensaje || '').trim().toLowerCase();
  if (!actual || !Array.isArray(historialArr) || !historialArr.length) return false;
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const na = norm(actual);
  const users = historialArr
    .filter((m) => String((m && m.role) || '').toLowerCase() === 'user')
    .map((m) => norm((m && m.content) || ''))
    .filter(Boolean);
  return users.slice(-4).some((p) => {
    if (p === na) return true;
    const wa = na.split(' ').filter((w) => w.length > 2);
    const wb = new Set(p.split(' ').filter((w) => w.length > 2));
    if (!wa.length) return false;
    let inter = 0;
    for (const w of wa) if (wb.has(w)) inter++;
    return inter / wa.length >= 0.62;
  });
}

const consultaRepetida = esConsultaRepetidaPrompt(msg, historialJsonArr);
const aprendizajePack = armarBloqueAprendizajePrompt(
  historialJsonArr,
  datosPrev,
  msg,
  'whatsapp',
  clasif.intencion,
);
const bloqueAprendizaje = aprendizajePack.bloque;
const ultimoBotHistorial = (() => {
  if (!Array.isArray(historialJsonArr)) return '';
  const bots = historialJsonArr
    .filter((m) => {
      const role = String((m && m.role) || '').toLowerCase();
      return role === 'assistant' || role === 'bot';
    })
    .map((m) => String((m && m.content) || '').trim())
    .filter(Boolean);
  return bots.length ? bots[bots.length - 1] : '';
})();

const citaLinkWa =
  CITA_BASE +
  '/webhook/cita-form?chat_id=' +
  encodeURIComponent(String(prep.chat_id || '')) +
  '&nombre=' +
  encodeURIComponent(String(prep.lead_name || '')) +
  '&canal=whatsapp' +
  (datosPrev.zona ? '&zona=' + encodeURIComponent(String(datosPrev.zona)) : '');

const prompt = `Sos Matías, asesor virtual de Nodo Propiedades (Mendoza). Vos SOS el asesor: corto, natural, argentino. Nunca derivás a "un asesor". Atendés por WhatsApp.

SOLO RUBRO:
- Únicamente compra/venta/alquiler de inmuebles. Nada de comida, restaurantes, herramientas u otros rubros.
- Off-topic: una frase redirigiendo a propiedades. PROHIBIDO recomendar restaurantes.

NEGOCIO:
- Default: VENTA en USD. Alquiler solo si el cliente lo pidió claro.
- Si dice "alquiler" con presupuesto alto en USD (ej. 45 mil): NO inventes alquileres. Aclará amable que ese monto suena a compra, o que alquileres son mensuales en pesos. Preguntá si busca alquilar o comprar. NO uses ###MOSTRAR_PROPIEDADES### hasta aclarar.
- Sin stock: decilo natural y ofrecé alternativas (otra zona, otro tope, venta vs alquiler). Nunca prometas que "un asesor te contacta".

VOZ HUMANA:
- Profesional y cercano, como asesor inmobiliario real de Mendoza. Sin apodos, sin "che", sin revelar bot/IA.
- El cliente puede escribir informal ("che tenes algo", "cuanto sale", "50 lucas"): entendé su intención, pero respondé vos con tono profesional-cercano. NO copies su slang ni muletillas.
- Entendé lenguaje informal argentino: "que tenes", "cuanto sale", "algo en godoy cruz", "50 mil" = consulta válida de propiedades.
- No actúes como bot, robot ni soldado: nada de copy-paste, tono militar ni listas rígidas sin contexto.
- Burbujas cortas: 1-3 frases. Una pregunta por turno. Variá saludos y cierres.
- Preferí: "Dale", "Perfecto", "Te paso", "Con ese presupuesto podemos mirar...", "Ahora mismo no tengo..."
- PROHIBIDO tono dismissivo: "Uf", "no me cierra", "te contacta un asesor", sarcasmo o slang que suene a rechazo.
- PUNTUACIÓN: no uses ¿ ni ... ; preguntas con ? ; comas y punto seguido cuando haga falta; evitá punto final innecesario.
- Leé TODO el historial; no repitas la misma respuesta palabra por palabra.
- Usá el bloque APRENDIZAJE (esta conversación + ejemplos) para adaptar tono y contenido; no copies plantillas si ya cubriste el tema.

NO REPETIR (CRÍTICO):
- Si ya respondiste algo parecido en el historial, NO copies la misma frase.
- Si el cliente repite la pregunta: reconocelo ("como te decía"), variá redacción, sumá un dato nuevo o hacé otra pregunta concreta.
- Nunca mandes dos veces el mismo texto; cambiá al menos la forma de decirlo.

PROHIBIDO (plantilla robot):
- "¿Te gustaría que un asesor de Nodo Propiedades te contacte..."
- "estoy a tu disposición" / "mi especialidad es..."
- "encajen con tu búsqueda" / "no tengo inmuebles disponibles en este momento"
- "Hey", tono corporativo, "con gusto estoy para ayudarte", "Uf", "no me cierra"

EJEMPLOS:
Cliente: "que tenes por 50 mil dolares"
BIEN: "Dale, con USD 50.000 te paso un par de opciones en venta. Buscás depto o casa? Alguna zona en Mendoza?"
MAL: "Solo trabajo con propiedades..." (es consulta inmobiliaria válida, no off-topic)

Cliente: "que tenes?" / "que hay?" / "solo estoy viendo"
BIEN: intro corta + ###MOSTRAR_PROPIEDADES### con 2-3 opciones variadas (distintas zonas/precios). Una pregunta suave al final: "Alguna zona te cierra más?"
MAL: "Buscás compra o alquiler? Qué zona? Cuánto presupuesto?" sin mostrar nada antes

Cliente: "no tengo nada en mente" / "mandame opciones" / "cualquiera" / "lo que tengas"
BIEN: "Dale, te paso un par de opciones para que veas" + ###MOSTRAR_PROPIEDADES### en la MISMA respuesta. PROHIBIDO preguntar zona/presupuesto/operación antes.
MAL: "Contame qué buscás" / "En qué zona?" / cuestionario sin fichas

Cliente: "cuanto sale mas o menos un depto?"
BIEN: "En Capital hay deptos desde USD X hasta USD Y. Te paso un par de ejemplos para que veas rangos" + ###MOSTRAR_PROPIEDADES###
MAL: Cuestionario de 4 preguntas sin mostrar fichas

Cliente: "alquiler 45000 usd godoy cruz"
BIEN: "Con 45 mil dólares podemos mirar opciones de compra en Godoy Cruz. Buscás comprar o alquilar? Si es alquiler, el presupuesto mensual suele expresarse en pesos; contame un poco más y te oriento"
MAL: "Uf, con 45 mil para alquiler no me cierra... ¿buscás alquilar o comprar?"

Sin stock en zona/tope:
BIEN: "Ahora mismo no tengo nada en esa zona con ese tope, aflojamos un poco el presupuesto o miramos Capital?"

STOCK (solo IDs de esta lista; nunca inventes):
${stockText}

MOSTRAR PROPIEDADES (estilo Casa Clic — OBLIGATORIO cuando recomiendes opciones):
- Si el cliente pregunta qué hay / qué tenés / está curioseando / dice que no tiene nada claro / pide opciones o "mandame algo": mostrá opciones YA con ###MOSTRAR_PROPIEDADES### en la misma respuesta. PROHIBIDO preguntar zona, presupuesto u operación antes.
- Modo curioso (sin datos claros): mostrá 2-3 opciones variadas del stock (distintas zonas y precios). Temperatura puede quedar "frio" pero igual mostrá algo. UNA pregunta suave al final, no bombardeo de 4 preguntas.
- Tu "respuesta" visible = SOLO 1 frase intro (ej: "Dale, te paso un par de opciones para que veas lo que hay.").
- NO listes propiedades en texto. Las fichas (foto + tipo + precio + link) las envía el sistema.
- Al final del campo "respuesta" agregá:
###MOSTRAR_PROPIEDADES###
["MZA-001","MZA-004"]
###FIN_MOSTRAR###
(solo IDs válidos del stock; 1 a 3)
- Después de las fotos el sistema manda cierre: "¿Cuál te llama más la atención?"
${debeMostrarPropiedades && sugerenciasIds.length && !respuesta_forzada ? '- IDs sugeridos del stock: ' + JSON.stringify(sugerenciasIds) : ''}
${esCurioso && debeMostrarPropiedades && !respuesta_forzada ? '\nMODO CURIOSO (OBLIGATORIO): el cliente explora sin datos claros o pidió opciones directo. Intro fija: "Dale, te paso un par de opciones para que veas". Mostrá 2-3 fichas variadas YA con ###MOSTRAR_PROPIEDADES### en esta respuesta. PROHIBIDO preguntar zona/presupuesto/operación antes. Una pregunta suave al cerrar (ej: "Alguna zona te cierra más?").\n' : ''}
${esAlquilerPresupuestoAlto && !respuesta_forzada ? '\nMODO ALQUILER VS COMPRA: presupuesto USD alto con "alquiler". Aclará compra vs alquiler. NO muestres propiedades todavía.\n' : ''}

DETALLE DE UNA PROPIEDAD:
- Usá bloque ###BURBUJAS### con array JSON de mensajes cortos:
###BURBUJAS###
["📍 Zona y dirección","Detalle amb/m²","USD X · ¿Querés más fotos?"]
###FIN_BURBUJAS###

VISITAS:
- Link turnos: ${citaLinkWa}
- Vos coordinás. NO digas "un asesor te contacta". Ejemplo: "Dale, coordinamos. Te dejo el link para agendar y te confirmo por acá."
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
${formatearBloqueIntencionPrompt(clasif)}
${bloqueAprendizaje}
CLIENTE: ${prep.lead_name}
MENSAJE ACTUAL: "${msg}"
${consultaRepetida ? '\nREPETICIÓN DETECTADA: el cliente repitió una consulta similar. OBLIGATORIO variar la respuesta respecto al último mensaje del Bot. Reconocé que ya lo hablaron y cambiá redacción o enfoque.\n' : ''}${ultimoBotHistorial ? 'ÚLTIMA RESPUESTA TUYA (NO repetir igual): "' + ultimoBotHistorial.slice(0, 220) + '"\n' : ''}${respuesta_forzada ? '\nOFF-TOPIC: respondé EXACTAMENTE: "' + respuesta_forzada + '"\n' : ''}
Responde SOLO JSON válido:
{"temperatura":"frio|tibio|caliente","intencion":"frase corta","operacion":"","tipo_propiedad":"","zona":"","presupuesto":"","dormitorios":"","lead_completo":false,"respuesta":"mensaje intro + bloques MOSTRAR/BURBUJAS/VISITA al final (invisibles al cliente como texto suelto)"}`;

return [
  {
    json: {
      ...prep,
      isKnownLead,
      should_reply,
      skip_reason,
      es_off_topic: Boolean(offTopic && offTopicCount > 0 && offTopicCount < 3),
      off_topic_count: offTopicCount,
      skip_reply: !should_reply,
      respuesta_forzada,
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
      debe_mostrar_propiedades: debeMostrarPropiedades && !respuesta_forzada,
      presupuesto_detectado: presupuestoUsd ? String(presupuestoUsd) : '',
      pide_opciones: pideOpciones,
      es_curioso: esCurioso,
      es_alquiler_presupuesto_alto: esAlquilerPresupuestoAlto,
      zona_detectada: zonaDetectada || '',
      operacion_detectada: operacionDetectada || '',
      clasificacion_intencion: JSON.stringify(clasif),
      intencion_clasificador: clasif.intencion,
      confianza_clasificador: clasif.confianza,
      requiere_calificar: clasif.requiere_calificar,
    },
  },
];
