/**
 * Bot Telegram -- Construir Prompt (asesor humano + stock + memoria local)
 */
const PROP_MEDIA = __PROP_MEDIA_JSON__;
const STOCK_FALLBACK = __STOCK_FALLBACK_JSON__;

let setVars = {};
try {
  setVars = $('Transcribir Audio TG').first().json || {};
} catch (e) {
  setVars = {};
}
if (!setVars.chat_id) {
  try {
    setVars = $('Set Variables').first().json || {};
  } catch (e2) {
    setVars = {};
  }
}
const chatId = String(setVars.chat_id || '');
const textoUsuario = String(setVars.texto_usuario || setVars.audio_transcripto || '').trim();
const nombreUsuario = setVars.nombre_usuario;
const esAudioSinTextoTg =
  Boolean(setVars.es_audio_sin_transcripcion) && !textoUsuario;

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
  return icParsePrecioUsd(s);
}

function extractPresupuestoUsd(text) {
  return icExtraerPresupuestoUsd(text);
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
  /\b(que ten[eé]s|qué ten[eé]s|que hay|qué hay|que venden|qué venden|que tienen|qué tienen|algo por|opciones por|ten[eé]s algo|tienen algo|lo que tengas|lo que tengan|lo que haya|mostrame|mostrá|mandame|mandá|pasame|pasá|ver algo|algo para ver|catalogo|catálogo|enviame|enviá|enviame lo que tengas|mandame lo que tengas|enviame lo que haya|cu[aá]nto sale|a cu[aá]nto|precio de|cu[aá]nto cuesta|alg[uú]n depto|alg[uú]na casa|ten[eé]s algo|solo (estoy )?(viendo|mirando|curioseando)|solo quiero ver|de curioso|para ver nomas|para saber nomas|nomas (quiero|para) ver)\b/i;
const NO_TENGO_CLARO_RE =
  /\b(no tengo (nada )?(claro|en mente|definido)|no s[eé] (tanto|mucho|bien|nada)?|nose|no estoy seguro|sin criterio|sin idea|no defin[ií]|a[uú]n no s[eé]|todav[ií]a no s[eé]|me da igual|cualquier cosa)\b/i;
const PIDE_OPCIONES_DIRECTO_RE =
  /\b(mandame opciones|mandá opciones|enviame opciones|enviá opciones|pasame opciones|pasá opciones|dame opciones|mandame algo|mandá algo|mostrame algo|mostrá algo|enviame lo que tengas|mandame lo que tengas|enviame lo que haya|mandame lo que haya|no se,? mostr[aá]|no sé,? mostr[aá]|cualquiera|ver opciones|quiero ver|algo para ver|que me recomend[aá]s|qué me recomend[aá]s|sorprendeme|sorprendeme|a ver)\b/i;
const CURIOSO_RE =
  /\b(que venden|qué venden|que tienen|qué tienen|solo (estoy )?(viendo|mirando|curioseando)|solo quiero ver|de curioso|por curiosidad|para ver nomas|para saber nomas|nomas (quiero|para) ver|algo para ver|que hay en stock|que tenes\??|qué tenés\??|que hay\??|qué hay\??|mostrame algo|mostrá algo|pasame algo|cualquiera|lo que tengas|lo que tengan|lo que haya)\b/i;
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
if (!stockItems.length && Array.isArray(STOCK_FALLBACK) && STOCK_FALLBACK.length) {
  stockItems = STOCK_FALLBACK;
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
  const id = pick(row, ['id', 'ID', 'codigo', 'property_id']);
  const tipo = pick(row, ['tipo', 'Tipo', 'tipologia', 'property_type']);
  const zona = pick(row, ['zona', 'Zona', 'barrio', 'zone']);
  const precio = pick(row, ['precio', 'Precio', 'precio_usd', 'price']);
  const operacion = pick(row, ['operacion', 'Operacion', 'tipo_operacion', 'operation_type']);
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
  return icSugerirIdsStock(stock, budgetUsd, zonaHint);
}

function sugerirIdsVariados(stock) {
  return icSugerirIdsVariados(stock);
}

// stockText se arma DESPU-0S del clasificador (filtro por zona/presupuesto/tipo)
let stockText = '';
let stockParaPrompt = stockItems;

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
  esAudioSinTexto: esAudioSinTextoTg,
  ultimaActualizacion: ultimaActualizacionStr,
  diasSinContacto,
});

