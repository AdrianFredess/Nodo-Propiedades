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
  m = t.match(/(\d{2,3})\s*mil\b/i);
  if (m && !/\b(alquil|mensual|por mes)\b/i.test(t)) return parseInt(m[1], 10) * 1000;
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

const ON_TOPIC_RE =
  /\b(depto|departamento|casa|lote|local|oficina|alquiler|alquil[oaá]|comprar|compra|venta|vender|propiedad|propiedades|inmueble|inmobiliaria|presupuesto|usd|u\$s|dolares|dólares|visita|escritur|expensas|cochera|garage|ambientes|dormitorio|habitaci[oó]n|m2|m²|mza-\d+|nodo|inversi[oó]n|dueño|dueno|inquilino|seña|senia|reserva)\b/i;
const PIDE_STOCK_RE =
  /\b(que ten[eé]s|qué ten[eé]s|que hay|qué hay|que venden|qué venden|que tienen|qué tienen|algo por|opciones por|ten[eé]s algo|tienen algo|lo que tengas|lo que tengan|mostrame|mostrá|mandame|mandá|pasame|pasá|ver algo|algo para ver|catalogo|catálogo|enviame|enviá|cu[aá]nto sale|a cu[aá]nto|precio de|cu[aá]nto cuesta|alg[uú]n depto|alg[uú]na casa|ten[eé]s algo|solo (estoy )?(viendo|mirando|curioseando)|solo quiero ver|de curioso|para ver nomas|para saber nomas|nomas (quiero|para) ver)\b/i;
const NO_TENGO_CLARO_RE =
  /\b(no tengo (nada )?(claro|en mente|definido)|no s[eé] (tanto|mucho|bien|nada)?|nose|no estoy seguro|sin criterio|sin idea|no defin[ií]|a[uú]n no s[eé]|todav[ií]a no s[eé]|me da igual|cualquier cosa)\b/i;
const PIDE_OPCIONES_DIRECTO_RE =
  /\b(mandame opciones|mandá opciones|enviame opciones|enviá opciones|pasame opciones|pasá opciones|dame opciones|mandame algo|mandá algo|mostrame algo|mostrá algo|no se,? mostr[aá]|no sé,? mostr[aá]|cualquiera|ver opciones|quiero ver|algo para ver|que me recomend[aá]s|qué me recomend[aá]s|sorprendeme|sorprendeme)\b/i;
const CURIOSO_RE =
  /\b(que venden|qué venden|que tienen|qué tienen|solo (estoy )?(viendo|mirando|curioseando)|solo quiero ver|de curioso|por curiosidad|para ver nomas|para saber nomas|nomas (quiero|para) ver|algo para ver|que hay en stock|que tenes\??|qué tenés\??|que hay\??|qué hay\??|mostrame algo|mostrá algo|pasame algo|cualquiera|lo que tengas|lo que tengan)\b/i;
const OFF_TOPIC_RE =
  /\b(comer|comida|restaurante|almorzar|cenar|desayun|hambur|pizza|asado|birra|cerveza|hambre|tengo hambre|necesito comer|d[oó]nde (puedo|se puede) comer|herramienta|ferreter|construcci[oó]n|supermercado|farmacia|clima|llueve|partido|f[uú]tbol|netflix|receta|cocinar|ropa|zapatillas|celular|auto usado|mecanico|mecánico)\b/i;
const ACK_RE =
  /^(ok|dale|gracias|si|sí|no|bueno|perfecto|listo|jajaja|jaja|de una|genial|bárbaro|barbaro|copado)\s*[!.?]*$/i;

