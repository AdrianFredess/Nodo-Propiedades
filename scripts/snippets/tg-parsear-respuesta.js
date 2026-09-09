const groqData = $input.first().json || {};
const promptData = $('Construir Prompt').first().json || {};
const PROP_MEDIA = __PROP_MEDIA_JSON__;

const repeticionDetectada = Boolean(promptData.repeticion_detectada);

const groqErrText = String(
  (groqData.error && (groqData.error.message || groqData.error)) ||
    groqData.message ||
    groqData.errorMessage ||
    '',
);
const groqErrCode = String(
  (groqData.error && groqData.error.code) || groqData.code || '',
).toLowerCase();
const isRateLimit = Boolean(
  groqData.statusCode === 429 ||
    groqErrCode === 'rate_limit_exceeded' ||
    /rate.?limit|too many requests|tokens per minute|\bTPM\b|rate_limit_exceeded/i.test(
      groqErrText,
    ),
);
const groqFailed = Boolean(
  groqData &&
    (groqData.error ||
      groqData.errorType ||
      groqData.statusCode === 429 ||
      isRateLimit ||
      /Bad request|unsupported|messages\.\d+|rate.?limit|too many requests|tokens per minute|TPM/i.test(
        groqErrText,
      )),
);
const choices = Array.isArray(groqData.choices) ? groqData.choices : [];
const msgGroq = (choices[0] && choices[0].message) || {};
let respuestaCompleta =
  (msgGroq.content && String(msgGroq.content).trim()) ||
  String(msgGroq.reasoning || msgGroq.reasoning_content || '').trim();
if (groqFailed && !respuestaCompleta) respuestaCompleta = '';
const FALLBACK_GROQ =
  'Perdon, se corto un toque. Me repetis que necesitas?';
// Legacy: ya no se manda al cliente (silencio + cola). Se mantiene por compat.
const FALLBACK_RATE_LIMIT =
  'Dame un segundo que se me trabo, ya te contesto';

function parseRetryAfterSec(errText) {
  const s = String(errText || '');
  const mSec = s.match(/try again in\s*([\d.]+)\s*s/i);
  if (mSec) return Math.max(5, Math.ceil(Number(mSec[1])));
  const mMs = s.match(/try again in\s*([\d.]+)\s*ms/i);
  if (mMs) return Math.max(5, Math.ceil(Number(mMs[1]) / 1000));
  return 45;
}

const retryAfterSec = isRateLimit ? parseRetryAfterSec(groqErrText) : 0;
const esRetryGroq = Boolean(
  groqData.es_retry_groq || promptData.es_retry_groq || $json.es_retry_groq,
);

// Si Groq falló pero el clasificador ya pidió stock, forzar bloque MOSTRAR (entrega completa sin LLM)
if (
  groqFailed &&
  !respuestaCompleta &&
  (promptData.debe_mostrar_propiedades ||
    promptData.pide_opciones ||
    promptData.intencion_clasificador === 'pedir_opciones')
) {
  let idsForce = [];
  try {
    idsForce = JSON.parse(promptData.sugerencias_ids || '[]');
  } catch (e) {
    idsForce = [];
  }
  if (!Array.isArray(idsForce)) idsForce = [];
  if (idsForce.length) {
    respuestaCompleta =
      'Mira estas\n###MOSTRAR_PROPIEDADES###\n' +
      JSON.stringify(idsForce.slice(0, 3)) +
      '\n###FIN_MOSTRAR###';
  } else if (!isRateLimit) {
    respuestaCompleta = FALLBACK_GROQ;
  }
  // rate limit sin IDs → silencio (respuesta vacía); el retry arma la respuesta completa después
} else if (groqFailed && !respuestaCompleta && !isRateLimit) {
  respuestaCompleta = FALLBACK_GROQ;
}

const chatId = String(promptData.chat_id || '');
const textoUsuario = String(promptData.texto_usuario || '');
const nombreUsuario = promptData.nombre_usuario;
let historialJson = Array.isArray(promptData.historial_json)
  ? promptData.historial_json
  : [];
// Retry en la misma ejecución: usar historial vivo (no el snapshot de Construir Prompt)
try {
  const sdHist0 = $getWorkflowStaticData('global');
  const liveHist =
    sdHist0.historialByChat && sdHist0.historialByChat[chatId];
  if (Array.isArray(liveHist) && liveHist.length >= historialJson.length) {
    historialJson = liveHist;
  }
} catch (eHist0) {}
const turno = promptData.turno;
const rowExists = promptData.row_exists;
const propiedadPrevRaw = String(
  promptData.propiedad_seguimiento_actual || '',
).trim();

let sugerenciasIds = [];
try {
  sugerenciasIds = JSON.parse(promptData.sugerencias_ids || '[]');
} catch (e) {
  sugerenciasIds = [];
}
if (!Array.isArray(sugerenciasIds)) sugerenciasIds = [];

const debeMostrar = Boolean(promptData.debe_mostrar_propiedades);
const esCurioso = Boolean(promptData.es_curioso);
const pideOpcionesFlag = Boolean(promptData.pide_opciones);
const presupuestoDetectado = String(promptData.presupuesto_detectado || '');
const intencionClasificador = String(promptData.intencion_clasificador || '');
const pideStockTexto =
  /\b(a ver|enviame|envi[aá]|mandame|mand[aá]|pasame|pas[aá]|mostrame|mostr[aá]|lo que tengas|opciones)\b/i.test(
    textoUsuario,
  ) || /^(a ver|dale|mostrame|mandame|enviame|pasame)[\s!.?]*$/i.test(textoUsuario);
