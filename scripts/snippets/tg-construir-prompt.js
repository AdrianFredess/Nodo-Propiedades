/**
 * Bot Telegram — Construir Prompt (asesor humano + stock + memoria local)
 */
const PROP_MEDIA = __PROP_MEDIA_JSON__;

const setVars = $('Set Variables').first().json;
const chatId = String(setVars.chat_id || '');
const textoUsuario = String(setVars.texto_usuario || '').trim();
const nombreUsuario = setVars.nombre_usuario;

const citaBase =
  'https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-form';
const citaLink =
  citaBase +
  '?chat_id=' +
  encodeURIComponent(chatId) +
  '&nombre=' +
  encodeURIComponent(String(nombreUsuario || '')) +
  '&canal=telegram';

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  return '';
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

function extractOperacion(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(alquil|rent)/i.test(t)) return 'alquiler';
  if (/\b(compr|venta|vend)/i.test(t)) return 'compra';
  return '';
}

function extractPropiedadId(text, segId) {
  const m = String(text || '').match(/\b(MZA-\d{3})\b/i);
  if (m) return m[1].toUpperCase();
  if (
    segId &&
    /\b(esa|esta|la misma|la propiedad|la opción|la opcion)\b/i.test(text)
  ) {
    return segId;
  }
  return segId || '';
}

function esPreguntaEspecifica(text) {
  return /\b(cocina|baño|bano|garage|cochera|luminos|integrad|balc[oó]n|patio|expens|amenit|mascota|cr[eé]dit|escritur|orientaci[oó]n|antig[uü]edad|m2|m²|metros|ambientes|dormitorio|suite|termotanque|calefacci[oó]n|pileta|parrilla|seguridad|portero)\b/i.test(
    text,
  );
}

function esDetalleUnaPropiedad(text, propId) {
  if (!propId) return false;
  if (/\b(MZA-\d{3})\b/i.test(text)) return true;
  return /\b(m[aá]s info|m[aá]s detalle|contame|cu[aá]nto sale|precio de|fotos de|caracter[ií]stica|detalle de|ubicaci[oó]n de|d[oó]nde queda)\b/i.test(
    text,
  );
}

function mediaFor(id) {
  if (!id) return null;
  return PROP_MEDIA[id] || PROP_MEDIA[String(id).toUpperCase()] || null;
}

let historialItems = [];
try {
  historialItems = $('Leer Historial').all();
} catch (e) {
  historialItems = [];
}

let stockItems = [];
try {
  stockItems = $('Leer Stock Propiedades')
    .all()
    .map((item) => item.json)
    .filter(
      (row) =>
        row &&
        typeof row === 'object' &&
        !(
          typeof row.error === 'string' &&
          /authorization grant|invalid_grant|token is invalid|OAuth2/i.test(
            row.error,
          )
        ) &&
        !(
          Object.keys(row).length === 1 &&
          Object.prototype.hasOwnProperty.call(row, 'error')
        ),
    );
} catch (e) {
  stockItems = [];
}

let politicasRows = [];
try {
  politicasRows = $('Leer Politicas Pago')
    .all()
    .map((item) => item.json)
    .filter(
      (row) =>
        row &&
        typeof row === 'object' &&
        !row.error &&
        (row.clave || row.key || row.tema || row.concepto),
    );
} catch (e) {
  politicasRows = [];
}

function rowToStockLine(row) {
  const id = pick(row, ['id', 'ID', 'codigo']);
  const tipo = pick(row, ['tipo', 'Tipo', 'tipologia']);
  const zona = pick(row, ['zona', 'Zona', 'barrio']);
  const precio = pick(row, ['precio', 'Precio', 'precio_usd']);
  const operacion = pick(row, ['operacion', 'Operacion', 'tipo_operacion']);
  const desc = pick(row, ['descripcion', 'Descripcion', 'detalle']);
  const estado = pick(row, ['estado', 'Estado', 'stock']) || 'disponible';
  const m = mediaFor(id);
  const linkFicha = m?.linkFicha || pick(row, ['link_ficha', 'linkFicha']);
  const bits = [tipo, zona, operacion ? 'op:' + operacion : '', precio, desc].filter(Boolean);
  const head = id ? '[' + id + '] ' : '';
  const linkBit = linkFicha ? ' | ficha:' + linkFicha : '';
  return head + bits.join(' | ') + linkBit + (estado ? ' (' + estado + ')' : '');
}