const esDiaNuevo = Boolean(clasif.es_dia_nuevo || clasif.es_recontacto);
if (esDiaNuevo) {
  presupuestoUsd = clasif.presupuesto_usd || extractPresupuestoUsd(textoUsuario) || null;
  zonaDetectada = clasif.zona || extractZona(textoUsuario) || '';
  operacionDetectada = clasif.operacion || extractOperacion(textoUsuario) || '';
} else {
  presupuestoUsd = clasif.presupuesto_usd || presupuestoUsd;
  zonaDetectada = clasif.zona || zonaDetectada;
  operacionDetectada = clasif.operacion || operacionDetectada;
}
// HARD RULE: saludo puro (typos incluidos)  -> nunca stock / nunca heredar presupuesto
const saludoPuro =
  (typeof icEsSaludoVacio === 'function' && icEsSaludoVacio(textoUsuario)) ||
  Boolean(clasif.es_saludo && clasif.intencion === 'saludo');
if (saludoPuro) {
  presupuestoUsd = null;
  // no heredar zona/operación del historial para este turno
}
const esCurioso = clasif.modo_curioso && !esDiaNuevo && !saludoPuro;
const pideOpcionesRaw =
  clasif.intencion === 'pedir_opciones' ||
  (clasif.mostrar_stock && !clasif.es_saludo) ||
  esCurioso;
const esCalificar =
  !saludoPuro &&
  (clasif.intencion === 'calificar' ||
    Boolean(clasif.busqueda_vaga) ||
    (clasif.requiere_calificar && !clasif.mostrar_stock && !pideOpcionesRaw));
const pideOpciones = !saludoPuro && !esCalificar && Boolean(pideOpcionesRaw);
const esSoloSaludo =
  saludoPuro ||
  ((clasif.intencion === 'saludo' || clasif.es_saludo || esDiaNuevo) &&
    textoUsuario.length < 55 &&
    !/\b(depto|casa|alquil|compr|venta|propiedad|precio|usd|\d{4,}|zona|mendoza|mostrame|mandame|pasame|opciones)\b/i.test(
      textoUsuario,
    ));
const esSaludo =
  saludoPuro ||
  clasif.es_saludo ||
  esSoloSaludo ||
  (/^(hola|buen[oa]s?\s*(d[ií]as|tardes|noches)?|como est[aá]s|qué tal)/i.test(
    textoUsuario.trim(),
  ) &&
    textoUsuario.length < 55 &&
    !/\b(depto|casa|alquil|compr|venta|propiedad|mostrame|opciones|usd|\d{4,})\b/i.test(
      textoUsuario,
    ));
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
const botYaPausado =
  typeof ltBotYaPausado === 'function'
    ? ltBotYaPausado({
        bot_paused: matchRow && matchRow.json ? matchRow.json.bot_paused : '',
        temperature:
          (matchRow && matchRow.json && (matchRow.json.temperatura || matchRow.json.temperature)) ||
          '',
        temperatura:
          (matchRow && matchRow.json && (matchRow.json.temperatura || matchRow.json.temperature)) ||
          '',
      })
    : false;
const skipReply = botYaPausado || offTopicCount >= 3;
const esOffTopic = offTopicAhora && !onTopicAhora;

// Handoff: no gastar tokens Groq si el bot ya esta pausado
if (botYaPausado) {
  return [
    {
      json: {
        chat_id: chatId,
        texto_usuario: textoUsuario,
        nombre_usuario: nombreUsuario,
        messages: [
          { role: 'system', content: 'skip' },
          { role: 'user', content: textoUsuario || '...' },
        ],
        historial_json: historialJson,
        turno: turno,
        row_exists: rowExists,
        propiedad_seguimiento_actual: propiedadSeguimientoPrev,
        sugerencias_ids: '[]',
        debe_mostrar_propiedades: false,
        skip_reply: true,
        bot_paused_prev: true,
        cita_link: citaLink,
        intencion_clasificador: 'handoff',
      },
    },
  ];
}

const sugerenciasIds =
  stockItems.length > 0
    ? presupuestoUsd || zonaDetectada
      ? sugerirIds(stockItems, presupuestoUsd, zonaDetectada)
      : sugerirIdsVariados(stockItems)
    : [];

const debeMostrarPropiedades =
  stockItems.length > 0 &&
  !saludoPuro &&
  !esSoloSaludo &&
  !esSaludo &&
  !esCalificar &&
  !clasif.es_saludo &&
  clasif.intencion !== 'saludo' &&
  clasif.intencion !== 'calificar' &&
  (Boolean(clasif.mostrar_stock) || (frustrado && !esDiaNuevo && !esCalificar)) &&
  !(esDiaNuevo && !pideOpciones);