const esCalificarRaw = Boolean(
  promptData.es_calificar ||
    promptData.busqueda_vaga ||
    intencionClasificador === 'calificar',
);
// Pedido de fichas gana sobre "calificar" (nunca preguntar zona otra vez)
const esCalificar = esCalificarRaw && !pideOpcionesFlag && !pideStockTexto && !debeMostrar;
const esSoloSaludo = Boolean(promptData.es_solo_saludo);
const esDiaNuevo = Boolean(promptData.es_dia_nuevo || promptData.es_recontacto);
// HARD RULE: saludo puro / recontacto sin pedido → NUNCA stock (turno alto incluido)
const esSaludoTurno =
  esSoloSaludo ||
  intencionClasificador === 'saludo' ||
  (esSaludoSimple(textoUsuario) && !pideStockTexto) ||
  (esDiaNuevo && !pideOpcionesFlag && !debeMostrar && !pideStockTexto);
const forzarStockClasificador =
  !esSaludoTurno &&
  (debeMostrar || pideOpcionesFlag || pideStockTexto) &&
  (pideOpcionesFlag ||
    pideStockTexto ||
    intencionClasificador === 'pedir_opciones' ||
    intencionClasificador === 'presupuesto' ||
    Boolean(presupuestoDetectado) ||
    debeMostrar);
const esDetalleUna = Boolean(promptData.es_detalle_una);
const esPreguntaEspecifica = Boolean(promptData.es_pregunta_especifica);
const esOffTopic = Boolean(promptData.es_off_topic);
const offTopicCount = Number(promptData.off_topic_count || 0) || 0;
let skipReply = Boolean(promptData.skip_reply) || offTopicCount >= 3;
const esAlquilerPresupuestoAlto = Boolean(
  promptData.es_alquiler_presupuesto_alto,
);
const zonaDetectada = String(promptData.zona_detectada || '');

const OFF_TOPIC_MSG_1 =
  'Solo trabajo con propiedades. Si buscas depto o casa en Mendoza, avisame.';
const OFF_TOPIC_MSG_2 =
  'Aca solo propiedades. Si te interesa un depto o casa, decime.';

const SALUDOS_HUMANOS = [
  'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?',
  'Hola, soy Matias de Nodo Propiedades. En que puedo ayudarte?',
  'Buenas, soy Matias de Nodo Propiedades. En que te ayudo?',
  'Hola, soy Matias de Nodo Propiedades. En que te puedo ayudar?',
];

function esSaludoSimple(t) {
  if (typeof icEsSaludoVacio === 'function') return icEsSaludoVacio(t);
  const s = String(t || '').trim();
  return (
    s.length < 50 &&
    !/\b(depto|casa|alquil|compr|venta|propiedad|precio|usd|\d)\b/i.test(s) &&
    /^(hola|buen|buenas|qué tal|que tal|como est)/i.test(s)
  );
}

function esInvasivo(texto) {
  if (!texto) return false;
  const t = String(texto);
  if (/\b(hey|qué buscás|que buscas|compra,?\s*alquiler|alquiler o venta)\b/i.test(t)) {
    return true;
  }
  if (/\b(qué tipo de propiedad|para poder ayudarte|ayudarte mejor|me gustaría saber|contame un poco más|necesito que me|podés indicarme|sería ideal si)\b/i.test(t)) {
    return true;
  }
  if ((t.match(/\?/g) || []).length >= 2) return true;
  if (/\b(compra|alquiler|venta)\b/i.test(t) && esSaludoSimple(textoUsuario)) return true;
  if (esPreguntaEspecifica && suenaARobot(t)) return true;
  return false;
}

function suenaARobot(texto) {
  return /\b(me podr[ií]as indicar|podr[ií]as indicarme|para poder ayudarte mejor|indicame tu presupuesto|zona de mendoza que te interesa|qué tipo de propiedad|con gusto te ayudo|sería de gran ayuda|necesitaría saber|cuál es tu presupuesto|en qué zona|podés contarme|me ayudarías indicando|te gustar[ií]a que un asesor|encaj(?:en|an) con tu b[uú]squeda)\b/i.test(
    texto,
  );
}

function splitParrafos(texto) {
  return String(texto || '')
    .split(/\n{2,}|(?:\r?\n)+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 8 && p.length < 280);
}

const estadoRegex = /###ESTADO_ACTUAL:(frio|tibio|caliente)###/i;
const senalesRegex =
  /###SENALES###\s*({[\s\S]*?})\s*###FIN_SENALES###/i;
const leadRegex =
  /###LEAD_COMPLETO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_LEAD###/;
const propRegex =
  /###PROPIEDAD_SEGUIMIENTO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_PROP###/;
const mostrarRegex =
  /###MOSTRAR_PROPIEDADES###\s*(\[[\s\S]*?\])\s*###FIN_MOSTRAR###/i;
const burbujasRegex =
  /###BURBUJAS###\s*(\[[\s\S]*?\])\s*###FIN_BURBUJAS###/i;
const visitaRegex =
  /###SOLICITUD_VISITA###\s*({[\s\S]*?})\s*###FIN_VISITA###/i;

let working = respuestaCompleta || '';