function sugerirIds(stock, budgetUsd, zonaHint) {
  const scored = [];
  for (const row of stock) {
    const id = pick(row, ['id', 'ID', 'codigo']);
    const precio = parseUsd(pick(row, ['precio', 'Precio']));
    const zona = pick(row, ['zona', 'Zona']).toLowerCase();
    if (!id || !precio) continue;
    let score = Math.abs(precio - (budgetUsd || precio));
    if (budgetUsd && precio > budgetUsd * 1.18) score += 50000;
    if (budgetUsd && precio < budgetUsd * 0.45) score += 30000;
    if (zonaHint && zona.includes(zonaHint.split(' ')[0])) score -= 15000;
    scored.push({ id, score, precio });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 3).map((x) => x.id);
}

let stockText = '';
if (stockItems.length) {
  stockText = stockItems.map(rowToStockLine).map((l) => '- ' + l).join('\n');
} else {
  stockText =
    '- (Sin stock cargado. Pedí datos al cliente y ofrecé que un asesor le escribe.)';
}

const FALLBACK_POLITICAS = [
  'transferencia: coordinar con la inmobiliaria.',
  'efectivo: en oficina con comprobante.',
  'reserva: seña según operación; no inventar montos.',
  'honorarios: ver stock o confirmar con asesor.',
].join('\n');

let politicasText = '';
if (politicasRows.length) {
  politicasText = politicasRows
    .map((row) => {
      const clave = pick(row, ['clave', 'key', 'tema', 'concepto']);
      const valor = pick(row, ['valor', 'value', 'detalle', 'descripcion']);
      if (!clave) return '';
      return '- ' + clave + ': ' + (valor || '(sin detalle)');
    })
    .filter(Boolean)
    .join('\n');
}
if (!politicasText) {
  politicasText = FALLBACK_POLITICAS.split('\n')
    .map((l) => '- ' + l)
    .join('\n');
}

const matchRow = historialItems.find(
  (item) => item.json && String(item.json.chat_id) === chatId,
);

let historialJson = [];
let turno = 1;
let rowExists = false;
let propiedadSeguimientoPrev = '';
let ultimaActualizacionStr = '';
let diasSinContacto = 0;

if (matchRow?.json?.chat_id) {
  const row = matchRow.json;
  rowExists = true;
  turno = parseInt(row.turno || 0, 10) + 1;
  propiedadSeguimientoPrev = String(row.propiedad_seguimiento || '').trim();
  ultimaActualizacionStr = String(row.ultima_actualizacion || '').trim();
  try {
    historialJson = JSON.parse(row.historial_json || '[]');
  } catch (e) {
    historialJson = [];
  }
  if (ultimaActualizacionStr) {
    const t = new Date(ultimaActualizacionStr);
    if (!isNaN(t.getTime())) {
      diasSinContacto = Math.floor((Date.now() - t.getTime()) / 86400000);
    }
  }
}

const sd = $getWorkflowStaticData('global');
if (!sd.historialByChat) sd.historialByChat = {};
const cachedHist = sd.historialByChat[chatId];
if (Array.isArray(cachedHist) && cachedHist.length > historialJson.length) {
  historialJson = cachedHist;
}

const textoHistorial = historialJson
  .map((m) => String(m?.content || ''))
  .join('\n');
const textoCompleto = (textoHistorial + '\n' + textoUsuario).trim();

let presupuestoUsd =
  extractPresupuestoUsd(textoUsuario) || extractPresupuestoUsd(textoHistorial);
let zonaDetectada =
  extractZona(textoUsuario) || extractZona(textoHistorial) || '';
let operacionDetectada =
  extractOperacion(textoUsuario) || extractOperacion(textoHistorial) || '';

