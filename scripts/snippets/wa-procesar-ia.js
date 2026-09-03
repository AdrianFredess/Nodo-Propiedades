const textoIA = ($json.text || '').trim();
const prep = $('Code - Armar Prompt').item.json;

const repeticionDetectada = Boolean(prep.repeticion_detectada);

let temperatura = 'frio';
let intencion = 'consulta general';
let respuesta =
  'Hola, soy Matías de Nodo Propiedades. Contame qué tipo de propiedad buscás y en qué zona, así te paso opciones concretas.';
const iaVacia = !textoIA;

let operacion = prep.operacion_prev || '';
let tipo_propiedad = prep.tipo_prev || '';
let zona = prep.zona_prev || '';
let presupuesto = prep.presupuesto_prev || '';
let dormitorios = prep.dormitorios_prev || '';
let lead_completo = false;

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
const forzarStockClasificador = debeMostrar || intencionClasificador === 'pedir_opciones' || intencionClasificador === 'explorar';

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

if (!propiedadesMostrar.length && forzarStockClasificador && sugerenciasIds.length) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}

if (
  !propiedadesMostrar.length &&
  esCurioso &&
  sugerenciasIds.length &&
  !String(prep.respuesta_forzada || '').trim() &&
  !esAlquilerPresupuestoAlto
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
  const v = Number(variantIdx) || 0;
  if (presu) {
    const presuFmt = Number(presu).toLocaleString('es-AR');
    const opts = [
      'Dale, te paso un par de opciones en venta cerca de USD ' + presuFmt,
      'Perfecto, mirá estas opciones que se acercan a USD ' + presuFmt,
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
} else if (esAlquilerPresupuestoAlto) {
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

if (String(prep.respuesta_forzada || '').trim() || esAlquilerPresupuestoAlto) {
  // already set
} else if (propiedadesMostrar.length > 0) {
  respuesta = armarIntroPropiedades(presupuestoDetectado, variantIdx, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (
  forzarStockClasificador &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length &&
  (esSoloPreguntas(respuesta) || !respuesta || respuesta.length < 25 || esCurioso)
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuesta = armarIntroPropiedades(presupuestoDetectado, variantIdx, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (
  (debeMostrar || esCurioso) &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length &&
  (!respuesta || respuesta.length < 25 || esCurioso)
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuesta = armarIntroPropiedades(presupuestoDetectado, variantIdx, esCurioso);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if (suenaPlantillaRobot(respuesta)) {
  respuesta = reescribirSiRobot(
    respuesta,
    zonaDetectada,
    presupuestoDetectado,
  );
  mensajesExtra = [];
}

if (iaVacia && !respuesta) {
  respuesta =
    'Hola, soy Matías de Nodo Propiedades. Contame qué buscás y en qué zona';
}

let historialArr = parseHistorialArr(prep.historial_json_prev);
const consultaRepetida = esConsultaRepetida(prep.mensaje, historialArr);
const variantIdx = contarBotsSimilares(respuesta, historialArr);

if (!String(prep.respuesta_forzada || '').trim()) {
  respuesta = evitarRepeticion(respuesta, {
    historialArr,
    mensajeUsuario: prep.mensaje,
    esAlquilerPresupuestoAlto,
    presupuestoDetectado,
    zonaDetectada,
  });
  if (propiedadesMostrar.length > 0 && consultaRepetida) {
    respuesta = armarIntroPropiedades(presupuestoDetectado, variantIdx + 1, esCurioso);
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

const lineCliente = 'Cliente: ' + String(prep.mensaje || '').trim();
const lineBot = 'Bot: ' + String(respuesta || '').trim();
const prev = String(prep.historial_prev || '').trim();
let historial = prev ? prev + '\n' + lineCliente + '\n' + lineBot : lineCliente + '\n' + lineBot;
const lines = historial.split('\n').filter(Boolean);
if (lines.length > 24) historial = lines.slice(-24).join('\n');

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
if (historialArr.length > 60) historialArr = historialArr.slice(historialArr.length - 60);
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

if (!presupuesto && presupuestoDetectado) {
  presupuesto = 'USD ' + presupuestoDetectado;
}

respuesta = sanitizarPuntuacion(respuesta);
mensajeCierre = sanitizarPuntuacion(mensajeCierre);
if (mensajesExtra.length) {
  mensajesExtra = mensajesExtra.map(sanitizarPuntuacion).filter(Boolean);
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
      status: lead_completo ? 'calificado' : 'abierto',
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