const estadoMatch = working.match(estadoRegex);
let estadoActual = '';
if (estadoMatch) {
  estadoActual = String(estadoMatch[1] || '').toLowerCase();
  working = working
    .replace(/###ESTADO_ACTUAL:(frio|tibio|caliente)###/gi, '')
    .trim();
}

let senalesParsed = {};
const senalesMatch = working.match(senalesRegex);
if (senalesMatch) {
  try {
    senalesParsed = JSON.parse(senalesMatch[1].trim()) || {};
  } catch (e) {
    senalesParsed = {};
  }
  working = working.replace(senalesRegex, '').trim();
}

let propiedadesMostrar = [];
const mostrarMatch = working.match(mostrarRegex);
if (mostrarMatch) {
  try {
    const arr = JSON.parse(mostrarMatch[1].trim());
    if (Array.isArray(arr)) {
      propiedadesMostrar = arr
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch (e) {
    propiedadesMostrar = [];
  }
  working = working.replace(mostrarRegex, '').trim();
}

// HARD: clasificador dijo no stock → ignorar ###MOSTRAR### del modelo
if ((!debeMostrar && !forzarStockClasificador) || esCalificar || esSaludoTurno) {
  propiedadesMostrar = [];
}

if (!esSaludoTurno && !propiedadesMostrar.length && forzarStockClasificador && sugerenciasIds.length) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}
if (
  !esSaludoTurno &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length &&
  /\bno tengo( nada)?|sin stock|ahora mismo no tengo/i.test(working)
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}

if (
  !propiedadesMostrar.length &&
  esCurioso &&
  sugerenciasIds.length &&
  !skipReply &&
  !esOffTopic &&
  !esSaludoTurno
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}

if (esSaludoTurno) {
  propiedadesMostrar = [];
}

// Anti-visto: Groq falló / vacío + pedido de stock → forzar fichas YA
if (
  !esSaludoTurno &&
  !esCalificar &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length &&
  (groqFailed || !String(respuestaCompleta || '').trim()) &&
  (forzarStockClasificador || debeMostrar || pideStockTexto || Boolean(presupuestoDetectado))
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  working = '';
}

let mensajesExtra = [];
const burbujasMatch = working.match(burbujasRegex);
if (burbujasMatch) {
  try {
    const arr = JSON.parse(burbujasMatch[1].trim());
    if (Array.isArray(arr)) {
      mensajesExtra = arr
        .map((x) => humanizarVoz(quitarMuletillaChe(String(x || '').trim())))
        .filter(Boolean)
        .slice(0, 4);
    }
  } catch (e) {
    mensajesExtra = [];
  }
  working = working.replace(burbujasRegex, '').trim();
}

function armarIntroPropiedades(presu, variantIdx, curioso) {
  if (typeof introFichasHumana === 'function') {
    return introFichasHumana({
      textoUsuario: textoUsuario,
      presupuesto: presu,
      zona: zonaDetectada,
      curioso: curioso,
      variantIdx: variantIdx,
    });
  }
  const v = Number(variantIdx) || 0;
  const genericos = [
    'Mira estas',
    'Te mando estas para que veas',
    'Ahi van estas',
  ];
  return sanitizarPuntuacion(genericos[v % genericos.length]);
}

function pickCierreProps(variantIdx) {
  if (typeof cierreComercialHumano === 'function') {
    return cierreComercialHumano(variantIdx);
  }
  const opts = [
    'Cual de estas te cierra mas?',
    'Si queres te cuento mas de alguna',
    'Decime cual te interesa y vemos visita',
  ];
  return sanitizarPuntuacion(
    opts[Math.abs(Number(variantIdx) || 0) % opts.length],
  );
}

const MENSAJE_CIERRE_PROPS = pickCierreProps(turno);

let mensajeCierre = '';
let solicitudVisita = false;
let visitaData = {};
const visitaMatch = working.match(visitaRegex);
if (visitaMatch) {
  solicitudVisita = true;
  try {
    visitaData = JSON.parse(visitaMatch[1].trim());
  } catch (e) {
    visitaData = {};
  }
  working = working.replace(visitaRegex, '').trim();
}

const propMatch = working.match(propRegex);
let propiedadSeguimiento = propiedadPrevRaw;
if (propMatch) {
  try {
    const obj = JSON.parse(propMatch[1].trim());
    const idP = obj.id != null ? String(obj.id).trim() : '';
    const refP = obj.referencia != null ? String(obj.referencia).trim() : '';
    if (idP || refP) {
      propiedadSeguimiento = JSON.stringify({ id: idP, referencia: refP });
    }
  } catch (e) {
    propiedadSeguimiento = propiedadPrevRaw;
  }
  working = working.replace(
    /###PROPIEDAD_SEGUIMIENTO###[\s\S]*?###FIN_PROP###/,
    '',
  ).trim();
}

const match = working.match(leadRegex);
let leadCompleto = false;
let leadData = {};
let respuestaBot = working;

if (match) {
  try {
    leadData = JSON.parse(match[1].trim());
    leadCompleto = true;
    respuestaBot = working
      .replace(/###LEAD_COMPLETO###[\s\S]*?###FIN_LEAD###/, '')
      .trim();
  } catch (e) {
    leadCompleto = false;
  }
}

respuestaBot = quitarMuletillaChe(respuestaBot);
respuestaBot = reescribirSiRobot(
  respuestaBot,
  zonaDetectada,
  presupuestoDetectado,
);

if (skipReply) {
  respuestaBot = '';
  mensajesExtra = [];
  propiedadesMostrar = [];
  mensajeCierre = '';
  solicitudVisita = false;
} else if (esOffTopic) {
  respuestaBot = offTopicCount <= 1 ? OFF_TOPIC_MSG_1 : OFF_TOPIC_MSG_2;
  mensajesExtra = [];
  propiedadesMostrar = [];
  mensajeCierre = '';
  solicitudVisita = false;
} else if (esAlquilerPresupuestoAlto && !forzarStockClasificador) {
  if (
    suenaPlantillaRobot(respuestaBot) ||
    !respuestaBot ||
    respuestaBot.length < 20 ||
    /\bno tengo inmuebles|asesor de Nodo|encaj|no me cierra|\bUf\b/i.test(respuestaBot)
  ) {
    respuestaBot = armarMensajeAlquilerVsCompra(
      presupuestoDetectado,
      zonaDetectada,
    );
  }
  mensajesExtra = [];
  propiedadesMostrar = [];
  mensajeCierre = '';
  solicitudVisita = false;
} else if (mensajesExtra.length > 1) {
  respuestaBot = mensajesExtra[0];
  mensajesExtra = mensajesExtra.slice(1);
} else if (mensajesExtra.length === 1 && !respuestaBot) {
  respuestaBot = mensajesExtra[0];
  mensajesExtra = [];
}

if (
  !skipReply &&
  !esOffTopic &&
  !mensajesExtra.length &&
  (esDetalleUna || esPreguntaEspecifica) &&
  respuestaBot &&
  !propiedadesMostrar.length
) {
  const partes = splitParrafos(respuestaBot);
  if (partes.length > 1) {
    respuestaBot = partes[0];
    mensajesExtra = partes.slice(1, 4);
  }
}

// Si el modelo devuelve 2 bloques separados por doble salto de línea (y no usamos ###BURBUJAS###),
// mandalos como mensajes separados vía mensajes_extra.
if (
  !skipReply &&
  !esOffTopic &&
  !mensajesExtra.length &&
  respuestaBot &&
  /\r?\n{2,}/.test(String(respuestaBot))
) {
  const partes = splitParrafos(respuestaBot);
  if (partes.length > 1) {
    respuestaBot = partes[0];
    mensajesExtra = partes.slice(1, 4);
  }
}

let historialArrEarly = historialJson;
const consultaRepetidaEarly = esConsultaRepetida(textoUsuario, historialArrEarly);
const idxVariante = contarBotsSimilares(respuestaBot || '', historialArrEarly);

if (skipReply || esOffTopic) {
  // already set
} else if (esSaludoTurno) {
  propiedadesMostrar = [];
  mensajeCierre = '';
  const nombrePresentado = (function (t) {
    const m = String(t || '').match(/\bsoy\s+([a-záéíóúñüA-ZÁÉÍÓÚÑÜ]{2,20})\b/);
    if (!m) return '';
    const n = m[1].toLowerCase();
    return n.charAt(0).toUpperCase() + n.slice(1);
  })(textoUsuario);
  if (
    !respuestaBot ||
    esInvasivo(respuestaBot) ||
    (typeof esSaludoUnaPalabra === 'function' && esSaludoUnaPalabra(respuestaBot)) ||
    (typeof suenaPlantillaRobot === 'function' && suenaPlantillaRobot(respuestaBot)) ||
    /###MOSTRAR|te paso un par de opciones|matcheen|Soy Mat[ií]as[^.!?\n]{0,60}Cuando|cuando quieras contame|USD\s*\d/i.test(
      respuestaBot,
    )
  ) {
    if (esDiaNuevo && nombrePresentado) {
      respuestaBot =
        'Hola ' + nombrePresentado + ', que zona o presupuesto miras ahora?';
    } else if (esDiaNuevo) {
      respuestaBot =
        'Buenas, seguimos con la busqueda o queres que te muestre opciones?';
    } else {
      respuestaBot =
        typeof saludoHumanoCorto === 'function'
          ? saludoHumanoCorto(Math.max(turno, 1))
          : SALUDOS_HUMANOS[(Math.max(turno, 1) - 1) % SALUDOS_HUMANOS.length];
    }
  } else {
    respuestaBot = humanizarVoz(respuestaBot);
    if (
      (typeof esSaludoUnaPalabra === 'function' && esSaludoUnaPalabra(respuestaBot)) ||
      (typeof suenaPlantillaRobot === 'function' && suenaPlantillaRobot(respuestaBot))
    ) {
      respuestaBot =
        typeof saludoHumanoCorto === 'function'
          ? saludoHumanoCorto(Math.max(turno, 1))
          : SALUDOS_HUMANOS[0];
    }
  }
  mensajesExtra = [];
} else if (esCalificar) {
  propiedadesMostrar = [];
  mensajeCierre = '';
  mensajesExtra = [];
  if (
    !respuestaBot ||
    /###MOSTRAR|te paso un par|Alguna de estas te llama|te llama/i.test(
      respuestaBot,
    ) ||
    (typeof suenaPlantillaRobot === 'function' && suenaPlantillaRobot(respuestaBot))
  ) {
    respuestaBot =
      typeof preguntaAlgoPensado === 'function'
        ? preguntaAlgoPensado(turno)
        : 'Tenes algo pensado de zona o presupuesto, o preferis que te muestre opciones?';
  } else {
    respuestaBot = humanizarVoz(respuestaBot);
  }
} else if (propiedadesMostrar.length > 0) {
  respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (
  forzarStockClasificador &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if ((esSoloSaludo || esSaludoSimple(textoUsuario)) && turno <= 2) {
  respuestaBot = SALUDOS_HUMANOS[(turno - 1) % SALUDOS_HUMANOS.length];
} else if (esInvasivo(respuestaBot)) {
  if (esSaludoSimple(textoUsuario)) {
    respuestaBot = SALUDOS_HUMANOS[0];
    mensajesExtra = [];
  } else if (esPreguntaEspecifica || esDetalleUna) {
    respuestaBot = humanizarVoz(
      respuestaBot
        .replace(/\?[^.!?]*$/g, '.')
        .replace(/\b(me podr[ií]as|podr[ií]as indicarme|para poder ayudarte)[^.!?]*/gi, '')
        .trim(),
    ) || 'Dale, lo confirmo y te aviso.';
    mensajesExtra = [];
  } else {
    respuestaBot = reescribirSiRobot(
      respuestaBot,
      zonaDetectada,
      presupuestoDetectado,
    );
  }
} else if (
  (debeMostrar || esCurioso) &&
  !esSaludoTurno &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (suenaPlantillaRobot(respuestaBot)) {
  respuestaBot = reescribirSiRobot(
    respuestaBot,
    zonaDetectada,
    presupuestoDetectado,
  );
  mensajesExtra = [];
}

if (!skipReply && !esOffTopic && !respuestaBot) {
  if (
    !esSaludoTurno &&
    sugerenciasIds.length &&
    (forzarStockClasificador || debeMostrar || pideStockTexto || Boolean(presupuestoDetectado))
  ) {
    propiedadesMostrar = sugerenciasIds.slice(0, 3);
    respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
    mensajeCierre = MENSAJE_CIERRE_PROPS;
  } else if (groqFailed) {
    respuestaBot = FALLBACK_GROQ;
  } else {
    respuestaBot = esSaludoSimple(textoUsuario)
      ? (typeof saludoHumanoCorto === 'function'
          ? saludoHumanoCorto(turno)
          : SALUDOS_HUMANOS[0])
      : 'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?';
  }
}

// Si Groq crasheó / rate-limit pero hay presupuesto o pedido → NUNCA dejar visto
if (
  !skipReply &&
  !esOffTopic &&
  !esSaludoTurno &&
  (groqFailed || pideStockTexto) &&
  sugerenciasIds.length &&
  !propiedadesMostrar.length &&
  (forzarStockClasificador || debeMostrar || Boolean(presupuestoDetectado) || pideStockTexto)
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante, true);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
  mensajesExtra = [];
}

// Bloquear respuestas off-topic que se escaparon del modelo
if (
  !skipReply &&
  !esOffTopic &&
  /\b(lugar para comer|restaurante|te recomiendo.*(comer|comida)|herramienta de construcci)\b/i.test(
    respuestaBot,
  )
) {
  respuestaBot = OFF_TOPIC_MSG_1;
  mensajesExtra = [];
  propiedadesMostrar = [];
  mensajeCierre = '';
}

const consultaRepetida = consultaRepetidaEarly;
const botRepite =
  Boolean(promptData.bot_repite_sin_fichas) ||
  (typeof icBotRepiteSinFichas === 'function' && icBotRepiteSinFichas(historialJson));

// Spec criterio 5: mensaje repetido → fichas YA (no reformular ni pedir preferencias).
if (
  !skipReply &&
  !esOffTopic &&
  !esSaludoTurno &&
  (botRepite || consultaRepetida || repeticionDetectada) &&
  sugerenciasIds.length &&
  !propiedadesMostrar.length
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante + 1, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
  mensajesExtra = [];
}

if (!skipReply && !esOffTopic) {
  respuestaBot = evitarRepeticion(respuestaBot, {
    historialArr: historialJson,
    mensajeUsuario: textoUsuario,
    esAlquilerPresupuestoAlto: esAlquilerPresupuestoAlto && !forzarStockClasificador,
    forzarStock: forzarStockClasificador || propiedadesMostrar.length > 0,
    presupuestoDetectado,
    zonaDetectada,
  });
  if (propiedadesMostrar.length > 0 && (consultaRepetida || botRepite)) {
    respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante + 1, esCurioso);
  }
}

let temperatura = '';
if (leadCompleto && leadData.temperatura) {
  temperatura = String(leadData.temperatura).toLowerCase();
} else if (estadoActual) {
  temperatura = estadoActual;
}
if (!['frio', 'tibio', 'caliente'].includes(temperatura)) {
  temperatura = estadoActual || (presupuestoDetectado ? 'tibio' : 'frio');
}

const presupuestoOut =
  leadData.presupuesto ||
  visitaData.presupuesto ||
  (presupuestoDetectado ? 'USD ' + presupuestoDetectado : '');

const scoreTemp =
  typeof calcularTemperaturaLead === 'function'
    ? calcularTemperaturaLead({
        historialArr: historialJson,
        mensajeActual: textoUsuario,
        zona: leadData.zona || visitaData.zona || zonaDetectada,
        presupuesto: presupuestoOut,
        tipo_propiedad: leadData.tipo_propiedad || leadData.tipo || '',
        financiacion: senalesParsed.financiacion || leadData.financiacion || '',
        urgencia: senalesParsed.urgencia || leadData.urgencia || '',
        zona_concreta: senalesParsed.zona_concreta,
        tipo_concreto: senalesParsed.tipo_concreto,
        es_decisor: senalesParsed.es_decisor,
      })
    : {
        temperatura: temperatura || 'frio',
        bot_paused: false,
        handoff: false,
        estado_seguimiento: 'ninguno',
        senales: {},
        senales_fuertes: [],
        cierre_forzado: '',
        notif_resumen: '',
        motivo: 'fallback',
        puede_clasificar: true,
      };
temperatura = scoreTemp.temperatura;

const citaLinkParse = String(promptData.cita_link || '').trim();

// --- Detalle rico de la ultima / propiedad concreta (no solo direccion) ---
const pideDetalle =
  typeof pideDetallePropiedad === 'function'
    ? pideDetallePropiedad(textoUsuario)
    : false;
const idDetalle =
  typeof resolverIdUltimaPropiedad === 'function'
    ? resolverIdUltimaPropiedad(
        historialArrEarly,
        propiedadSeguimiento || propiedadPrevRaw,
        sugerenciasIds,
      )
    : '';
if (
  !skipReply &&
  !esOffTopic &&
  !esSaludoTurno &&
  (pideDetalle || esDetalleUna || esPreguntaEspecifica) &&
  idDetalle &&
  typeof armarDetallePropiedadRico === 'function'
) {
  const det = armarDetallePropiedadRico(idDetalle, PROP_MEDIA, null);
  if (det && det.burbujas && det.burbujas.length) {
    respuestaBot = det.burbujas[0];
    mensajesExtra = det.burbujas.slice(1);
    propiedadesMostrar = [idDetalle];
    mensajeCierre = '';
    propiedadSeguimiento = JSON.stringify({
      id: idDetalle,
      referencia: det.caption || idDetalle,
    });
  }
}

// Quien recibe en la visita (info concreta, sin handoff todavia)
if (
  !skipReply &&
  !esOffTopic &&
  /\b(quien me (va a )?(esper|recib)|quien (va a )?estar|quien atiende)\b/i.test(
    textoUsuario,
  )
) {
  respuestaBot =
    'Te recibe el agente de Nodo Propiedades en el inmueble. Si queres agendamos: te paso el link y el asesor te confirma el dia.';
  mensajesExtra = citaLinkParse ? ['Link agenda: ' + citaLinkParse] : [];
  mensajeCierre = '';
}

// --- Visita / handoff al asesor real ---
const pideVisitaTxt =
  typeof pideCoordinarVisita === 'function'
    ? pideCoordinarVisita(textoUsuario)
    : false;
const ultimoBotTxt = (function () {
  const arr = Array.isArray(historialArrEarly) ? historialArrEarly : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const role = String((arr[i] && arr[i].role) || '').toLowerCase();
    if (role === 'assistant' || role === 'bot') {
      return String(arr[i].content || '');
    }
  }
  return '';
})();
const botHabloVisita =
  /\b(visita|agendar|link|horario|coordin)\b/i.test(ultimoBotTxt) ||
  Boolean(solicitudVisita);
const confirmaOk =
  typeof confirmaCierreCorto === 'function'
    ? confirmaCierreCorto(textoUsuario)
    : false;

let forzarHandoffVisita = false;
// Si pide detalle/quien recibe, NO saltar a handoff de agenda
const esInfoVisitaSinAgendar =
  /\b(quien me (va a )?(esper|recib)|quien (va a )?estar|quien atiende)\b/i.test(
    textoUsuario,
  );
if (
  !skipReply &&
  !esOffTopic &&
  (solicitudVisita || pideVisitaTxt) &&
  !pideDetalle &&
  !esInfoVisitaSinAgendar
) {
  forzarHandoffVisita = true;
  const linkBit = citaLinkParse
    ? ' Link: ' + citaLinkParse
    : ' Te mando el link de agenda.';
  respuestaBot =
    'Dale, coordinamos.' +
    linkBit +
    ' Ya le aviso al asesor de Nodo y te confirma el dia por aca.';
  mensajeCierre = '';
  mensajesExtra = [];
  solicitudVisita = true;
  if (!visitaData.propiedad_id && idDetalle) {
    visitaData.propiedad_id = idDetalle;
  }
}
if (
  !skipReply &&
  !esOffTopic &&
  confirmaOk &&
  botHabloVisita &&
  !pideDetalle
) {
  forzarHandoffVisita = true;
  respuestaBot =
    'Dale, listo. El asesor te confirma por aca el horario. Cualquier duda escribi y te atiende el.';
  mensajeCierre = '';
  mensajesExtra = [];
}

if (forzarHandoffVisita) {
  scoreTemp.bot_paused = true;
  scoreTemp.handoff = true;
  scoreTemp.estado_seguimiento = 'respondido';
  scoreTemp.temperatura =
    scoreTemp.temperatura === 'frio' ? 'tibio' : scoreTemp.temperatura;
  temperatura = scoreTemp.temperatura;
}

// Ban cierre pasivo
if (
  /\bcualquier cosa avisame\b/i.test(String(respuestaBot || '')) ||
  (typeof suenaPlantillaRobot === 'function' &&
    suenaPlantillaRobot(respuestaBot) &&
    !propiedadesMostrar.length &&
    !forzarHandoffVisita)
) {
  if (forzarHandoffVisita) {
    // keep
  } else if (propiedadesMostrar.length) {
    respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
  } else {
    respuestaBot =
      'Decime si queres mas detalle de alguna o coordinamos visita.';
  }
}

// Rate limit: silencio + reintento Groq completo (cola justa). Sin "dame un segundo".
let reenvioRateLimit = false;
let reenvioTipo = '';
let reenvioIds = [];
let reenvioLink = '';
let retryGroq = false;
let waitRetrySec = 0;
let notifyOwnerGroq = false;
const MAX_GROQ_RETRIES = 4;
const MAX_GROQ_WAIT_MS = 5 * 60 * 1000;

if (isRateLimit) {
  try {
    const sdRl = $getWorkflowStaticData('global');
    if (!sdRl.groqTokenCtrl) sdRl.groqTokenCtrl = {};
    const ctrl = sdRl.groqTokenCtrl;
    const bumpMs = Math.max(retryAfterSec, 20) * 1000;
    ctrl.nextSlotAt = Math.max(Number(ctrl.nextSlotAt) || 0, Date.now() + bumpMs);

    if (!sdRl.groqRetry) sdRl.groqRetry = {};
    const st = sdRl.groqRetry[chatId] || { attempts: 0, since: Date.now() };
    if (!st.since) st.since = Date.now();
    st.attempts = Number(st.attempts || 0) + 1;
    sdRl.groqRetry[chatId] = st;

    const elapsed = Date.now() - Number(st.since);
    // Entrega real = fichas o link. Texto stub de 429 NO cuenta.
    const tieneEntrega =
      Boolean(propiedadesMostrar.length) || Boolean(String(citaLinkParse || '').trim());

    if (tieneEntrega) {
      // Ya hay fichas/link → no reintentar Groq; limpiar contador
      delete sdRl.groqRetry[chatId];
      if (propiedadesMostrar.length || sugerenciasIds.length) {
        reenvioRateLimit = false;
        reenvioTipo = 'fichas';
        reenvioIds = (propiedadesMostrar.length
          ? propiedadesMostrar
          : sugerenciasIds
        ).slice(0, 3);
      } else if (citaLinkParse) {
        reenvioTipo = 'link';
        reenvioLink = citaLinkParse;
      }
    } else if (st.attempts <= MAX_GROQ_RETRIES && elapsed < MAX_GROQ_WAIT_MS) {
      // Silencio al cliente; esperar TPM y rellamar Groq con el mismo prompt
      skipReply = true;
      retryGroq = true;
      waitRetrySec = Math.max(retryAfterSec, 20);
      respuestaBot = '';
      mensajeCierre = '';
      mensajesExtra = [];
      propiedadesMostrar = [];
    } else {
      // Agotado: avisar dueño YA y recién ahí un fallback mínimo al cliente
      delete sdRl.groqRetry[chatId];
      notifyOwnerGroq = true;
      skipReply = false;
      retryGroq = false;
      respuestaBot = FALLBACK_GROQ;
      mensajeCierre = '';
      mensajesExtra = [];
    }
  } catch (eRl) {
    notifyOwnerGroq = true;
    skipReply = false;
    respuestaBot = FALLBACK_GROQ;
  }
} else {
  try {
    const sdOk = $getWorkflowStaticData('global');
    if (sdOk.groqRetry && sdOk.groqRetry[chatId]) delete sdOk.groqRetry[chatId];
  } catch (eOk) {}
}

if (!skipReply && !esOffTopic) {
  if (temperatura === 'caliente' && !propiedadesMostrar.length && !forzarStockClasificador && !forzarHandoffVisita) {
    respuestaBot =
      typeof LT_CIERRE_CALIENTE === 'string'
        ? LT_CIERRE_CALIENTE
        : 'Dale, con esto ya puedo avanzar. Te armo visita o preferis que te llame?';
    mensajeCierre = '';
    mensajesExtra = [];
  } else if (temperatura === 'tibio' && !esSaludoTurno) {
    if (!propiedadesMostrar.length && sugerenciasIds.length && forzarStockClasificador) {
      propiedadesMostrar = sugerenciasIds.slice(0, 2);
      respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante, false);
    }
    if (propiedadesMostrar.length) {
      mensajeCierre = pickCierreProps(idxVariante + 1);
    }
  }
}

