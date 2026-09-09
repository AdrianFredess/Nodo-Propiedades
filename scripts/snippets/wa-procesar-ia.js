const textoIA = ($json.text || '').trim();
const prep = $('Code - Armar Prompt').item.json;

const repeticionDetectada = Boolean(prep.repeticion_detectada);

let temperatura = 'frio';
let intencion = 'consulta general';
let respuesta =
  'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?';
const iaVacia = !textoIA;

let operacion = prep.operacion_prev || '';
let tipo_propiedad = prep.tipo_prev || '';
let zona = prep.zona_prev || '';
let presupuesto = prep.presupuesto_prev || '';
let dormitorios = prep.dormitorios_prev || '';
let lead_completo = false;
let financiacionHint = '';
let urgenciaHint = '';
let zonaConcretaHint = null;
let tipoConcretoHint = null;
let esDecisorHint = null;

try {
  const match = textoIA.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    temperatura = parsed.temperatura || temperatura;
    intencion = parsed.intencion || intencion;
    respuesta = parsed.respuesta || respuesta;
    operacion = parsed.operacion || operacion;
    tipo_propiedad = parsed.tipo_propiedad || tipo_propiedad;
    zona = parsed.zona || zona;
    presupuesto = parsed.presupuesto || presupuesto;
    dormitorios = parsed.dormitorios || dormitorios;
    lead_completo = Boolean(parsed.lead_completo);
    financiacionHint = parsed.financiacion || '';
    urgenciaHint = parsed.urgencia || '';
    if (typeof parsed.zona_concreta === 'boolean') zonaConcretaHint = parsed.zona_concreta;
    if (typeof parsed.tipo_concreto === 'boolean') tipoConcretoHint = parsed.tipo_concreto;
    if (parsed.es_decisor != null) esDecisorHint = parsed.es_decisor;
  }
} catch (e) {}

let sugerenciasIds = [];
try {
  sugerenciasIds = JSON.parse(prep.sugerencias_ids || '[]');
} catch (e) {
  sugerenciasIds = [];
}
if (!Array.isArray(sugerenciasIds)) sugerenciasIds = [];

const debeMostrar = Boolean(prep.debe_mostrar_propiedades);
const esCurioso = Boolean(prep.es_curioso);
const presupuestoDetectado = String(prep.presupuesto_detectado || '');
const esAlquilerPresupuestoAlto = Boolean(prep.es_alquiler_presupuesto_alto);
const zonaDetectada = String(prep.zona_detectada || '');
const intencionClasificador = String(prep.intencion_clasificador || '');
const pideOpcionesFlag = Boolean(prep.pide_opciones);
const msgUsuarioWa = String(prep.mensaje || prep.texto_usuario || prep.body || '');
const pideStockTextoWa =
  /\b(a ver|enviame|envi[aá]|mandame|mand[aá]|pasame|pas[aá]|mostrame|mostr[aá]|lo que tengas|opciones)\b/i.test(
    msgUsuarioWa,
  ) || /^(a ver|dale|mostrame|mandame|enviame|pasame)[\s!.?]*$/i.test(msgUsuarioWa);
const esCalificarRaw = Boolean(
  prep.es_calificar ||
    prep.busqueda_vaga ||
    intencionClasificador === 'calificar',
);
const esCalificar = esCalificarRaw && !pideOpcionesFlag && !pideStockTextoWa && !debeMostrar;
const esSoloSaludo = Boolean(prep.es_solo_saludo);
const esDiaNuevo = Boolean(prep.es_dia_nuevo || prep.es_recontacto);
const esSaludoTurno =
  esSoloSaludo ||
  intencionClasificador === 'saludo' ||
  (typeof icEsSaludoVacio === 'function' && icEsSaludoVacio(msgUsuarioWa) && !pideStockTextoWa) ||
  (esDiaNuevo && !pideOpcionesFlag && !debeMostrar && !pideStockTextoWa);
const forzarStockClasificador =
  !esSaludoTurno &&
  (debeMostrar || pideOpcionesFlag || pideStockTextoWa) &&
  (intencionClasificador === 'pedir_opciones' ||
    intencionClasificador === 'presupuesto' ||
    Boolean(presupuestoDetectado) ||
    pideOpcionesFlag ||
    pideStockTextoWa ||
    debeMostrar);