// Prompt liviano: solo stock filtrado (o muestra acotada), no catálogo entero
stockParaPrompt =
  typeof icFiltrarStockParaPrompt === 'function'
    ? icFiltrarStockParaPrompt(stockItems, {
        zona: zonaDetectada,
        budgetUsd: presupuestoUsd,
        tipo: String(clasif.tipo || clasif.tipo_propiedad || '').trim(),
        max:
          typeof IC_STOCK_PROMPT_MAX === 'number' ? IC_STOCK_PROMPT_MAX : 8,
      })
    : stockItems.slice(0, 8);
if (stockParaPrompt.length) {
  stockText = stockParaPrompt.map(rowToStockLine).map((l) => '- ' + l).join('\n');
} else {
  stockText =
    '- (Sin stock cargado. Pedí zona y presupuesto; no inventes propiedades.)';
}

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
  presupuesto_usd:
    esDiaNuevo && !refSeg && !extractPresupuestoUsd(textoUsuario)
      ? null
      : presupuestoUsd || null,
  presupuesto_texto:
    esDiaNuevo && !refSeg && !extractPresupuestoUsd(textoUsuario)
      ? ''
      : presupuestoUsd
        ? 'USD ' + presupuestoUsd
        : '',
  zona:
    esDiaNuevo && !refSeg && !extractZona(textoUsuario)
      ? '(no indicó)'
      : zonaDetectada || '(no indicó)',
  operacion:
    esDiaNuevo && !refSeg && !extractOperacion(textoUsuario)
      ? '(no indicó)'
      : operacionDetectada || '(no indicó)',
};