function esOnTopicInmobiliario(text, presupuestoUsd) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (presupuestoUsd && !OFF_TOPIC_RE.test(t)) return true;
  if (PIDE_STOCK_RE.test(t) && !OFF_TOPIC_RE.test(t)) return true;
  if (
    (PIDE_OPCIONES_DIRECTO_RE.test(t) || NO_TENGO_CLARO_RE.test(t)) &&
    !OFF_TOPIC_RE.test(t)
  ) {
    return true;
  }
  if (ON_TOPIC_RE.test(t) && !OFF_TOPIC_RE.test(t)) return true;
  if (
    ON_TOPIC_RE.test(t) &&
    /\b(depto|departamento|casa|lote|propiedad|alquiler|compr|venta|inmueble|visita|presupuesto|mza-\d+)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

function esOffTopicMsg(text, esSaludoFlag, presupuestoUsd, pideOpcionesFlag) {
  const t = String(text || '').trim();
  if (!t || esSaludoFlag) return false;
  if (ACK_RE.test(t)) return false;
  if (presupuestoUsd || pideOpcionesFlag) return false;
  if (
    PIDE_OPCIONES_DIRECTO_RE.test(t) ||
    NO_TENGO_CLARO_RE.test(t) ||
    PIDE_STOCK_RE.test(t)
  ) {
    return false;
  }
  if (esOnTopicInmobiliario(t, presupuestoUsd)) return false;
  if (OFF_TOPIC_RE.test(t)) return true;
  if (
    /\b(vendes|venden|ten[eé]s|tienen|ofrecen|trabajan con)\b/i.test(t) &&
    !ON_TOPIC_RE.test(t) &&
    !PIDE_STOCK_RE.test(t) &&
    !presupuestoUsd
  ) {
    return true;
  }
  return false;
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

function sugerirIdsVariados(stock) {
  const rows = [];
  for (const row of stock) {
    const id = pick(row, ['id', 'ID', 'codigo']);
    const precio = parseUsd(pick(row, ['precio', 'Precio']));
    const zona = pick(row, ['zona', 'Zona']).toLowerCase();
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

let stockText = '';
if (stockItems.length) {
  stockText = stockItems.map(rowToStockLine).map((l) => '- ' + l).join('\n');
} else {
  stockText =
    '- (Sin stock cargado. Pedí zona y presupuesto; no inventes propiedades.)';
}

const FALLBACK_POLITICAS = [
  'transferencia: coordinar con la inmobiliaria.',
  'efectivo: en oficina con comprobante.',
  'reserva: seña según operación; no inventar montos.',
  'honorarios: ver stock o confirmar después.',
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
if (!sd.offTopicCount) sd.offTopicCount = {};
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

const clasif = clasificarIntencionCliente(textoUsuario, textoHistorial, {
  stockDisponible: stockItems.length > 0,
  historialJsonArr: historialJson,
});

presupuestoUsd = clasif.presupuesto_usd || presupuestoUsd;
zonaDetectada = clasif.zona || zonaDetectada;
operacionDetectada = clasif.operacion || operacionDetectada;

const esCurioso = clasif.modo_curioso;
const pideOpciones =
  clasif.intencion === 'pedir_opciones' || clasif.mostrar_stock || esCurioso;
const esSoloSaludo =
  clasif.intencion === 'saludo' &&
  textoUsuario.length < 50 &&
  !/\b(depto|casa|alquil|compr|venta|propiedad|precio|usd|\d|zona|mendoza)\b/i.test(
    textoUsuario,
  );
const esSaludo =
  clasif.es_saludo ||
  (/^(hola|buen[oa]s?\s*(d[ií]as|tardes|noches)?|como est[aá]s|qué tal)/i.test(
    textoUsuario.trim(),
  ) &&
    textoUsuario.length < 55);
const frustrado =
  /\b(ya te dije|te dije|otra vez|no entend)/i.test(textoUsuario);

const onTopicAhora =
  !clasif.es_off_topic || clasif.mostrar_stock || esSaludo || esSoloSaludo;
const offTopicAhora = clasif.es_off_topic && !clasif.mostrar_stock && !esSaludo;
let offTopicCount = Number(sd.offTopicCount[chatId] || 0) || 0;
if (onTopicAhora) {
  offTopicCount = 0;
} else if (offTopicAhora) {
  offTopicCount += 1;
}
sd.offTopicCount[chatId] = offTopicCount;
const skipReply = offTopicCount >= 3;
const esOffTopic = offTopicAhora && !onTopicAhora;

const sugerenciasIds =
  stockItems.length > 0
    ? presupuestoUsd || zonaDetectada
      ? sugerirIds(stockItems, presupuestoUsd, zonaDetectada)
      : sugerirIdsVariados(stockItems)
    : [];

const debeMostrarPropiedades =
  stockItems.length > 0 &&
  (clasif.mostrar_stock || frustrado);

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

const esAlquilerPresupuestoAlto =
  operacionDetectada === 'alquiler' &&
  Boolean(presupuestoUsd) &&
  presupuestoUsd >= 15000;

function esConsultaRepetidaPrompt(mensaje, historialArr) {
  const actualRaw = String(mensaje || '').trim();
  if (!actualRaw || !Array.isArray(historialArr) || historialArr.length === 0)
    return false;

  // Normalización determinística: lowercase + quitar puntuación/símbolos + colapsar espacios
  const normalizar = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-záéíóúñü0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const na = normalizar(actualRaw);
  if (!na) return false;

  const users = historialArr
    .filter((m) => String((m && m.role) || '').toLowerCase() === 'user')
    .map((m) => normalizar((m && m.content) || ''))
    .filter(Boolean);

  // "Último mensaje del cliente" (actualRaw) vs "anteúltimo" (último user en historial)
  if (users.length < 1) return false;
  const previo = users[users.length - 1];
  if (!previo) return false;

  if (na === previo) return true;

  const tokensA = na.split(' ').filter((w) => w.length > 2);
  const tokensB = previo.split(' ').filter((w) => w.length > 2);
  if (!tokensA.length || !tokensB.length) return false;

  const setB = new Set(tokensB);
  let inter = 0;
  for (const w of tokensA) if (setB.has(w)) inter++;
  const ratio = inter / tokensA.length;
  return ratio >= 0.9;
}

const consultaRepetida = esConsultaRepetidaPrompt(textoUsuario, historialJson);
const aprendizajePack = armarBloqueAprendizajePrompt(
  historialJson,
  {
    operacion: datosConocidos.operacion !== '(no indicó)' ? datosConocidos.operacion : '',
    zona: datosConocidos.zona !== '(no indicó)' ? datosConocidos.zona : '',
    presupuesto: datosConocidos.presupuesto_texto || '',
  },
  textoUsuario,
  'telegram',
  clasif.intencion,
);
const bloqueAprendizaje = aprendizajePack.bloque;
const ultimoBotHistorial = (() => {
  const bots = historialJson
    .filter((m) => {
      const role = String((m && m.role) || '').toLowerCase();
      return role === 'assistant' || role === 'bot';
    })
    .map((m) => String((m && m.content) || '').trim())
    .filter(Boolean);
  return bots.length ? bots[bots.length - 1] : '';
})();

let modoObligatorio = '';
if (esOffTopic) {
  modoObligatorio =
    '\n\nMODO OFF-TOPIC (OBLIGATORIO):\n' +
    '- El mensaje NO es de inmuebles. NO ayudes con comida, restaurantes, herramientas ni otros temas.\n' +
    '- NO empatices ofreciendo recomendaciones off-topic.\n' +
    '- Respuesta ' +
    (offTopicCount <= 1
      ? '1: "Solo trabajo con propiedades. Si buscás depto o casa en Mendoza, avisame."'
      : '2 (más corta): "Acá solo propiedades. Si te interesa un depto o casa, decime."') +
    '\n' +
    '- Una sola frase. Nada más.\n';
} else if (preguntaEspecifica && (propiedadConsultada || idSeg)) {
  modoObligatorio =
    '\n\nMODO PREGUNTA ESPECÍFICA (OBLIGATORIO):\n' +
    '- El cliente pregunta algo concreto sobre la propiedad ' +
    (propiedadConsultada || idSeg) +
    '.\n' +
    '- Respondé DIRECTO en 1-3 frases. NO re-califiques (zona, presupuesto, operación).\n' +
    '- PROHIBIDO: "¿Me podrías indicar...?", "Para ayudarte mejor...", cuestionario.\n' +
    '- Si el dato no está en el STOCK, decilo con honestidad ("lo confirmo y te aviso").\n' +
    '- Podés usar ###BURBUJAS### con 2-3 mensajes cortos si ayuda a leer.\n';
} else if (
  esAlquilerPresupuestoAlto
) {
  modoObligatorio =
    '\n\nMODO ALQUILER VS COMPRA (OBLIGATORIO):\n' +
    '- El cliente dijo alquiler pero el presupuesto (USD ' +
    presupuestoUsd +
    ') suena a COMPRA/VENTA.\n' +
    '- Aclaralo amable, sin plantilla. NO inventes alquileres. NO digas que un asesor lo contacta. NO uses ###MOSTRAR_PROPIEDADES### todavía.\n' +
    '- BIEN: "Con ' +
    (presupuestoUsd >= 1000
      ? Math.round(presupuestoUsd / 1000) + ' mil'
      : String(presupuestoUsd)) +
    ' dólares podemos mirar opciones de compra' +
    (zonaDetectada ? ' en ' + zonaDetectada : '') +
    '. Buscás comprar o alquilar? Si es alquiler, el presupuesto mensual suele expresarse en pesos; contame un poco más y te oriento"\n' +
    '- MAL: "Uf, con X mil para alquiler no me cierra..." o "no tengo inmuebles disponibles... ¿Te gustaría que un asesor te contacte..."\n' +
    '- Si confirma compra → asumí VENTA USD y mostrá stock. Si insiste alquiler → pedí presupuesto mensual (pesos) y zona.\n';
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
    (esCurioso
      ? '- MODO CURIOSO: el cliente explora sin datos claros o pidió opciones directo. Intro fija: "Dale, te paso un par de opciones para que veas". Mostrá 2-3 fichas variadas YA. Sin presionar: PROHIBIDO cuestionario de zona/presupuesto/operación antes.\n'
      : '') +
    '- El cliente pidió opciones o dio presupuesto. NO listes propiedades en el texto.\n' +
    '- Tu mensaje visible = SOLO 1 frase intro (ej: "Dale, te paso un par de opciones dentro de tu presupuesto.").\n' +
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
    '- BIEN: "Hola, cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás"\n' +
    '- MAL: "¡Hey! ¿Qué buscás, compra, alquiler o venta?"\n' +
    '- Una o dos frases tranquilas. Sin signos de exclamación exagerados.\n';
} else if (esSaludo && turno <= 2) {
  modoObligatorio =
    '\n\nMODO SALUDO:\n' +
    '- Respondé el saludo con calma. No califiques al cliente todavía.\n' +
    '- No preguntes compra/alquiler/venta en el primer mensaje.\n';
}

const systemPrompt =
  'Sos Matías, asesor virtual de Nodo Propiedades en Mendoza. Vos SOS el asesor: hablás como persona real, corto, natural, argentino. Nunca derivás a "un asesor".\n\n' +
  'SOLO RUBRO:\n' +
  '- Únicamente compra/venta/alquiler de inmuebles en Mendoza.\n' +
  '- Off-topic (comida, herramientas, etc.): NO ayudes. Una frase redirigiendo a propiedades.\n\n' +
  'NEGOCIO (importante):\n' +
  '- Default: VENTA en USD. Alquiler solo si el cliente lo pidió claro.\n' +
  '- Si dice "alquiler" con presupuesto alto en USD (ej. 45 mil): NO inventes alquileres. Aclará amable que ese monto suena a compra, o que alquileres son mensuales en pesos / otro rango. Preguntá si busca alquilar o comprar.\n' +
  '- Sin stock para el pedido: decilo natural y ofrecé alternativas (otra zona, otro tope, venta vs alquiler). Nunca prometas que "un asesor te contacta".\n\n' +
  'VOZ HUMANA:\n' +
  '- Tranquilo, cercano, profesional. Frases cortas. Como asesor inmobiliario real de Mendoza, no un script ni un soldado.\n' +
  '- El cliente puede escribir informal ("che tenes algo", "cuanto sale", "50 lucas"): entendé su intención, pero respondé vos con tono profesional-cercano. NO copies su slang ni muletillas.\n' +
  '- Entendé lenguaje informal argentino: "que tenes", "cuanto sale", "algo en godoy cruz", "50 mil" = consulta válida de propiedades.\n' +
  '- No actúes como bot, robot ni soldado: nada de copy-paste, tono militar ni listas rígidas sin contexto.\n' +
  '- Si el cliente es grosero o agresivo, respondé normal y sin defensividad: intentá entender qué necesita.\n' +
  '- Si el cliente es curioso sin intención real, respondé con rango o 2-3 opciones si el stock lo permite, sin presionar.\n' +
  '- Si el mensaje es ambiguo, preguntá SOLO una cosa concreta por turno (nunca lista ni cuestionario).\n' +
  '- Variá el largo de las oraciones: mezclá frases cortas con alguna media.\n' +
  '- Preferí: "Dale", "Te paso", "Con ese presupuesto podemos mirar...", "Ahora mismo no tengo..."\n' +
  '- PROHIBIDO: "che", bot/IA, tono dismissivo ("Uf", "no me cierra", "te contacta un asesor"), sarcasmo.\n' +
  '- PROHIBIDO (modo soporte técnico): "Entiendo tu consulta", "Perfecto", "Quedo atento", "Estoy a tu disposición", "A tu disposición", "Te escribo cuando..." y frases similares.\n' +
  '- PUNTUACIÓN: no uses ¿ ni ¡ ni ... ; preguntas con ? ; comas y punto seguido; evitá punto final innecesario.\n' +
  '- Máximo 1-3 oraciones visibles por turno. Máximo UNA pregunta por mensaje. Variá saludos y cierres. Si necesitás más, devolvé 2 bloques separados por doble salto de línea (línea en blanco) dentro del campo "respuesta". Si solo saludan → saludá y presentate. Sin cuestionario.\n\n' +
  'NO REPETIR (CRÍTICO):\n' +
  '- Leé el historial completo. Si ya respondiste algo parecido, NO copies la misma frase.\n' +
  '- Usá el bloque APRENDIZAJE (esta conversación + ejemplos) para adaptar tono; no copies plantillas si ya cubriste el tema.\n' +
  '- Si el cliente repite la pregunta: reconocelo, variá redacción, sumá un dato o hacé otra pregunta concreta.\n' +
  '- Nunca mandes dos veces el mismo texto.\n\n' +
  'PROHIBIDO (frases robot / plantilla):\n' +
  '- "¿Te gustaría que un asesor de Nodo Propiedades te contacte..."\n' +
  '- "estoy a tu disposición" / "quedo a tu disposición"\n' +
  '- "mi especialidad es..."\n' +
  '- "encajen con tu búsqueda" / "encajan con tu búsqueda"\n' +
  '- "no tengo inmuebles disponibles en este momento"\n' +
  '- "Hey", tono corporativo, "con gusto estoy para ayudarte"\n\n' +
  'EJEMPLOS:\n' +
  'Cliente: "hola"\n' +
  'BIEN: "Hola, cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás"\n' +
  'MAL: "¡Hey! ¿Qué buscás, compra, alquiler o venta?"\n\n' +
  'Cliente: "que tenes por 50 mil dolares"\n' +
  'BIEN: "Dale, con USD 50.000 te paso un par de opciones en venta. Buscás depto o casa? Alguna zona en Mendoza?"\n' +
  'MAL: "Solo trabajo con propiedades..." (es consulta inmobiliaria válida, no off-topic)\n\n' +
  'Cliente: "que tenes?" / "que hay?" / "solo estoy viendo"\n' +
  'BIEN: intro corta + ###MOSTRAR_PROPIEDADES### con 2-3 opciones variadas. Una pregunta suave: "Alguna zona te cierra más?"\n' +
  'MAL: Cuestionario de zona/presupuesto/operación sin mostrar fichas\n\n' +
  'Cliente: "no tengo nada en mente" / "mandame opciones" / "cualquiera" / "lo que tengas"\n' +
  'BIEN: "Dale, te paso un par de opciones para que veas" + ###MOSTRAR_PROPIEDADES### en la MISMA respuesta. PROHIBIDO preguntar zona/presupuesto/operación antes.\n' +
  'MAL: "Contame qué buscás" / "En qué zona?" / cuestionario sin fichas\n\n' +
  'Cliente: "cuanto sale mas o menos un depto?"\n' +
  'BIEN: rango de precios + 1-2 ejemplos con ###MOSTRAR_PROPIEDADES###\n' +
  'MAL: Solo preguntas sin mostrar nada\n\n' +
  'Cliente: "alquiler 45000 usd godoy cruz"\n' +
  'BIEN: "Con 45 mil dólares podemos mirar opciones de compra en Godoy Cruz. Buscás comprar o alquilar? Si es alquiler, el presupuesto mensual suele expresarse en pesos; contame un poco más y te oriento"\n' +
  'MAL: "Uf, con 45 mil para alquiler no me cierra..." o plantilla con "asesor te contacte"\n\n' +
  'Cliente: sin stock en zona/tope\n' +
  'BIEN: "Ahora mismo no tengo nada en esa zona con ese tope, aflojamos un poco el presupuesto o miramos Capital?"\n' +
  'MAL: "no tengo inmuebles disponibles en este momento" + derivar a otro asesor\n\n' +
  'OFF-TOPIC:\n' +
  'BIEN: "Solo trabajo con propiedades. Si buscás depto o casa en Mendoza, avisame."\n' +
  'MAL: "¿Te gustaría que te recomiende algún lugar para comer?"\n\n' +
  'DATOS_CONOCIDOS (extraídos del chat — respetalos):\n' +
  JSON.stringify(datosConocidos, null, 2) +
  '\n\n' +
  'CONTEXTO:\n' +
  '- Turno: ' +
  turno +
  '\n' +
  '- Off-topic seguidos: ' +
  offTopicCount +
  '\n' +
  '- Días sin contacto: ' +
  (ultimaActualizacionStr ? diasSinContacto : 'sin_dato') +
  '\n' +
  '- Propiedad en seguimiento: ' +
  (refSeg || 'ninguna') +
  (consultaRepetida
    ? '\n- REPETICIÓN DETECTADA: El cliente parece haber repetido una consulta similar. No repitas la misma respuesta tal cual. Reformulá o preguntale qué no le quedó resuelto.'
    : '') +
  (ultimoBotHistorial
    ? '\n- ÚLTIMA RESPUESTA TUYA (NO repetir igual): "' +
      ultimoBotHistorial.slice(0, 220) +
      '"'
    : '') +
  modoObligatorio +
  '\n\n' +
  formatearBloqueIntencionPrompt(clasif) +
  (bloqueAprendizaje ? '\n\n' + bloqueAprendizaje : '') +
  '\n\nSTOCK (solo IDs de esta lista):\n' +
  stockText +
  '\n\nMOSTRAR PROPIEDADES (estilo Casa Clic):\n' +
  '- Si el cliente pregunta qué hay / qué tenés / está curioseando / dice que no tiene nada claro / pide opciones o "mandame algo": mostrá opciones YA con ###MOSTRAR_PROPIEDADES### en la misma respuesta. PROHIBIDO preguntar zona, presupuesto u operación antes.\n' +
  '- Modo curioso: 2-3 opciones variadas (distintas zonas/precios). Temperatura "frio" pero igual mostrá algo. UNA pregunta suave al final.\n' +
  '- Cuando muestres opciones: texto intro de 1 frase + bloque ###MOSTRAR_PROPIEDADES###.\n' +
  '- NO escribas listas con guiones ni párrafos largos con cada propiedad.\n' +
  '- Las fichas (foto + tipo + precio + link) las envía el sistema automáticamente.\n' +
  '- Después de las fotos el sistema manda cierre suave ("¿Cuál te interesa?").\n' +
  '- Solo IDs del STOCK. Nunca inventes direcciones, precios ni m².\n' +
  '- Default: VENTA en USD.\n' +
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
  '- Vos coordinás: NO digas "un asesor te contacta". Ejemplo:\n' +
  '"Dale, coordinamos. Te dejo el link para agendar y te confirmo por acá."\n' +
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
      'Hola, cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás',
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
      debe_mostrar_propiedades:
        debeMostrarPropiedades && !esOffTopic && !esAlquilerPresupuestoAlto,
      presupuesto_detectado: presupuestoUsd ? String(presupuestoUsd) : '',
      pide_opciones: pideOpciones,
      repeticion_detectada: Boolean(consultaRepetida),
      es_curioso: esCurioso,
      es_solo_saludo: esSoloSaludo,
      propiedad_consultada: propiedadConsultada,
      es_pregunta_especifica: preguntaEspecifica,
      es_detalle_una: detalleUnaPropiedad,
      es_off_topic: esOffTopic,
      off_topic_count: offTopicCount,
      skip_reply: skipReply,
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