const mostrarRegex =
  /###MOSTRAR_PROPIEDADES###\s*(\[[\s\S]*?\])\s*###FIN_MOSTRAR###/i;
const burbujasRegex =
  /###BURBUJAS###\s*(\[[\s\S]*?\])\s*###FIN_BURBUJAS###/i;
const visitaRegex =
  /###SOLICITUD_VISITA###\s*({[\s\S]*?})\s*###FIN_VISITA###/i;

let working = String(respuesta || '');

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

// Anti-visto: IA vacía + pedido/presupuesto → forzar IDs
if (
  iaVacia &&
  !esSaludoTurno &&
  !esCalificar &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length &&
  (forzarStockClasificador || debeMostrar || pideStockTextoWa || Boolean(presupuestoDetectado))
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}

const diceSinStock = /\bno tengo( nada)?|sin stock|no (hay|encuentro) (nada|opciones)|ahora mismo no tengo/i.test(
  working,
);
if (
  (forzarStockClasificador || (debeMostrar && !esSaludoTurno) || (diceSinStock && !esSaludoTurno)) &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length &&
  !String(prep.respuesta_forzada || '').trim()
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}

if (
  !propiedadesMostrar.length &&
  esCurioso &&
  sugerenciasIds.length &&
  !esSaludoTurno &&
  !String(prep.respuesta_forzada || '').trim()
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
        .map((x) => humanizarVoz(String(x || '').trim()))
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
      textoUsuario: msgUsuarioWa,
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

const MENSAJE_CIERRE_PROPS = pickCierreProps(1);

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
  if (visitaData.zona && !zona) zona = String(visitaData.zona);
  if (visitaData.presupuesto && !presupuesto) presupuesto = String(visitaData.presupuesto);
}

respuesta = humanizarVoz(working);

if (String(prep.respuesta_forzada || '').trim()) {
  respuesta = String(prep.respuesta_forzada).trim();
  mensajesExtra = [];
  propiedadesMostrar = [];
  mensajeCierre = '';
  solicitudVisita = false;
} else if (esAlquilerPresupuestoAlto && !forzarStockClasificador) {
  if (
    suenaPlantillaRobot(respuesta) ||
    !respuesta ||
    respuesta.length < 20 ||
    /\bno tengo inmuebles|asesor de Nodo|encaj|no me cierra|\bUf\b/i.test(respuesta)
  ) {
    respuesta = armarMensajeAlquilerVsCompra(
      presupuestoDetectado,
      zonaDetectada,
    );
  } else {
    respuesta = reescribirSiRobot(respuesta, zonaDetectada, presupuestoDetectado);
  }
  mensajesExtra = [];
  propiedadesMostrar = [];
  mensajeCierre = '';
  solicitudVisita = false;
} else if (mensajesExtra.length > 1) {
  respuesta = mensajesExtra[0];
  mensajesExtra = mensajesExtra.slice(1);
} else if (mensajesExtra.length === 1 && !respuesta) {
  respuesta = mensajesExtra[0];
  mensajesExtra = [];
}

let historialArr = parseHistorialArr(prep.historial_json_prev);
const idxVariante = contarBotsSimilares(respuesta || '', historialArr);