const esAlquilerPresupuestoAlto =
  operacionDetectada === 'alquiler' &&
  Boolean(presupuestoUsd) &&
  presupuestoUsd >= 15000 &&
  !pideOpciones &&
  !clasif.ya_aclaro_compra_alquiler;

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

  // "-altimo mensaje del cliente" (actualRaw) vs "anteúltimo" (último user en historial)
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
if (esAudioSinTextoTg) {
  modoObligatorio =
    '\n\nMODO AUDIO (OBLIGATORIO):\n' +
    '- No se pudo transcribir el audio. Respondé EXACTAMENTE: "No pude escuchar bien el audio, escribime o mandalo de nuevo y te ayudo con propiedades"\n';
} else if (esOffTopic) {
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
    '- Si confirma compra  -> asumí VENTA USD y mostrá stock. Si insiste alquiler  -> pedí presupuesto mensual (pesos) y zona.\n';
} else if (detalleUnaPropiedad && propiedadConsultada) {
  modoObligatorio =
    '\n\nMODO DETALLE UNA PROPIEDAD (OBLIGATORIO):\n' +
    '- El cliente pide info de ' +
    propiedadConsultada +
    '. NO uses ###MOSTRAR_PROPIEDADES###.\n' +
    '- Usá ###BURBUJAS### con 2-4 mensajes cortos (ubicación  -> detalle  -> precio).\n' +
    '- Ejemplo:\n' +
    '###BURBUJAS###\n' +
    '["-x- Belgrano 320, Capital Mendoza","3 amb, luminoso, cocina integrada, SUM","USD 112.000 · ¿Querés más fotos?"]\n' +
    '###FIN_BURBUJAS###\n' +
    '- Solo datos del STOCK. Default venta USD.\n';
} else if (debeMostrarPropiedades && sugerenciasIds.length) {
  modoObligatorio =
    '\n\nMODO MOSTRAR PROPIEDADES (OBLIGATORIO):\n' +
    (esCurioso
      ? '- MODO CURIOSO: el cliente explora. Intro humana corta que reaccione a lo que dijo (ej: "Mira estas para que veas"). Mostrá 2-3 fichas YA. Sin cuestionario antes.\n'
      : '') +
    '- El cliente pidió opciones o dio criterios HOY. NO listes propiedades en el texto.\n' +
    '- Tu mensaje visible = SOLO 1 frase intro humana (reaccioná a su mensaje; PROHIBIDO "Dale te paso un par cerca de USD X").\n' +
    '- Las fichas van en fotos con caption (el sistema las arma). Vos solo intro + bloque técnico.\n' +
    '- IDs sugeridos del stock real: ' +
    JSON.stringify(sugerenciasIds) +
    '\n' +
    '- Incluí ###MOSTRAR_PROPIEDADES### con esos IDs. PROHIBIDO inventar propiedades o precios.\n' +
    '- HAY STOCK real. PROHIBIDO decir que no tenés nada si hay IDs sugeridos.\n' +
    '- Asumí VENTA/COMPRA salvo que el cliente dijo alquiler explícitamente.\n' +
    '- NO digas "al año" ni inventes alquiler.\n' +
    '- Cierre comercial corto al final (sistema): "Cual te copa mas?" / "Te armo visita?" -- NUNCA "en unos dias te escribo".\n';
} else if (esSoloSaludo || (esSaludo && (turno <= 2 || esDiaNuevo))) {
  modoObligatorio =
    '\n\nMODO SALUDO' +
    (esDiaNuevo ? ' / RECONTACTO' : '') +
    ' (OBLIGATORIO):\n' +
    (esDiaNuevo
      ? '- El cliente vuelve tras una pausa. Saludá natural (usa su nombre si lo dijo). NO dumpees presupuesto/zona del historial viejo. NO tires fichas.\n' +
        (refSeg
          ? '- Hay propiedad en seguimiento (' +
            refSeg +
            '): como mucho UNA linea suave; no dumps del resto del historial.\n'
          : '- PROHIBIDO mencionar presupuesto/zona viejos de entrada.\n') +
        '- PROHIBIDO ###MOSTRAR_PROPIEDADES###. Pregunta abierta, no resumen de la charla vieja.\n' +
        '- BIEN: "Todo bien, vos? Como venis con lo que estabas buscando?"\n' +
        '- BIEN: "Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?"\n' +
        '- MAL: "Hola! Retomando lo de Godoy Cruz con presupuesto de 100 mil..."\n'
      : '- Presentate corto: Buenas/Hola + soy Matias de Nodo Propiedades + En que puedo ayudarte?\n' +
        '- BIEN: "Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?"\n' +
        '- BIEN (variante): "Hola, soy Matias de Nodo Propiedades. En que te puedo ayudar?"\n' +
        '- MAL: solo "Hola" o solo "Buenas" (una sola palabra)\n' +
        '- MAL: "Hola como estas? Soy Matias de Nodo Propiedades. Cuando necesites/quieras contame..."\n') +
    '- PROHIBIDO: "Hey", "¡Hey!", "matcheen", "matchear", signos ¡ ¿, "cuando necesites", "cuando quieras contame", "estoy para ayudarte", "quedo a tu disposicion", tirar stock sin pedido de HOY.\n' +
    '- Una o dos frases. Tono profesional-cercano (Matías).\n';
} else if (esCalificar) {
  modoObligatorio =
    '\n\nMODO CALIFICAR / ALGO PENSADO (OBLIGATORIO):\n' +
    '- El cliente mostro interes (ej: busco depto) pero NO pidio fichas ni dio criterios claros.\n' +
    '- PROHIBIDO ###MOSTRAR_PROPIEDADES###. NO tires stock.\n' +
    '- Pregunta UNA sola cosa, corta y suave.\n' +
    '- BIEN: "Buena. Si queres te mando opciones para orientar, o preferis zona?"\n' +
    '- BIEN: "Depto. Tenes zona en mente o te paso opciones?"\n' +
    '- MAL: "Tenes alguna zona o tipo de inmueble en mente o te mando opciones variadas dentro de ese rango?"\n' +
    '- MAL: tirar fichas ya / cuestionario de 3 preguntas / "Dale te paso un par..."\n';
} else if (esDiaNuevo && !pideOpciones) {
  modoObligatorio =
    '\n\nMODO RECONTACTO (OBLIGATORIO):\n' +
    '- Cliente retoma. Saluda + pregunta abierta. PROHIBIDO ###MOSTRAR_PROPIEDADES### y PROHIBIDO usar presupuesto viejo.\n' +
    '- BIEN: "Todo bien, vos? Como venis con lo que estabas buscando?"\n' +
    '- MAL: dump de fichas o "te paso opciones cerca de USD 100.000"\n';
} else if (esSaludo && turno <= 2) {
  modoObligatorio =
    '\n\nMODO SALUDO:\n' +
    '- Respondé el saludo con calma. No califiques al cliente todavía.\n' +
    '- No preguntes compra/alquiler/venta en el primer mensaje.\n';
}