const tsHist = new Date().toISOString();
const lastHist = historialJson.length
  ? historialJson[historialJson.length - 1]
  : null;
const lastRole = String((lastHist && lastHist.role) || '').toLowerCase();
const lastContent = String(
  (lastHist && (lastHist.content || lastHist.texto)) || '',
).trim();
const userYaEnHistorial =
  (lastRole === 'user' || lastRole === 'cliente') &&
  lastContent === String(textoUsuario || '').trim();
if (!userYaEnHistorial) {
  historialJson.push(
    enriquecerEntradaHistorial(
      { role: 'user', content: textoUsuario, ts: tsHist },
      { intent_detected: leadData.operacion || '' },
    ),
  );
}
if (!skipReply && respuestaBot) {
  const analisisPost = analizarHistorial(historialJson.slice(0, -1), {
    operacion: leadData.operacion || '',
    zona: leadData.zona || visitaData.zona || zonaDetectada,
    presupuesto: presupuestoOut,
  });
  const metaTurno = metaTurnoAprendizaje({
    intencion: leadData.operacion || '',
    operacion: leadData.operacion || '',
    zona: leadData.zona || '',
    presupuesto: presupuestoOut,
    objeciones: analisisPost.objeciones,
    lead_completo: leadCompleto,
    temperatura,
  });
  let textoAsistente = respuestaBot;
  if (mensajeCierre) textoAsistente = textoAsistente + '\n\n' + mensajeCierre;
  historialJson.push(
    enriquecerEntradaHistorial(
      { role: 'assistant', content: textoAsistente, ts: tsHist },
      metaTurno,
    ),
  );
}
const histStoreMax =
  typeof IC_HISTORIAL_STORE_MAX === 'number' ? IC_HISTORIAL_STORE_MAX : 48;