const pideOpciones =
  /\b(mandame|mandá|mostrame|mostrá|pasame|pasá|que ten[eé]s|qué ten[eé]s|opciones|ver algo|lo que tengas|lo que tengan|catalogo|catálogo|mostrar|enviame|enviá|algo para|propiedades para|dentro de|hasta)\b/i.test(
    textoUsuario,
  ) ||
  (Boolean(presupuestoUsd) &&
    /\b(tengo|presupuesto|usd|u\$s|dolar|busco|quiero)\b/i.test(textoUsuario));
const esSoloSaludo =
  textoUsuario.length < 50 &&
  !/\b(depto|casa|alquil|compr|venta|propiedad|precio|usd|\d|zona|mendoza)\b/i.test(
    textoUsuario,
  ) &&
  /^(hola|buen[oa]s?\s*(d[ií]as|tardes|noches)?|buenas|qué tal|que tal|como est[aá]s)\s*[!.?]*$/i.test(
    textoUsuario.trim(),
  );
const esSaludo =
  /^(hola|buen[oa]s?\s*(d[ií]as|tardes|noches)?|como est[aá]s|qué tal)/i.test(
    textoUsuario.trim(),
  ) && textoUsuario.length < 55;
const frustrado =
  /\b(ya te dije|te dije|otra vez|no entend)/i.test(textoUsuario);

const sugerenciasIds =
  stockItems.length > 0
    ? sugerirIds(stockItems, presupuestoUsd, zonaDetectada)
    : [];

const debeMostrarPropiedades =
  stockItems.length > 0 &&
  (pideOpciones ||
    frustrado ||
    Boolean(presupuestoUsd) ||
    /\b(propiedad|propiedades|depto|departamento|casa|ten[eé]s|tienen)\b/i.test(
      textoUsuario,
    ));

let refSeg = '';
let idSeg = '';
if (propiedadSeguimientoPrev) {
  try {
    const o = JSON.parse(propiedadSeguimientoPrev);
    if (o?.referencia) refSeg = String(o.referencia);
    if (o?.id) idSeg = String(o.id);
    if (!refSeg && o?.id) refSeg = String(o.id);
  } catch (e) {
    refSeg = propiedadSeguimientoPrev.slice(0, 117);
  }
}

const propiedadConsultada = extractPropiedadId(textoUsuario, idSeg);
const preguntaEspecifica =
  esPreguntaEspecifica(textoUsuario) && !pideOpciones && !presupuestoUsd;
const detalleUnaPropiedad =
  esDetalleUnaPropiedad(textoUsuario, propiedadConsultada) && !pideOpciones;

const datosConocidos = {
  presupuesto_usd: presupuestoUsd || null,
  presupuesto_texto: presupuestoUsd ? 'USD ' + presupuestoUsd : '',
  zona: zonaDetectada || '(no indicó)',
  operacion: operacionDetectada || '(no indicó)',
};

