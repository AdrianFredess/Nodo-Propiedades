const textoIA = ($json.text || '').trim();
const prep = $('Code - Armar Prompt').item.json;

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

const mostrarRegex =
  /###MOSTRAR_PROPIEDADES###\s*(\[[\s\S]*?\])\s*###FIN_MOSTRAR###/i;
const visitaRegex =
  /###SOLICITUD_VISITA###\s*({[\s\S]*?})\s*###FIN_VISITA###/i;

let working = String(respuesta || '');

let propiedadesMostrar = [];
const mostrarMatch = working.match(mostrarRegex);
if (mostrarMatch) {
  try {
    const arr = JSON.parse(mostrarMatch[1].trim());
    if (Array.isArray(arr)) {
      propiedadesMostrar = arr.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3);
    }
  } catch (e) {
    propiedadesMostrar = [];
  }
  working = working.replace(mostrarRegex, '').trim();
}

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

respuesta = working
  .replace(/\b[Cc]he\b[,.;:!?]*\s*/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

if (iaVacia && !respuesta) {
  respuesta =
    'Hola, gracias por escribir a Nodo Propiedades. ¿Buscás alquilar o comprar, y en qué zona?';
}

const lineCliente = 'Cliente: ' + String(prep.mensaje || '').trim();
const lineBot = 'Bot: ' + String(respuesta || '').trim();
const prev = String(prep.historial_prev || '').trim();
let historial = prev ? prev + '\n' + lineCliente + '\n' + lineBot : lineCliente + '\n' + lineBot;
const lines = historial.split('\n').filter(Boolean);
if (lines.length > 24) historial = lines.slice(-24).join('\n');

let historialArr = [];
try {
  const rawHj = prep.historial_json_prev;
  if (typeof rawHj === 'string' && rawHj.trim()) historialArr = JSON.parse(rawHj);
  else if (Array.isArray(rawHj)) historialArr = rawHj;
} catch (e) {
  historialArr = [];
}
if (!Array.isArray(historialArr)) historialArr = [];
const ts = new Date().toISOString();
historialArr.push({ role: 'user', content: String(prep.mensaje || '').trim(), ts });
historialArr.push({ role: 'assistant', content: String(respuesta || '').trim(), ts });
if (historialArr.length > 60) historialArr = historialArr.slice(historialArr.length - 60);
const historial_json = JSON.stringify(historialArr);

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
    },
  },
];