if (historialJson.length > histStoreMax) {
  historialJson = historialJson.slice(historialJson.length - histStoreMax);
}

const sd = $getWorkflowStaticData('global');
if (!sd.historialByChat) sd.historialByChat = {};
sd.historialByChat[chatId] = historialJson;

const ahora = new Date().toISOString();

respuestaBot = humanizarVoz(sanitizarPuntuacion(respuestaBot));
// Anti "Hola]" / vacío tras sanitizar
if (!skipReply && !esOffTopic) {
  const soloBasura = !String(respuestaBot || '').trim() ||
    /^(hola|buenas?)[\s!.?\]]*$/i.test(String(respuestaBot || '').trim());
  if (soloBasura) {
    if (propiedadesMostrar.length) {
      respuestaBot = 'Mira estas';
    } else if (isRateLimit && !retryGroq) {
      respuestaBot = notifyOwnerGroq ? FALLBACK_GROQ : FALLBACK_RATE_LIMIT;
    } else if (groqFailed && !retryGroq) {
      respuestaBot = FALLBACK_GROQ;
    } else if (esSaludoSimple(textoUsuario) || esSaludoTurno) {
      respuestaBot =
        typeof saludoHumanoCorto === 'function'
          ? saludoHumanoCorto(turno)
          : SALUDOS_HUMANOS[0];
    } else {
      respuestaBot = FALLBACK_GROQ;
    }
  }
}