let modoObligatorio = '';
if (preguntaEspecifica && (propiedadConsultada || idSeg)) {
  modoObligatorio =
    '\n\nMODO PREGUNTA ESPECÍFICA (OBLIGATORIO):\n' +
    '- El cliente pregunta algo concreto sobre la propiedad ' +
    (propiedadConsultada || idSeg) +
    '.\n' +
    '- Respondé DIRECTO en 1-3 frases. NO re-califiques (zona, presupuesto, operación).\n' +
    '- PROHIBIDO: "¿Me podrías indicar...?", "Para ayudarte mejor...", cuestionario.\n' +
    '- Si el dato no está en el STOCK, decilo con honestidad y ofrecé confirmar con asesor.\n' +
    '- Podés usar ###BURBUJAS### con 2-3 mensajes cortos si ayuda a leer.\n';
} else if (detalleUnaPropiedad && propiedadConsultada) {
  modoObligatorio =
    '\n\nMODO DETALLE UNA PROPIEDAD (OBLIGATORIO):\n' +
    '- El cliente pide info de ' +
    propiedadConsultada +
    '. NO uses ###MOSTRAR_PROPIEDADES###.\n' +
    '- Usá ###BURBUJAS### con 2-4 mensajes cortos (ubicación → detalle → precio).\n' +
    '- Ejemplo:\n' +
    '###BURBUJAS###\n' +
    '["📍 Belgrano 320, Capital Mendoza","3 amb, luminoso, cocina integrada, SUM","USD 112.000 · ¿Querés más fotos?"]\n' +
    '###FIN_BURBUJAS###\n' +
    '- Solo datos del STOCK. Default venta USD.\n';
} else if (debeMostrarPropiedades && sugerenciasIds.length) {
  modoObligatorio =
    '\n\nMODO MOSTRAR PROPIEDADES (OBLIGATORIO):\n' +
    '- El cliente pidió opciones o dio presupuesto. NO listes propiedades en el texto.\n' +
    '- Tu mensaje visible = SOLO 1 frase intro (ej: "¡Claro! Acá te muestro opciones dentro de tu presupuesto.").\n' +
    '- Las fichas van en fotos con caption (el sistema las arma). Vos solo intro + bloque técnico.\n' +
    '- IDs sugeridos del stock real: ' +
    JSON.stringify(sugerenciasIds) +
    '\n' +
    '- Incluí ###MOSTRAR_PROPIEDADES### con esos IDs. PROHIBIDO inventar propiedades o precios.\n' +
    '- Asumí VENTA/COMPRA salvo que el cliente dijo alquiler explícitamente.\n' +
    '- NO digas "al año" ni inventes alquiler.\n';
} else if (esSoloSaludo && turno <= 2) {
  modoObligatorio =
    '\n\nMODO SALUDO (OBLIGATORIO — copiá el estilo del ejemplo):\n' +
    '- Solo saludá y presentate. CERO preguntas de compra/alquiler/venta/zona/presupuesto.\n' +
    '- CERO urgencia. El cliente recién llegó.\n' +
    '- PROHIBIDO: "Hey", "¡Hey!", "¿Qué buscás?", listar compra/alquiler/venta.\n' +
    '- BIEN: "Hola, ¿cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás."\n' +
    '- MAL: "¡Hey! ¿Qué buscás, compra, alquiler o venta?"\n' +
    '- Una o dos frases tranquilas. Sin signos de exclamación exagerados.\n';
} else if (esSaludo && turno <= 2) {
  modoObligatorio =
    '\n\nMODO SALUDO:\n' +
    '- Respondé el saludo con calma. No califiques al cliente todavía.\n' +
    '- No preguntes compra/alquiler/venta en el primer mensaje.\n';
}