const systemPrompt =
  'Sos Matías, asesor virtual de Nodo Propiedades en Mendoza. Vos SOS el asesor: hablás como persona real, corto, natural, argentino. Nunca derivás a "un asesor".\n\n' +
  'SOLO RUBRO:\n' +
  '- Unicamente compra/venta/alquiler de inmuebles en Mendoza.\n' +
  '- Off-topic (comida, herramientas, etc.): NO ayudes. Una frase redirigiendo a propiedades.\n\n' +
  'NEGOCIO (importante):\n' +
  '- Default: VENTA en USD. Alquiler solo si el cliente lo pidió claro.\n' +
  '- Si dice "alquiler" con presupuesto alto en USD (ej. 45 mil): NO inventes alquileres. Aclará amable que ese monto suena a compra, o que alquileres son mensuales en pesos / otro rango. Preguntá si busca alquilar o comprar.\n' +
  '- Sin stock REAL (lista vacía): decilo natural y ofrecé alternativas. Si hay IDs sugeridos, SIEMPRE mostralos. Nunca prometas que "un asesor te contacta".\n\n' +
  'TONO Y ESTILO DE ESCRITURA (crítico, seguir siempre):\n' +
  '- Escribís como un asesor argentino real, de Mendoza, contestando por WhatsApp/Telegram desde el celular. No como un sistema, no como un CRM, no como soporte técnico.\n' +
  '- Español informal de chat: NO uses tildes en palabras cortas de uso frecuente cuando estés escribiendo rápido y casual -- "que", "como", "mas", "dias", "tenes", "vez" se escriben SIN tilde la mayoría de las veces, igual que lo haría una persona tipeando en el celular. No apliques esto de forma forzada en cada palabra; que se note natural, no una regla mecánica.\n' +
  '- Nunca uses doble signo de exclamación o interrogación pegados a mitad de oración. Evitá abrir con "¡" salvo que sea genuinamente una alegría puntual.\n' +
  '- 1 a 3 oraciones por mensaje. Si necesitás decir más, partilo en dos mensajes en vez de uno largo.\n' +
  '- Nunca repitas la misma estructura de mensaje dos turnos seguidos (no uses siempre "Dale, te paso ...", variá la entrada).\n' +
  '- No uses muletillas de relleno como "un par", "un par de", "digamos", "o sea", "tipo", "onda", "viste". Si la oración las necesita para sonar natural, replanteala sin esa palabra en vez de buscarle un reemplazo -- directamente se elimina, no se sustituye.\n' +
  '\n' +
  'FRASES PROHIBIDAS (nunca las uses, sin excepción):\n' +
  '"Entiendo tu consulta" / "Con gusto te ayudo" / "Quedo atento" / "Cuando quieras contame" /\n' +
  '"Alguna de estas te llama?" / "matcheen" / "En unos dias te escribo con mas que matcheen" /\n' +
  '"Te dejo estas opciones" / "Claro! Aca te muestro" / cualquier frase que suene a esperar\n' +
  'pasivamente o a folleto de marketing.\n' +
  '\n' +
  'REGLA DE ORO - entrega de fichas (sin excepcion):\n' +
  '- PROHIBIDO prometer una entrega futura en el mismo turno: "te muestro", "ahi van", "aca te dejo",\n' +
  '  "mira estas" SIN el bloque ###MOSTRAR_PROPIEDADES### en EL MISMO mensaje.\n' +
  '- La ficha ES la respuesta: texto intro + ###MOSTRAR_PROPIEDADES### juntos, o solo el bloque.\n' +
  '- Si no vas a incluir ###MOSTRAR_PROPIEDADES###, NO narres que vas a mostrar nada.\n' +
  '\n' +
  'QUE DECIR EN SU LUGAR (ejemplos, no formulas fijas -- varia sobre esta base):\n' +
  '- En vez de "Alguna de estas te llama?" -> "Cual de estas te cierra mas?" o "Te gusta alguna o seguimos mirando?"\n' +
  '- En vez de "Te dejo estas opciones" -> una linea que reaccione a lo que el cliente dijo, por ejemplo si pidio depto de 2 ambientes hasta 100k: "Tengo opciones que entran justo en ese presupuesto"\n' +
  '- En vez de "En unos dias te escribo" (SIMPLE-04, no es este nodo pero aplica el mismo criterio) -> "Seguis mirando o ya definiste?"\n' +
  '\n' +
  'SALUDO (primer contacto del dia o de la conversacion):\n' +
  '"Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?"\n' +
  'Simple, cordial, sin "cuando necesites" ni nada que suene a mensaje automatico de bienvenida.\n' +
  'PROHIBIDO responder solo "Hola" o solo "Buenas".\n' +
  '\n' +
  'REGLA DE FLUJO -- cuando mostrar propiedades (fichas):\n' +
  '1. Saludas.\n' +
  '2. Preguntas si tiene algo pensado (zona, tipo, presupuesto) -- UNA pregunta por vez, no una lista.\n' +
  '3. Si el cliente dice que no tiene claro, o pide explicitamente "mandame opciones" / "enviame lo que tengas" / "a ver que tenes" -> RECIEN AHI mostras fichas. Esto activa mostrar_stock=true.\n' +
  '4. Si el cliente ya dio algún dato (zona, tipo o presupuesto) -> profundizá y filtrá antes de mostrar nada; no le vuelvas a preguntar lo que ya te dijo.\n' +
  '5. Vas juntando señales (financiación, urgencia, presupuesto, zona, tipo) para que el sistema pueda derivar a un humano cuando el lead esté caliente.\n' +
  'NUNCA mandes fichas apenas saludás, sin que el cliente haya pedido nada o dado ningún dato.\n' +
  'NUNCA te quedes preguntando zona/presupuesto de nuevo si el cliente ya dijo "mandame lo que tengas" -> eso ya es la señal de mostrar.\n' +
  '\n' +
  'CUANDO MOSTRÁS FICHAS:\n' +
  '- Empezá con una línea humana que reaccione a lo que el cliente pidió, no una frase genérica.\n' +
  '- Cerrá con algo corto y activo: "Cual te cierra mas?" o "Si queres te armo una visita".\n' +
  '- Nunca cierres con algo pasivo tipo "cualquier cosa avisame" o "quedo atento".\n' +
  '\n' +
  'CADA DÍA ES UN DÍA NUEVO:\n' +
  '- Si CONTEXTO muestra que pasó bastante tiempo desde el último mensaje (días_sin_contacto / gap), un saludo tipo "hola como andas" NO debe abrir mencionando el presupuesto o la zona de la charla anterior. Saludá con naturalidad, como si te encontraras con alguien de nuevo. Solo retomá el tema anterior si el cliente lo menciona él mismo, o -si hace mucho que no contesta y hay una propiedad en seguimiento- con una sola línea suave.\n' +
  '- Un mensaje corto y neutro ("hola", "hola como estas", "que tal") después de mucho tiempo sin contacto se responde con un saludo natural y una pregunta abierta, no con un resumen de la charla vieja.\n' +
  '\n' +
  'NO REPETIR (CRÍTICO):\n' +
  '- Leé el historial. Si ya respondiste algo parecido, NO copies la misma frase.\n' +
  '- Si el cliente repite la pregunta: no repitas la misma respuesta; preferí mostrar fichas reales si ya pedía opciones.\n' +
  '- Nunca mandes dos veces el mismo texto.\n' +
  '\n' +
  'EJEMPLO 1 -- Saludo inicial\n' +
  'Cliente: hola\n' +
  'MAL: "Hola! Bienvenido a Nodo Propiedades. Soy Matías, tu asesor virtual. En que puedo ayudarte hoy?"\n' +
  'BIEN: "Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?"\n' +
  '\n' +
  'EJEMPLO 2 -- Cliente pide opciones directamente\n' +
  'Cliente: tengo 80 mil dolares, que tenes\n' +
  'MAL: "Entiendo tu consulta. Con ese presupuesto tengo varias opciones interesantes para mostrarte. Alguna zona en particular?"\n' +
  'BIEN: "Con 80 tengo opciones. Alguna zona que te interese o te tiro variedad?"\n' +
  '(si el cliente responde "tirame variedad" o similar -> ahí sí fichas reales del stock)\n' +
  '\n' +
  'EJEMPLO 3 -- Cliente da datos completos y pide todo junto\n' +
  'Cliente: busco depto 2 ambientes en Palermo o Chacras, hasta 90 mil, para comprar ya\n' +
  'MAL: pedir de nuevo la zona o el presupuesto\n' +
  'BIEN: "Tengo opciones en las dos zonas dentro de ese rango. Te paso las que mas se ajustan:"\n' +
  '[fichas reales]\n' +
  '"Cual te cierra mas?"\n' +
  '\n' +
  'EJEMPLO 4 -- Recontacto al otro día\n' +
  'Historial: hace 2 dias el cliente pregunto por depto de 100k en Godoy Cruz\n' +
  'Cliente hoy: hola como andas\n' +
  'MAL: "Hola! Retomando lo de Godoy Cruz con presupuesto de 100 mil, te consigo algo nuevo?"\n' +
  'BIEN: "Todo bien, vos? Como venis con lo que estabas buscando?"\n' +
  '(deja que el cliente retome el tema si quiere, sin asumir ni dumpear el contexto viejo)\n' +
  '\n' +
  'EJEMPLO 5 -- Mensaje repetido (el cliente manda lo mismo dos veces)\n' +
  'Cliente (turno 1): tenes algo en Maipu\n' +
  'Cliente (turno 2, identico o muy similar): tenes algo en Maipu\n' +
  'MAL: repetir exactamente la misma respuesta del turno 1\n' +
  'BIEN: mostrar fichas reales directamente en vez de volver a preguntar o repetir la misma frase\n' +
  '\n' +
  'EJEMPLO 6 -- Falla de Groq (fallback del sistema, no del modelo)\n' +
  'Fallback: "Perdon, se corto un toque. Me repetis que necesitas?"\n' +
  '(Nunca mensaje vacío ni "Hola]")\n' +

  'DATOS_CONOCIDOS (extraídos del chat -- respetalos):\n' +
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
    ? '\n- REPETICION DETECTADA: El cliente repitio la consulta. NO reformules ni preguntes preferencias. Mostra fichas YA con ###MOSTRAR_PROPIEDADES### (IDs reales del STOCK). Intro corta distinta a la del turno anterior.'
    : '') +
  (ultimoBotHistorial
    ? '\n- -aLTIMA RESPUESTA TUYA (NO repetir igual): "' +
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
  '- Flujo: 1) saludo 2) preguntar si tiene algo pensado 3) SOLO si no tiene claro / pide opciones  -> fichas. Si ya tiene criterios (presupuesto/zona)  -> filtrar y mostrar.\n' +
  '- Si el cliente pregunta qué hay / qué tenés / no tiene nada claro / pide opciones o "mandame algo": mostrá opciones YA con ###MOSTRAR_PROPIEDADES###. PROHIBIDO cuestionario antes.\n' +
  '- Si dijo "busco depto" sin mas datos: NO muestres fichas; pregunta si tiene algo pensado.\n' +
  '- Modo curioso (pidio ver): 2-3 opciones variadas. UNA pregunta suave al final.\n' +
  '- Cuando muestres opciones: texto intro de 1 frase + bloque ###MOSTRAR_PROPIEDADES###.\n' +
  '- NO escribas listas con guiones ni párrafos largos con cada propiedad.\n' +
  '- Las fichas (foto + tipo + precio + link) las envía el sistema automáticamente.\n' +
  '- Después de las fotos el sistema manda cierre: "Cual de estas te cierra mas?" / "Si queres te cuento mas de alguna". PROHIBIDO "te llama" / "alguna de estas te llama".\n' +
  '- Solo IDs del STOCK. Nunca inventes direcciones, precios ni m².\n' +
  '- Default: VENTA en USD.\n' +
  '###MOSTRAR_PROPIEDADES###\n["MZA-003","MZA-011"]\n###FIN_MOSTRAR###\n\n' +
  'DETALLE DE UNA PROPIEDAD (si preguntan por una / "la ultima" / "contame de esa"):\n' +
  '- OBLIGATORIO datos concretos del STOCK: zona+direccion, tipo/ambientes, descripcion, precio USD, link ficha si hay.\n' +
  '- PROHIBIDO responder solo con la direccion. Minimo 2-3 burbujas utiles.\n' +
  '- Usá ###BURBUJAS### con array JSON: ubicacion -> detalle -> precio+cta.\n' +
  '- Cerra con: "Te armo visita o queres mas fotos?"\n' +
  '###BURBUJAS###\n["Godoy Cruz - Paso de los Andes 2100","PH 3 amb, sin expensas, patio chico","USD 98500 · Te armo visita?"]\n###FIN_BURBUJAS###\n\n' +
  'PREGUNTA ESPECIFICA (cocina, garage, quien recibe, etc.):\n' +
  '- Responde directo y concreto. Quien recibe en visita = el agente de Nodo en el inmueble.\n' +
  '- NO vuelvas a preguntar zona/presupuesto/operacion.\n\n' +
  'VISITAS + HANDOFF AL ASESOR HUMANO:\n' +
  '- Link turnos: ' +
  citaLink +
  '\n' +
  '- Cuando el cliente quiere visitar / pregunta dia / confirma (ok/dale): manda el link + ###SOLICITUD_VISITA###.\n' +
  '- Mensaje tipo: "Dale, coordinamos. Link: ... Ya le aviso al asesor y te confirma por aca."\n' +
  '- PROHIBIDO "cualquier cosa avisame" / cierres pasivos.\n' +
  '- Despues de coordinar visita el sistema PAUSA al bot (handoff). No sigas charlando vos.\n' +
  '###SOLICITUD_VISITA###\n{"propiedad_id":"ID","zona":"...","presupuesto":"...","nota":"..."}\n###FIN_VISITA###\n\n' +
  'TEMPERATURA (recalculá en CADA mensaje):\n' +
  '- Señales: financiacion, urgencia, presupuesto, zona concreta, tipo+decisor.\n' +
  '- CALIENTE = financiación clara + urgencia <3m + (zona concreta O tipo concreto).\n' +
  '- TIBIO = -0-1 señal fuerte sin llegar a caliente. FRÍO = sin señales fuertes.\n' +
  '- NO marques tibio/caliente en el primer "hola / qué tenés" genérico.\n' +
  '- Si caliente: cierre "Dale, con esto ya puedo avanzar. Te armo visita o preferis que te llame?"\n' +
  '- Si tibio con stock: 1-2 fichas + cierre comercial corto VARIABLE (ej: "Cual de estas te cierra mas?" / "Si queres te cuento mas de alguna" / "Decime cual te interesa y vemos visita").\n' +
  '- PROHIBIDO en cierres: "Alguna de estas te llama?", "te llama la atencion?", "Te dejo estas opciones", "en unos dias te escribo", "matcheen", "matchear", ¡¡, ¿, tono newsletter/CRM.\n' +
  '- Intro ante fichas: 1 linea humana que reaccione a LO QUE DIJO el cliente (no "Dale te paso un par cerca de USD X").\n' +
  '- COPY SIN TILDES innecesarias: estas/como/que/mas/dias/tambien/Matias (el sistema tambien las afloja).\n\n' +
  'POLITICAS_PAGO:\n' +
  politicasText +
  '\n\nAl final: ###ESTADO_ACTUAL:frio|tibio|caliente###\n' +
  '###SENALES###\n{"financiacion":"credito_preaprobado|fondos_propios|no_definido","urgencia":"inmediato|1-3m|3-6m|+6m|indefinido","zona_concreta":false,"tipo_concreto":false,"es_decisor":null}\n###FIN_SENALES###\n' +
  'LEAD COMPLETO (si tenés nombre, zona, presupuesto, operación):\n' +
  '###LEAD_COMPLETO###\n{...}\n###FIN_LEAD###\n' +
  'SEGUIMIENTO:\n###PROPIEDAD_SEGUIMIENTO###\n{"id":"...","referencia":"..."}\n###FIN_PROP###';

function sanitizarMensajeGroq(msg) {
  if (!msg || typeof msg !== 'object') return null;
  let role = String(msg.role || '').toLowerCase().trim();
  if (role === 'bot') role = 'assistant';
  if (role === 'cliente') role = 'user';
  if (role !== 'system' && role !== 'user' && role !== 'assistant') return null;
  let content = msg.content;
  if (content && typeof content === 'object') {
    content = content.text || content.content || JSON.stringify(content);
  }
  content = String(content || '').trim();
  if (!content) return null;
  return { role, content };
}

const messages = [];
const sysMsg = sanitizarMensajeGroq({ role: 'system', content: systemPrompt });
if (sysMsg) messages.push(sysMsg);
if (esSoloSaludo) {
  const u = sanitizarMensajeGroq({ role: 'user', content: 'hola' });
  const a = sanitizarMensajeGroq({
    role: 'assistant',
    content: 'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?',
  });
  if (u) messages.push(u);
  if (a) messages.push(a);
}
const historialLimpio = icSanitizarHistorialPrompt(
  historialJson,
  typeof IC_HISTORIAL_PROMPT_MAX === 'number' ? IC_HISTORIAL_PROMPT_MAX : 8,
);
for (const msg of historialLimpio) {
  const clean = sanitizarMensajeGroq(msg);
  if (clean && clean.role !== 'system') messages.push(clean);
}
const lastUser = sanitizarMensajeGroq({ role: 'user', content: textoUsuario });
if (lastUser) messages.push(lastUser);

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
        debeMostrarPropiedades &&
        !esOffTopic &&
        (!esAlquilerPresupuestoAlto || pideOpciones),
      presupuesto_detectado: presupuestoUsd ? String(presupuestoUsd) : '',
      pide_opciones: pideOpciones,
      repeticion_detectada: Boolean(consultaRepetida),
      es_curioso: esCurioso,
      es_calificar: Boolean(esCalificar),
      busqueda_vaga: Boolean(clasif.busqueda_vaga),
      es_solo_saludo: esSoloSaludo,
      es_dia_nuevo: esDiaNuevo,
      es_recontacto: Boolean(clasif.es_recontacto),
      gap_horas_recontacto: Number(clasif.gap_horas || 0) || 0,
      propiedad_consultada: propiedadConsultada,
      es_pregunta_especifica: preguntaEspecifica,
      es_detalle_una: detalleUnaPropiedad,
      es_off_topic: esOffTopic,
      off_topic_count: offTopicCount,
      skip_reply: skipReply,
      bot_paused_prev: botYaPausado,
      cita_link: citaLink,
      es_alquiler_presupuesto_alto: esAlquilerPresupuestoAlto,
      zona_detectada: zonaDetectada || '',
      operacion_detectada: operacionDetectada || '',
      clasificacion_intencion: JSON.stringify(clasif),
      intencion_clasificador: clasif.intencion,
      confianza_clasificador: clasif.confianza,
      requiere_calificar: clasif.requiere_calificar,
      bot_repite_sin_fichas: Boolean(clasif.bot_repite_sin_fichas),
      ya_aclaro_compra_alquiler: Boolean(clasif.ya_aclaro_compra_alquiler),
    },
  },
];