// Regla de oro: nunca narrar entrega futura si no hay fichas en este turno
const PROMESA_ENTREGA_RE =
  /\b(te muestro|ah[ií] van|aca te (dejo|muestro)|ac[aá] te (dejo|muestro)|mir[aá] estas|te paso|te mando|te env[ií]o|te dejo estas|ahora te (paso|mando|muestro))\b/i;
if (!propiedadesMostrar.length && PROMESA_ENTREGA_RE.test(String(respuestaBot || ''))) {
  if (isRateLimit && retryGroq) {
    respuestaBot = '';
  } else if (isRateLimit && notifyOwnerGroq) {
    respuestaBot = FALLBACK_GROQ;
  } else if (isRateLimit) {
    respuestaBot = FALLBACK_RATE_LIMIT;
  } else if (sugerenciasIds.length && (forzarStockClasificador || debeMostrar || pideStockTexto)) {
    propiedadesMostrar = sugerenciasIds.slice(0, 3);
    respuestaBot =
      typeof armarIntroPropiedades === 'function'
        ? armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso)
        : 'Mira estas';
    mensajeCierre = typeof MENSAJE_CIERRE_PROPS !== 'undefined' ? MENSAJE_CIERRE_PROPS : mensajeCierre;
  } else {
    respuestaBot = String(respuestaBot || '')
      .replace(PROMESA_ENTREGA_RE, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!respuestaBot) {
      respuestaBot =
        typeof preguntaAlgoPensado === 'function'
          ? preguntaAlgoPensado(turno)
          : 'Tenes algo pensado de zona o presupuesto, o preferis que te muestre opciones?';
    }
  }
}
if (propiedadesMostrar.length && !String(respuestaBot || '').trim()) {
  respuestaBot = 'Mira estas';
}

