const groqData = $input.first().json;
const promptData = $('Construir Prompt').first().json;

const repeticionDetectada = Boolean(promptData.repeticion_detectada);

const groqFailed = Boolean(
  groqData &&
    (groqData.error ||
      groqData.errorType ||
      String((groqData.error && groqData.error.message) || groqData.message || '').match(
        /Bad request|unsupported|messages\.\d+/i,
      )),
);
const choices = Array.isArray(groqData.choices) ? groqData.choices : [];
const msgGroq = (choices[0] && choices[0].message) || {};
let respuestaCompleta =
  (msgGroq.content && String(msgGroq.content).trim()) ||
  String(msgGroq.reasoning || msgGroq.reasoning_content || '').trim();
if (groqFailed && !respuestaCompleta) respuestaCompleta = '';

const chatId = String(promptData.chat_id || '');
const textoUsuario = String(promptData.texto_usuario || '');
const nombreUsuario = promptData.nombre_usuario;
let historialJson = Array.isArray(promptData.historial_json)
  ? promptData.historial_json
  : [];
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
const forzarStockClasificador =
  debeMostrar ||
  pideOpcionesFlag ||
  intencionClasificador === 'pedir_opciones' ||
  intencionClasificador === 'explorar' ||
  intencionClasificador === 'presupuesto' ||
  Boolean(presupuestoDetectado);
const esSoloSaludo = Boolean(promptData.es_solo_saludo);
const esDetalleUna = Boolean(promptData.es_detalle_una);
const esPreguntaEspecifica = Boolean(promptData.es_pregunta_especifica);
const esOffTopic = Boolean(promptData.es_off_topic);
const offTopicCount = Number(promptData.off_topic_count || 0) || 0;
const skipReply = Boolean(promptData.skip_reply) || offTopicCount >= 3;
const esAlquilerPresupuestoAlto = Boolean(
  promptData.es_alquiler_presupuesto_alto,
);
const zonaDetectada = String(promptData.zona_detectada || '');

const OFF_TOPIC_MSG_1 =
  'Solo trabajo con propiedades. Si buscás depto o casa en Mendoza, avisame.';
const OFF_TOPIC_MSG_2 =
  'Acá solo propiedades. Si te interesa un depto o casa, decime.';

const SALUDOS_HUMANOS = [
  'Hola, cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás',
  'Buen día. Soy Matías, de Nodo Propiedades. Contame cuando quieras qué buscás',
];

function esSaludoSimple(t) {
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

if (!propiedadesMostrar.length && forzarStockClasificador && sugerenciasIds.length) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}
if (
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
  !esOffTopic
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
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
  const v = Number(variantIdx) || 0;
  if (presu) {
    const presuFmt = Number(presu).toLocaleString('es-AR');
    const opts = [
      'Dale, te paso un par de opciones en venta cerca de USD ' + presuFmt,
      'Mirá estas opciones que se acercan a USD ' +
        Number(presu).toLocaleString('es-AR'),
    ];
    return sanitizarPuntuacion(opts[v % opts.length]);
  }
  if (curioso) {
    const curiosos = [
      'Dale, te paso un par de opciones para que veas',
      'Te paso un par de opciones variadas para que veas lo que hay',
    ];
    return sanitizarPuntuacion(curiosos[v % curiosos.length]);
  }
  const genericos = [
    'Dale, te paso un par de opciones que tengo',
    'Te comparto un par de alternativas que encajan con lo que venís buscando',
  ];
  return genericos[v % genericos.length];
}

const MENSAJE_CIERRE_PROPS = esCurioso
  ? 'Alguna zona te cierra más o querés ver otras?'
  : 'Cuál te llama más la atención o querés que te cuente más detalles de alguna?';

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
  respuestaBot = esSaludoSimple(textoUsuario)
    ? SALUDOS_HUMANOS[0]
    : 'Hola, soy Matías de Nodo Propiedades. Contame qué buscás y te ayudo.';
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

if (
  !skipReply &&
  !esOffTopic &&
  (botRepite || consultaRepetida) &&
  sugerenciasIds.length &&
  !propiedadesMostrar.length &&
  (forzarStockClasificador || debeMostrar || Boolean(presupuestoDetectado))
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuestaBot = armarIntroPropiedades(presupuestoDetectado, idxVariante + 1, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
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

historialJson.push(
  enriquecerEntradaHistorial({ role: 'user', content: textoUsuario }, { intent_detected: leadData.operacion || '' }),
);
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
  historialJson.push(enriquecerEntradaHistorial({ role: 'assistant', content: textoAsistente }, metaTurno));
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

respuestaBot = sanitizarPuntuacion(respuestaBot);
mensajeCierre = sanitizarPuntuacion(mensajeCierre);
if (mensajesExtra.length) {
  mensajesExtra = mensajesExtra.map(sanitizarPuntuacion).filter(Boolean);
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
const regAprendizaje = prepararRegistroAprendizaje(aprendizajeOpts);

return [
  {
    json: {
      chat_id: chatId,
      nombre_usuario: nombreUsuario,
      lead_completo: leadCompleto,
      respuesta_bot: respuestaBot,
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
      es_off_topic: esOffTopic,
      off_topic_count: offTopicCount,
      ...regAprendizaje,
    },
  },
];