if (String(prep.respuesta_forzada || '').trim() || (esAlquilerPresupuestoAlto && !forzarStockClasificador)) {
  // already set
} else if (esSaludoTurno) {
  propiedadesMostrar = [];
  mensajeCierre = '';
  mensajesExtra = [];
  const nombrePresentado = (function (t) {
    const m = String(t || '').match(/\bsoy\s+([a-záéíóúñüA-ZÁÉÍÓÚÑÜ]{2,20})\b/);
    if (!m) return '';
    const n = m[1].toLowerCase();
    return n.charAt(0).toUpperCase() + n.slice(1);
  })(msgUsuarioWa);
  if (
    !respuesta ||
    (typeof esSaludoUnaPalabra === 'function' && esSaludoUnaPalabra(respuesta)) ||
    (typeof suenaPlantillaRobot === 'function' && suenaPlantillaRobot(respuesta)) ||
    /###MOSTRAR|te paso un par de opciones|matcheen|Soy Mat[ií]as[^.!?\n]{0,60}Cuando|cuando quieras contame|USD\s*\d/i.test(
      respuesta,
    )
  ) {
    if (esDiaNuevo && nombrePresentado) {
      respuesta =
        'Hola ' + nombrePresentado + ', que zona o presupuesto miras ahora?';
    } else if (esDiaNuevo) {
      respuesta =
        'Buenas, seguimos con la busqueda o queres que te muestre opciones?';
    } else {
      respuesta =
        typeof saludoHumanoCorto === 'function'
          ? saludoHumanoCorto(idxVariante + 1)
          : 'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?';
    }
  } else {
    respuesta = humanizarVoz(respuesta);
    if (
      (typeof esSaludoUnaPalabra === 'function' && esSaludoUnaPalabra(respuesta)) ||
      (typeof suenaPlantillaRobot === 'function' && suenaPlantillaRobot(respuesta))
    ) {
      respuesta =
        typeof saludoHumanoCorto === 'function'
          ? saludoHumanoCorto(idxVariante + 1)
          : 'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?';
    }
  }
} else if (esCalificar) {
  propiedadesMostrar = [];
  mensajeCierre = '';
  mensajesExtra = [];
  if (
    !respuesta ||
    /###MOSTRAR|te paso un par|Alguna de estas te llama|te llama/i.test(
      respuesta,
    ) ||
    (typeof suenaPlantillaRobot === 'function' && suenaPlantillaRobot(respuesta))
  ) {
    respuesta =
      typeof preguntaAlgoPensado === 'function'
        ? preguntaAlgoPensado(idxVariante)
        : 'Tenes algo pensado de zona o presupuesto, o preferis que te muestre opciones?';
  } else {
    respuesta = humanizarVoz(respuesta);
  }
} else if (propiedadesMostrar.length > 0) {
  respuesta = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (
  forzarStockClasificador &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuesta = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (
  (debeMostrar || esCurioso) &&
  !esSaludoTurno &&
  !esCalificar &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuesta = armarIntroPropiedades(presupuestoDetectado, idxVariante, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (suenaPlantillaRobot(respuesta)) {
  respuesta = reescribirSiRobot(
    respuesta,
    zonaDetectada,
    presupuestoDetectado,
  );
  mensajesExtra = [];
}

const FALLBACK_GROQ =
  'Perdon, se corto un toque. Me repetis que necesitas?';

if (iaVacia && !respuesta) {
  if (
    !esSaludoTurno &&
    sugerenciasIds.length &&
    (forzarStockClasificador || debeMostrar || pideStockTextoWa)
  ) {
    propiedadesMostrar = sugerenciasIds.slice(0, 3);
    respuesta = armarIntroPropiedades(presupuestoDetectado, 0, esCurioso);
    mensajeCierre = MENSAJE_CIERRE_PROPS;
  } else if (esSaludoTurno || esSoloSaludo) {
    respuesta =
      typeof saludoHumanoCorto === 'function'
        ? saludoHumanoCorto(2)
        : 'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?';
  } else {
    respuesta = FALLBACK_GROQ;
  }
}

const consultaRepetida = esConsultaRepetida(prep.mensaje, historialArr);
const botRepite =
  Boolean(prep.bot_repite_sin_fichas) ||
  (typeof icBotRepiteSinFichas === 'function' && icBotRepiteSinFichas(historialArr));

if (
  !String(prep.respuesta_forzada || '').trim() &&
  !esSaludoTurno &&
  !esCalificar &&
  (botRepite || consultaRepetida) &&
  sugerenciasIds.length &&
  !propiedadesMostrar.length &&
  (forzarStockClasificador || debeMostrar || Boolean(presupuestoDetectado))
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuesta = armarIntroPropiedades(presupuestoDetectado, idxVariante + 1, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
}

if (!String(prep.respuesta_forzada || '').trim()) {
  respuesta = evitarRepeticion(respuesta, {
    historialArr,
    mensajeUsuario: prep.mensaje,
    esAlquilerPresupuestoAlto: esAlquilerPresupuestoAlto && !forzarStockClasificador,
    forzarStock: forzarStockClasificador || propiedadesMostrar.length > 0,
    presupuestoDetectado,
    zonaDetectada,
  });
  if (propiedadesMostrar.length > 0 && (consultaRepetida || botRepite)) {
    respuesta = armarIntroPropiedades(presupuestoDetectado, idxVariante + 1, esCurioso);
  }
}

// Si el modelo devuelve 2 bloques separados por doble salto de línea (y no hay ###BURBUJAS###),
// el sistema los envía como mensajes separados vía mensajes_extra.
if (!mensajesExtra.length && respuesta && !String(prep.respuesta_forzada || '').trim()) {
  const parts = String(respuesta)
    .split(/\r?\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    respuesta = parts[0];
    mensajesExtra = parts.slice(1, 3); // máximo 2 bloques (principal + 1 extra)
  }
}

if (!presupuesto && presupuestoDetectado) {
  presupuesto = 'USD ' + presupuestoDetectado;
}

const scoreTemp =
  typeof calcularTemperaturaLead === 'function'
    ? calcularTemperaturaLead({
        historialArr: Array.isArray(historialArr)
          ? historialArr
          : parseHistorialArr(prep.historial_json_prev),
        mensajeActual: prep.mensaje,
        zona: zona || zonaDetectada,
        presupuesto,
        tipo_propiedad,
        financiacion: financiacionHint,
        urgencia: urgenciaHint,
        zona_concreta: zonaConcretaHint,
        tipo_concreto: tipoConcretoHint,
        es_decisor: esDecisorHint,
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

if (temperatura === 'caliente') {
  respuesta =
    typeof LT_CIERRE_CALIENTE === 'string'
      ? LT_CIERRE_CALIENTE
      : 'Dale, con esto ya puedo avanzar. Te armo visita o preferis que te llame?';
  mensajeCierre = '';
  mensajesExtra = [];
} else if (temperatura === 'tibio' && !esSaludoTurno) {
  if (!propiedadesMostrar.length && sugerenciasIds.length && forzarStockClasificador) {
    propiedadesMostrar = sugerenciasIds.slice(0, 2);
    if (!String(prep.respuesta_forzada || '').trim()) {
      respuesta = armarIntroPropiedades(presupuestoDetectado, idxVariante, false);
    }
  }
  if (propiedadesMostrar.length) {
    mensajeCierre = pickCierreProps(idxVariante + 1);
  }
}

const lineCliente = 'Cliente: ' + String(prep.mensaje || '').trim();
const lineBot = 'Bot: ' + String(respuesta || '').trim();
const prev = String(prep.historial_prev || '').trim();
let historial = prev ? prev + '\n' + lineCliente + '\n' + lineBot : lineCliente + '\n' + lineBot;
const lines = historial.split('\n').filter(Boolean);
if (lines.length > 40) historial = lines.slice(-40).join('\n');

if (!Array.isArray(historialArr)) historialArr = [];
const ts = new Date().toISOString();
const analisisPost = analizarHistorial(historialArr, {
  operacion,
  zona,
  presupuesto,
  dormitorios,
});
const metaTurno = metaTurnoAprendizaje({
  intencion,
  operacion,
  zona: zona || zonaDetectada,
  presupuesto,
  objeciones: analisisPost.objeciones,
  lead_completo,
  temperatura,
});

historialArr.push(
  enriquecerEntradaHistorial(
    { role: 'user', content: String(prep.mensaje || '').trim(), ts },
    { intent_detected: intencion },
  ),
);
let textoAsistente = respuesta;
if (mensajeCierre) textoAsistente = textoAsistente + '\n\n' + mensajeCierre;
historialArr.push(
  enriquecerEntradaHistorial(
    { role: 'assistant', content: String(textoAsistente || '').trim(), ts },
    metaTurno,
  ),
);
const histStoreMaxWa =
  typeof IC_HISTORIAL_STORE_MAX === 'number' ? IC_HISTORIAL_STORE_MAX : 48;
if (historialArr.length > histStoreMaxWa) {
  historialArr = historialArr.slice(historialArr.length - histStoreMaxWa);
}
let historial_json = JSON.stringify(historialArr);

const now = new Date();
const lastRaw = prep.ultima_prev || prep.fecha || '';
const lastTs = lastRaw ? new Date(lastRaw).getTime() : 0;
const daysGap = lastTs ? (now.getTime() - lastTs) / (1000 * 60 * 60 * 24) : 999;
const changedProperty =
  (zona && prep.zona_prev && zona.toLowerCase() !== String(prep.zona_prev).toLowerCase()) ||
  (tipo_propiedad &&
    prep.tipo_prev &&
    tipo_propiedad.toLowerCase() !== String(prep.tipo_prev).toLowerCase()) ||
  (operacion &&
    prep.operacion_prev &&
    operacion.toLowerCase() !== String(prep.operacion_prev).toLowerCase());
const esNuevaConsulta = !prep.isKnownLead || daysGap >= 14 || Boolean(changedProperty) ? 'si' : 'no';

const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, '0');
const d = String(now.getDate()).padStart(2, '0');
const hh = String(now.getHours()).padStart(2, '0');
const mm = String(now.getMinutes()).padStart(2, '0');
const fechaLocal = y + '-' + m + '-' + d + ' ' + hh + ':' + mm;
const mes = y + '-' + m;
const consultaId =
  'c_' + String(prep.phone || 'x').slice(-8) + '_' + now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const prevCount = Number(prep.consultas_count_prev || 0) || 0;
const consultas_count = esNuevaConsulta === 'si' ? prevCount + 1 : Math.max(prevCount, 1);

respuesta = humanizarVoz(sanitizarPuntuacion(respuesta));
// Anti "Hola]" / vacío tras sanitizar
{
  const soloBasura =
    !String(respuesta || '').trim() ||
    /^(hola|buenas?)[\s!.?\]]*$/i.test(String(respuesta || '').trim());
  if (soloBasura) {
    if (propiedadesMostrar.length) {
      respuesta = 'Mira estas';
    } else if (iaVacia) {
      respuesta = FALLBACK_GROQ;
    } else if (esSaludoTurno || esSoloSaludo) {
      respuesta =
        typeof saludoHumanoCorto === 'function'
          ? saludoHumanoCorto(2)
          : 'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?';
    } else {
      respuesta = FALLBACK_GROQ;
    }
  }
}
mensajeCierre = humanizarVoz(sanitizarPuntuacion(mensajeCierre));
if (mensajesExtra.length) {
  mensajesExtra = mensajesExtra
    .map((x) => humanizarVoz(sanitizarPuntuacion(x)))
    .filter(Boolean);
}

const aprendizajeOpts = {
  contexto_cliente: prep.mensaje,
  respuesta_matias: respuesta,
  canal: prep.canal || 'whatsapp',
  zona: zona || zonaDetectada,
  operacion,
  presupuesto,
  temperatura,
  intencion,
  lead_completo,
  skip_reply: prep.skip_reply,
  respuesta_forzada: prep.respuesta_forzada,
  es_off_topic: prep.es_off_topic,
  intencion_clasificador: prep.intencion_clasificador || intencionClasificador,
  fecha: fechaLocal,
};
const regAprendizaje = prepararRegistroAprendizaje(aprendizajeOpts);

return [
  {
    json: {
      canal: prep.canal,
      chat_id: prep.chat_id,
      dedupe_key: prep.dedupe_key,
      lead_name: prep.lead_name,
      phone: prep.phone,
      mensaje: prep.mensaje,
      waba_message_id: prep.waba_message_id,
      fecha: now.toISOString(),
      fecha_local: fechaLocal,
      mes: mes,
      anio: String(y),
      consulta_id: consultaId,
      es_nueva_consulta: esNuevaConsulta,
      consultas_count: String(consultas_count),
      temperatura,
      intencion,
      respuesta_wa: respuesta,
      operacion,
      tipo_propiedad,
      zona,
      presupuesto,
      dormitorios,
      lead_completo: lead_completo ? 'si' : 'no',
      historial,
      historial_json,
      status: lead_completo || temperatura === 'caliente' || temperatura === 'tibio' ? 'calificado' : 'abierto',
      bot_paused: scoreTemp.bot_paused ? 'si' : 'no',
      handoff: scoreTemp.handoff ? 'si' : 'no',
      estado_seguimiento: scoreTemp.estado_seguimiento || 'ninguno',
      senales_json: JSON.stringify(scoreTemp.senales || {}),
      senales_fuertes: (scoreTemp.senales_fuertes || []).join(','),
      notif_resumen: scoreTemp.notif_resumen || '',
      temperatura_motivo: scoreTemp.motivo || '',
      propiedades_mostrar: JSON.stringify(propiedadesMostrar),
      solicitud_visita: solicitudVisita,
      visita_propiedad_id: String(visitaData.propiedad_id || ''),
      visita_nota: String(visitaData.nota || ''),
      mensaje_cierre: mensajeCierre,
      mensajes_extra: JSON.stringify(mensajesExtra),
      repeticion_detectada: repeticionDetectada,
      intent_detected: intencionClasificador || intencion,
      objeciones: JSON.stringify(analisisPost.objeciones || []),
      ...regAprendizaje,
    },
  },
];