mensajeCierre = humanizarVoz(sanitizarPuntuacion(mensajeCierre));
if (mensajesExtra.length) {
  mensajesExtra = mensajesExtra
    .map((x) => humanizarVoz(sanitizarPuntuacion(x)))
    .filter(Boolean);
}

const aprendizajeOpts = {
  contexto_cliente: textoUsuario,
  respuesta_matias: respuestaBot,
  canal: 'telegram',
  zona: leadData.zona || visitaData.zona || zonaDetectada,
  operacion: leadData.operacion || '',
  presupuesto: presupuestoOut,
  temperatura,
  intencion: leadData.operacion || intencionClasificador || '',
  intencion_clasificador: intencionClasificador,
  lead_completo: leadCompleto,
  skip_reply: skipReply,
  es_off_topic: esOffTopic,
  fecha: ahora,
};
let regAprendizaje = {};
try {
  regAprendizaje =
    typeof prepararRegistroAprendizaje === 'function'
      ? prepararRegistroAprendizaje(aprendizajeOpts) || {}
      : {};
} catch (eAprend) {
  regAprendizaje = {};
}

return [
  {
    json: {
      chat_id: chatId,
      nombre_usuario: nombreUsuario,
      lead_completo: leadCompleto,
      respuesta_bot: respuestaBot || (propiedadesMostrar.length ? 'Mira estas' : 'Buenas, en que te ayudo?'),
      historial_json: JSON.stringify(historialJson),
      turno: turno,
      row_exists: rowExists,
      fecha: ahora,
      nombre: leadData.nombre || nombreUsuario,
      zona: leadData.zona || visitaData.zona || '',
      presupuesto: presupuestoOut,
      tipo_operacion: leadData.operacion || '',
      temperatura: temperatura,
      resumen: leadData.resumen || '',
      texto_usuario: textoUsuario,
      propiedad_seguimiento: propiedadSeguimiento,
      propiedades_mostrar: JSON.stringify(propiedadesMostrar),
      solicitud_visita: solicitudVisita,
      visita_propiedad_id: String(visitaData.propiedad_id || ''),
      visita_nota: String(visitaData.nota || ''),
      mensaje_cierre: mensajeCierre,
      mensajes_extra: JSON.stringify(mensajesExtra),
      repeticion_detectada: repeticionDetectada,
      skip_reply: skipReply,
      bot_paused: scoreTemp.bot_paused ? 'si' : 'no',
      handoff: scoreTemp.handoff ? 'si' : 'no',
      estado_seguimiento: scoreTemp.estado_seguimiento || 'ninguno',
      senales_json: JSON.stringify(scoreTemp.senales || {}),
      senales_fuertes: (scoreTemp.senales_fuertes || []).join(','),
      notif_resumen: scoreTemp.notif_resumen || '',
      temperatura_motivo: scoreTemp.motivo || '',
      es_off_topic: esOffTopic,
      off_topic_count: offTopicCount,
      rate_limit: isRateLimit,
      groq_failed: groqFailed,
      reenvio_rate_limit: reenvioRateLimit,
      reenvio_tipo: reenvioTipo,
      reenvio_ids: JSON.stringify(reenvioIds),
      reenvio_link: reenvioLink,
      retry_groq: retryGroq,
      wait_retry_sec: waitRetrySec,
      notify_owner_groq: notifyOwnerGroq,
      needs_advisor_action: Boolean(
        notifyOwnerGroq ||
          scoreTemp.bot_paused ||
          forzarHandoffVisita,
      ),
      cita_link: citaLinkParse,
      ...regAprendizaje,
    },
  },
];
