const groqData = $input.first().json;
const promptData = $('Construir Prompt').first().json;

const choices = Array.isArray(groqData.choices) ? groqData.choices : [];
const msgGroq = (choices[0] && choices[0].message) || {};
let respuestaCompleta =
  (msgGroq.content && String(msgGroq.content).trim()) ||
  String(msgGroq.reasoning || msgGroq.reasoning_content || '').trim();

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
const presupuestoDetectado = String(promptData.presupuesto_detectado || '');
const esSoloSaludo = Boolean(promptData.es_solo_saludo);

const SALUDOS_HUMANOS = [
  'Hola, ¿cómo estás? Soy Matías de Nodo Propiedades. Cuando quieras contame qué necesitás.',
  'Buen día. Soy Matías, de Nodo Propiedades. Quedo atento por si necesitás algo.',
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
  if ((t.match(/\?/g) || []).length >= 2) return true;
  if (/\b(compra|alquiler|venta)\b/i.test(t) && esSaludoSimple(textoUsuario)) return true;
  return false;
}

function humanizarVoz(texto) {
  let t = String(texto || '').trim();
  t = t.replace(/^¡?\s*hey[!,.]?\s*/i, '');
  t = t.replace(/^¡+/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

function quitarMuletillaChe(texto) {
  if (!texto || typeof texto !== 'string') return texto;
  return texto
    .replace(/\b[Cc]he\b[,.;:!?]*\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function suenaARobot(texto) {
  return /\b(me podr[ií]as indicar|podr[ií]as indicarme|para poder ayudarte mejor|indicame tu presupuesto|zona de mendoza que te interesa)\b/i.test(
    texto,
  );
}

const estadoRegex = /###ESTADO_ACTUAL:(frio|tibio|caliente)###/i;
const leadRegex =
  /###LEAD_COMPLETO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_LEAD###/;
const propRegex =
  /###PROPIEDAD_SEGUIMIENTO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_PROP###/;
const mostrarRegex =
  /###MOSTRAR_PROPIEDADES###\s*(\[[\s\S]*?\])\s*###FIN_MOSTRAR###/i;
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

if (!propiedadesMostrar.length && debeMostrar && sugerenciasIds.length) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
}

function armarIntroPropiedades(presu) {
  if (presu) {
    return (
      '¡Claro! Acá te muestro un par de opciones en venta que encajan con tu presupuesto de USD ' +
      Number(presu).toLocaleString('es-AR') +
      '.'
    );
  }
  return '¡Claro! Acá te muestro un par de opciones que tenemos disponibles.';
}

const MENSAJE_CIERRE_PROPS =
  '¿Cuál te llama más la atención o querés que te cuente más detalles de alguna?';

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
respuestaBot = humanizarVoz(respuestaBot);

if (propiedadesMostrar.length > 0) {
  respuestaBot = armarIntroPropiedades(presupuestoDetectado);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
} else if ((esSoloSaludo || esSaludoSimple(textoUsuario)) && turno <= 2) {
  respuestaBot = SALUDOS_HUMANOS[(turno - 1) % SALUDOS_HUMANOS.length];
} else if (esInvasivo(respuestaBot)) {
  if (esSaludoSimple(textoUsuario)) {
    respuestaBot = SALUDOS_HUMANOS[0];
  } else {
    respuestaBot = humanizarVoz(respuestaBot);
  }
} else if (
  debeMostrar &&
  !propiedadesMostrar.length &&
  sugerenciasIds.length &&
  (suenaARobot(respuestaBot) || !respuestaBot || respuestaBot.length < 20)
) {
  propiedadesMostrar = sugerenciasIds.slice(0, 3);
  respuestaBot = armarIntroPropiedades(presupuestoDetectado);
  mensajeCierre = MENSAJE_CIERRE_PROPS;
}

if (!respuestaBot) {
  respuestaBot = esSaludoSimple(textoUsuario)
    ? SALUDOS_HUMANOS[0]
    : 'Hola, soy Matías de Nodo Propiedades. Contame qué buscás y te ayudo.';
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

historialJson.push({ role: 'user', content: textoUsuario });
let textoAsistente = respuestaBot;
if (mensajeCierre) textoAsistente = textoAsistente + '\n\n' + mensajeCierre;
historialJson.push({ role: 'assistant', content: textoAsistente });
if (historialJson.length > 40) {
  historialJson = historialJson.slice(historialJson.length - 40);
}

const sd = $getWorkflowStaticData('global');
if (!sd.historialByChat) sd.historialByChat = {};
sd.historialByChat[chatId] = historialJson;

const ahora = new Date().toISOString();
const presupuestoOut =
  leadData.presupuesto ||
  visitaData.presupuesto ||
  (presupuestoDetectado ? 'USD ' + presupuestoDetectado : '');

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
    },
  },
];