const systemPrompt =
  'Sos Matías, asesor de Nodo Propiedades en Mendoza. Atendés como una persona real, con paciencia.\n\n' +
  'VOZ DE ASESOR HUMANO (no vendedor apurado):\n' +
  '- Tranquilo, cercano, profesional. Como un asesor que tiene tiempo.\n' +
  '- NUNCA apures al cliente ni hagas cuestionario al inicio.\n' +
  '- PROHIBIDO: "Hey", "¡Hey!", "¿Qué buscás, compra, alquiler o venta?", múltiples preguntas seguidas.\n' +
  '- PROHIBIDO: "¿Me podrías indicar...?", sonar a formulario o bot.\n' +
  '- Si solo te saludan → saludá, presentate, quedá disponible. Nada más.\n' +
  '- Cuando el cliente cuente qué busca, recién ahí orientá con una pregunta suave si hace falta.\n' +
  '- Preferí: "Dale", "Perfecto", "Te paso", "Con ese presupuesto tengo...".\n' +
  '- Sin "che". Sin decir bot/IA.\n' +
  '- Máximo UNA pregunta por mensaje, y solo cuando ya hubo intercambio real.\n\n' +
  'EJEMPLOS DE SALUDO:\n' +
  'Cliente: "hola"\n' +
  'BIEN: "Hola, ¿cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás."\n' +
  'MAL: "¡Hey! ¿Qué buscás, compra, alquiler o venta?"\n\n' +
  'DATOS_CONOCIDOS (extraídos del chat — respetalos):\n' +
  JSON.stringify(datosConocidos, null, 2) +
  '\n\n' +
  'CONTEXTO:\n' +
  '- Turno: ' +
  turno +
  '\n' +
  '- Días sin contacto: ' +
  (ultimaActualizacionStr ? diasSinContacto : 'sin_dato') +
  '\n' +
  '- Propiedad en seguimiento: ' +
  (refSeg || 'ninguna') +
  modoObligatorio +
  '\n\nSTOCK (solo IDs de esta lista):\n' +
  stockText +
  '\n\nMOSTRAR PROPIEDADES (estilo asesor humano — como Casa Clic):\n' +
  '- Cuando muestres opciones: texto intro de 1 frase + bloque ###MOSTRAR_PROPIEDADES###.\n' +
  '- NO escribas listas con guiones ni párrafos largos con cada propiedad.\n' +
  '- Las fichas (foto + tipo + precio + link) las envía el sistema automáticamente.\n' +
  '- Después de las fotos el sistema manda cierre suave ("¿Cuál te interesa?").\n' +
  '- Solo IDs del STOCK. Nunca inventes direcciones, precios ni m².\n' +
  '- Default: VENTA en USD. Alquiler solo si el cliente lo pidió.\n' +
  '###MOSTRAR_PROPIEDADES###\n["MZA-003","MZA-011"]\n###FIN_MOSTRAR###\n\n' +
  'DETALLE DE UNA PROPIEDAD (si preguntan por una específica):\n' +
  '- Usá ###BURBUJAS### con array JSON: ubicación → detalle → precio.\n' +
  '- Cerrá con pregunta suave: "¿Qué te parece?" o "¿Querés que te pase más fotos?"\n' +
  '###BURBUJAS###\n["📍 Zona y dirección","Detalle amb/m²","USD X · ¿Querés más fotos?"]\n###FIN_BURBUJAS###\n\n' +
  'PREGUNTA ESPECÍFICA (cocina, garage, etc.):\n' +
  '- Respondé directo. NO vuelvas a preguntar zona/presupuesto/operación.\n\n' +
  'VISITAS:\n' +
  '- Link turnos: ' +
  citaLink +
  '\n' +
  '- Si confirma visita con asesor:\n' +
  '"Perfecto, ya le avisé a un asesor de Nodo Propiedades para que se ponga en contacto con vos en breve y coordinen una visita.\\n\\nCualquier cosa que necesites, estoy acá."\n' +
  '###SOLICITUD_VISITA###\n{"propiedad_id":"ID","zona":"...","presupuesto":"...","nota":"..."}\n###FIN_VISITA###\n\n' +
  'POLITICAS_PAGO:\n' +
  politicasText +
  '\n\nAl final: ###ESTADO_ACTUAL:frio|tibio|caliente###\n' +
  'LEAD COMPLETO (si tenés nombre, zona, presupuesto, operación):\n' +
  '###LEAD_COMPLETO###\n{...}\n###FIN_LEAD###\n' +
  'SEGUIMIENTO:\n###PROPIEDAD_SEGUIMIENTO###\n{"id":"...","referencia":"..."}\n###FIN_PROP###';

const messages = [{ role: 'system', content: systemPrompt }];
if (esSoloSaludo) {
  messages.push({ role: 'user', content: 'hola' });
  messages.push({
    role: 'assistant',
    content:
      'Hola, ¿cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás.',
  });
}
for (const msg of historialJson) {
  if (msg && msg.role && msg.content) messages.push(msg);
}
messages.push({ role: 'user', content: textoUsuario });

return [
  {
    json: {
      chat_id: chatId,
      texto_usuario: textoUsuario,
      nombre_usuario: nombreUsuario,
      messages: messages,
      historial_json: historialJson,
      turno: turno,
      row_exists: rowExists,
      propiedad_seguimiento_actual: propiedadSeguimientoPrev,
      dias_sin_contacto: diasSinContacto,
      politicas_source: politicasRows.length ? 'sheets' : 'fallback',
      sugerencias_ids: JSON.stringify(sugerenciasIds),
      debe_mostrar_propiedades: debeMostrarPropiedades,
      presupuesto_detectado: presupuestoUsd ? String(presupuestoUsd) : '',
      pide_opciones: pideOpciones,
      es_solo_saludo: esSoloSaludo,
      propiedad_consultada: propiedadConsultada,
      es_pregunta_especifica: preguntaEspecifica,
      es_detalle_una: detalleUnaPropiedad,
    },
  },
];
