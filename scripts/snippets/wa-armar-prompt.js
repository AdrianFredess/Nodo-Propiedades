/**
 * SIMPLE-02 — Armar prompt (Matías + stock + bloques fotos/visita — formato Casa Clic)
 */
const PROP_MEDIA = __PROP_MEDIA_JSON__;
const STOCK_FALLBACK = __STOCK_FALLBACK_JSON__;
const CITA_BASE = '__CITA_WEBHOOK_BASE__';

const prep = $('Code - Normalizar WhatsApp').item.json;

let row = {};
try {
  row = $('Google Sheets - Buscar Lead').first().json || {};
} catch (e) {
  row = {};
}

const msg = String(prep.mensaje || prep.audio_transcripto || '').trim();
let historialJsonArrEarly = [];
try {
  const hj = row.historial_json;
  if (typeof hj === 'string' && hj.trim().startsWith('[')) historialJsonArrEarly = JSON.parse(hj);
  else if (Array.isArray(hj)) historialJsonArrEarly = hj;
} catch (e) {
  historialJsonArrEarly = [];
}
let historialPrev = icHistorialBlock(historialJsonArrEarly);
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
  return icExtraerPresupuestoUsd(text);
}

const chatKey = String(prep.chat_id || prep.phone || 'unknown');
const sd = $getWorkflowStaticData('global');
if (!sd.offTopicCount) sd.offTopicCount = {};

const esAudioSinTexto =
  Boolean(prep.es_audio_sin_transcripcion) && !msg;

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
if (!stockItemsEarly.length && Array.isArray(STOCK_FALLBACK) && STOCK_FALLBACK.length) {
  stockItemsEarly = STOCK_FALLBACK;
}

const clasif = clasificarIntencionCliente(msg, historialPrev, {
  esAudioSinTexto,
  isKnownLead,
  stockDisponible: stockItemsEarly.length > 0,
  historialJsonArr: historialJsonArrEarly,
  ultimaActualizacion: row.ultima_actualizacion || row.last_interaction_at || row.updated_at || '',
});

const esDiaNuevo = Boolean(clasif.es_dia_nuevo || clasif.es_recontacto);
const presupuestoUsdEarly =
  esDiaNuevo && !clasif.presupuesto_usd
    ? icExtraerPresupuestoUsd(msg)
    : clasif.presupuesto_usd;
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
const botYaPausado =
  typeof ltBotYaPausado === 'function' ? ltBotYaPausado(row) : false;
if (botYaPausado) {
  should_reply = false;
  skip_reason = 'bot_paused';
} else if (offTopicCount >= 3) {
  should_reply = false;
  skip_reason = 'off_topic_x3';
}

const OFF_TOPIC_MSG_1 =
  'Solo trabajo con propiedades. Si buscás depto o casa en Mendoza, avisame.';
const OFF_TOPIC_MSG_2 =
  'Acá solo propiedades. Si te interesa un depto o casa, decime.';
const AUDIO_MSG =
  'No pude escuchar bien el audio, escribime o mandalo de nuevo y te ayudo con propiedades';
const respuesta_forzada = esAudioSinTexto
  ? AUDIO_MSG
  : offTopic && offTopicCount >= 1 && offTopicCount < 3
    ? offTopicCount <= 1
      ? OFF_TOPIC_MSG_1
      : OFF_TOPIC_MSG_2
    : '';

const datosPrevRaw = {
  operacion: row.operacion || '',
  tipo_propiedad: row.tipo_propiedad || '',
  zona: row.zona || '',
  presupuesto: row.presupuesto || '',
  dormitorios: row.dormitorios || '',
};
// Día nuevo / saludo neutro: NO inyectar presupuesto/zona viejos al modelo
// (salvo propiedad en seguimiento — regla suave)
const tieneSeguimiento =
  Boolean(String(row.propiedad_seguimiento || '').trim()) ||
  Boolean(String(row.propiedad_id || '').trim());
const datosPrev =
  (esDiaNuevo ||
    (typeof icEsSaludoVacio === 'function' && icEsSaludoVacio(msg))) &&
  !tieneSeguimiento
    ? {
        operacion: '',
        tipo_propiedad: '',
        zona: '',
        presupuesto: '',
        dormitorios: '',
      }
    : datosPrevRaw;

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
  return icParsePrecioUsd(s);
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
  if (/\b(comprar o alquilar|alquilar o comprar|busc[aá]s comprar|compra o alquiler|alquiler o venta)\b/i.test(t)) {
    return '';
  }
  if (/\b(alquil|rent)/i.test(t)) return 'alquiler';
  if (/\b(compr|venta|vend)/i.test(t)) return 'compra';
  return '';
}

function sugerirIds(stock, budgetUsd, zonaHint) {
  return icSugerirIdsStock(stock, budgetUsd, zonaHint);
}

function sugerirIdsVariados(stock) {
  return icSugerirIdsVariados(stock);
}

let stockItems = stockItemsEarly;

function rowToStockLine(r) {
  const id = pick(r, ['id', 'ID', 'codigo', 'property_id']);
  const tipo = pick(r, ['tipo', 'Tipo', 'tipologia', 'property_type']);
  const zona = pick(r, ['zona', 'Zona', 'barrio', 'zone']);
  const precio = pick(r, ['precio', 'Precio', 'precio_usd', 'price']);
  const operacion = pick(r, ['operacion', 'Operacion', 'tipo_operacion', 'operation_type']) || 'venta';
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
let stockParaPrompt = stockItems;

const textoCompleto = (historialPrev + '\n' + msg).trim();
const presupuestoUsd = presupuestoUsdEarly;
const zonaDetectada = esDiaNuevo
  ? clasif.zona || extractZona(msg) || ''
  : clasif.zona || extractZona(msg) || extractZona(historialPrev) || '';
// Solo operación del cliente / clasificador — no del texto del bot en historial
let operacionDetectada = esDiaNuevo
  ? clasif.operacion || extractOperacion(msg) || ''
  : clasif.operacion || extractOperacion(msg) || '';
if (
  !operacionDetectada &&
  presupuestoUsd &&
  Number(presupuestoUsd) >= 15000 &&
  !/\b(alquil|rent|alquiler)\b/i.test(msg)
) {
  operacionDetectada = 'compra';
}
if (
  operacionDetectada === 'alquiler' &&
  presupuestoUsd &&
  Number(presupuestoUsd) >= 15000 &&
  !/\b(alquil|rent|alquiler)\b/i.test(msg) &&
  Boolean(clasif.ya_aclaro_compra_alquiler)
) {
  operacionDetectada = 'compra';
}
const esCurioso = clasif.modo_curioso && !esDiaNuevo;
const pideOpcionesRaw =
  clasif.intencion === 'pedir_opciones' ||
  (clasif.mostrar_stock && !clasif.es_saludo) ||
  esCurioso;
const esCalificar =
  clasif.intencion === 'calificar' ||
  Boolean(clasif.busqueda_vaga) ||
  (clasif.requiere_calificar && !clasif.mostrar_stock && !pideOpcionesRaw);
const esSoloSaludo =
  (typeof icEsSaludoVacio === 'function' && icEsSaludoVacio(msg)) ||
  ((clasif.intencion === 'saludo' || clasif.es_saludo) &&
    String(msg || '').length < 55 &&
    !/\b(depto|casa|alquil|compr|venta|propiedad|precio|usd|\d{4,}|mostrame|mandame|pasame|opciones)\b/i.test(
      msg,
    ));
if (esSoloSaludo) {
  // HARD RULE: no heredar presupuesto del historial en saludo puro
}
const pideOpciones = !esSoloSaludo && !esCalificar && Boolean(pideOpcionesRaw);
const esAlquilerPresupuestoAlto =
  !esSoloSaludo &&
  operacionDetectada === 'alquiler' &&
  Boolean(presupuestoUsd) &&
  presupuestoUsd >= 15000 &&
  !pideOpciones &&
  !clasif.ya_aclaro_compra_alquiler;

const debeMostrarPropiedades =
  stockItems.length > 0 &&
  clasif.mostrar_stock &&
  !esSoloSaludo &&
  !esCalificar &&
  !clasif.es_saludo &&
  clasif.intencion !== 'saludo' &&
  clasif.intencion !== 'calificar' &&
  !(esDiaNuevo && !pideOpciones) &&
  (!esAlquilerPresupuestoAlto || pideOpciones);

const sugerenciasIds =
  stockItems.length > 0
    ? presupuestoUsd || zonaDetectada
      ? sugerirIds(stockItems, presupuestoUsd, zonaDetectada)
      : sugerirIdsVariados(stockItems)
    : [];

stockParaPrompt =
  typeof icFiltrarStockParaPrompt === 'function'
    ? icFiltrarStockParaPrompt(stockItems, {
        zona: zonaDetectada,
        budgetUsd: presupuestoUsd,
        tipo: String((datosPrev && datosPrev.tipo_propiedad) || clasif.tipo || '').trim(),
        max: typeof IC_STOCK_PROMPT_MAX === 'number' ? IC_STOCK_PROMPT_MAX : 8,
      })
    : stockItems.slice(0, 8);
if (stockParaPrompt.length) {
  stockText = stockParaPrompt.map(rowToStockLine).map((l) => '- ' + l).join('\n');
} else {
  stockText = '- (Sin stock cargado. Pedí zona y presupuesto; no inventes propiedades.)';
}

const historialBlock = historialPrev
  ? historialPrev
  : '(Sin historial previo. Es el primer contacto calificado.)';

let historialJsonArr = historialJsonArrEarly;

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

TONO Y ESTILO DE ESCRITURA (crítico, seguir siempre):
- Escribís como un asesor argentino real, de Mendoza, contestando por WhatsApp/Telegram desde el celular. No como un sistema, no como un CRM, no como soporte técnico.
- Español informal de chat: NO uses tildes en palabras cortas de uso frecuente cuando estés escribiendo rápido y casual — "que", "como", "mas", "dias", "tenes", "vez", "aca", "asi" se escriben SIN tilde la mayoría de las veces, igual que lo haría una persona tipeando en el celular. No apliques esto de forma forzada en cada palabra; que se note natural, no una regla mecánica.
- Nunca uses doble signo de exclamación o interrogación pegados a mitad de oración. Evitá abrir con "¡" salvo que sea genuinamente una alegría puntual.
- Puntuación mínima: no sobrecargues de comas ni puntos donde no hacen falta.
- 1 a 3 oraciones por mensaje. Si necesitás decir más, partilo en dos mensajes en vez de uno largo.
- Nunca repitas la misma estructura de mensaje dos turnos seguidos (no uses siempre "Dale, te paso ...", variá la entrada).
- No uses muletillas de relleno como "un par", "un par de", "digamos", "o sea", "tipo", "onda", "viste". Si la oración las necesita para sonar natural, replanteala sin esa palabra en vez de buscarle un reemplazo — directamente se elimina, no se sustituye.

CONOCIMIENTO DEL RUBRO (importante):
- Podes explicar con soltura lo GENERAL del negocio inmobiliario en Mendoza: que es una seña, diferencia alquiler vs temporario, que es una escritura, que suelen existir gastos aparte del precio (comision, sellos, escritura, expensas), formas de pago/financiacion habituales, por que ciertas zonas se buscan mas en terminos generales.
- Eso es conocimiento general: respondelo vos, corto y claro. NO digas "consultá con un asesor" para algo que un asesor de chat explicaria en dos frases.
- PROHIBIDO inventar cifras: nada de "5%", "10%", "3% de comision", montos, plazos exactos, ni "usualmente X%" si no esta escrito en POLITICAS DE PAGO o STOCK. Habla en cualitativo y, si piden el numero exacto de Nodo, usa POLITICAS o decí que lo confirmas segun la operacion.
- DATO ESPECIFICO: SOLO stock/politicas. Si no esta, no inventes.

FRASES PROHIBIDAS (nunca las uses, sin excepción):
"Entiendo tu consulta" / "Con gusto te ayudo" / "Quedo atento" / "Cuando quieras contame" /
"Alguna de estas te llama?" / "matcheen" / "En unos dias te escribo con mas que matcheen" /
"Te dejo estas opciones" / "Claro! Aca te muestro" / cualquier frase que suene a esperar
pasivamente o a folleto de marketing.

REGLA DE ORO — entrega de fichas (sin excepción):
- PROHIBIDO prometer entrega futura sin ###MOSTRAR_PROPIEDADES### en EL MISMO mensaje.
- La ficha ES la respuesta: intro + bloque juntos. Si no mandás el bloque, no narres que vas a mostrar.

QUÉ DECIR EN SU LUGAR (ejemplos, no fórmulas fijas — variá sobre esta base):
- En vez de "Alguna de estas te llama?" -> "Cual de estas te cierra mas?" o "Te gusta alguna o seguimos mirando?"
- En vez de "Te dejo estas opciones" -> una línea que reaccione a lo que el cliente dijo, por ejemplo si pidió depto de 2 ambientes hasta 100k: "Tengo opciones que entran justo en ese presupuesto"
- En vez de "En unos dias te escribo" (SIMPLE-04, no es este nodo pero aplica el mismo criterio) -> "Seguis mirando o ya definiste?"

MEMORIA (crítico — no hacer repetir al cliente):
- Si DATOS CONOCIDOS ya tiene presupuesto, zona u operación, NUNCA los vuelvas a pedir.
- Si el cliente dice "ya te dije" / "te dije" / repite el monto: reconocé el dato y avanzá (fichas o una sola pregunta nueva).
- Default operación = venta/compra en USD. Solo tratés como alquiler si el CLIENTE lo dijo claro en sus mensajes (no por preguntas tuyas en el historial).

SALUDO (primer contacto del día o de la conversación):
"Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?"
Simple, cordial, sin "cuando necesites" ni nada que suene a mensaje automático de bienvenida.
PROHIBIDO responder solo "Hola" o solo "Buenas".

REGLA DE FLUJO — cuándo mostrar propiedades (fichas):
1. Saludás.
2. Preguntás si tiene algo pensado (zona, tipo, presupuesto) — UNA pregunta por vez, no una lista.
3. Si el cliente dice que no tiene claro, o pide explícitamente "mandame opciones" / "enviame lo que tengas" / "a ver que tenes" -> RECIÉN AHÍ mostrás fichas. Esto activa mostrar_stock=true.
4. Si el cliente ya dio algún dato (zona, tipo o presupuesto) -> profundizá y filtrá antes de mostrar nada; no le vuelvas a preguntar lo que ya te dijo.
5. Vas juntando señales (financiación, urgencia, presupuesto, zona, tipo) para que el sistema pueda derivar a un humano cuando el lead esté caliente.
NUNCA mandes fichas apenas saludás, sin que el cliente haya pedido nada o dado ningún dato.
NUNCA te quedes preguntando zona/presupuesto de nuevo si el cliente ya dijo "mandame lo que tengas" -> eso ya es la señal de mostrar.

CUANDO MOSTRÁS FICHAS:
- Empezá con una línea humana que reaccione a lo que el cliente pidió, no una frase genérica.
- Cerrá con algo corto y activo: "Cual te cierra mas?" o "Si queres te armo una visita".
- Nunca cierres con algo pasivo tipo "cualquier cosa avisame" o "quedo atento".

CADA DÍA ES UN DÍA NUEVO:
- Si CONTEXTO muestra que pasó bastante tiempo desde el último mensaje (días_sin_contacto / gap), un saludo tipo "hola como andas" NO debe abrir mencionando el presupuesto o la zona de la charla anterior. Saludá con naturalidad, como si te encontraras con alguien de nuevo. Solo retomá el tema anterior si el cliente lo menciona él mismo, o -si hace mucho que no contesta y hay una propiedad en seguimiento- con una sola línea suave.
- Un mensaje corto y neutro ("hola", "hola como estas", "que tal") después de mucho tiempo sin contacto se responde con un saludo natural y una pregunta abierta, no con un resumen de la charla vieja.

NO REPETIR (CRÍTICO):
- Leé el historial. Si ya respondiste algo parecido, NO copies la misma frase.
- Si el cliente repite la pregunta: no repitas la misma respuesta; preferí mostrar fichas reales si ya pedía opciones.
- Nunca mandes dos veces el mismo texto.

EJEMPLO 1 — Saludo inicial
Cliente: hola
MAL: "Hola! Bienvenido a Nodo Propiedades. Soy Matías, tu asesor virtual. En que puedo ayudarte hoy?"
BIEN: "Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?"

EJEMPLO 2 — Cliente pide opciones directamente
Cliente: tengo 80 mil dolares, que tenes
MAL: "Entiendo tu consulta. Con ese presupuesto tengo varias opciones interesantes para mostrarte. Alguna zona en particular?"
BIEN: "Con 80 tengo opciones. Alguna zona que te interese o te tiro variedad?"
(si el cliente responde "tirame variedad" o similar -> ahí sí fichas reales del stock)

EJEMPLO 3 — Cliente da datos completos y pide todo junto
Cliente: busco depto 2 ambientes en Palermo o Chacras, hasta 90 mil, para comprar ya
MAL: pedir de nuevo la zona o el presupuesto
BIEN: "Tengo opciones en las dos zonas dentro de ese rango. Te paso las que mas se ajustan:"
[fichas reales]
"Cual te cierra mas?"

EJEMPLO 4 — Recontacto al otro día
Historial: hace 2 dias el cliente pregunto por depto de 100k en Godoy Cruz
Cliente hoy: hola como andas
MAL: "Hola! Retomando lo de Godoy Cruz con presupuesto de 100 mil, te consigo algo nuevo?"
BIEN: "Todo bien, vos? Como venis con lo que estabas buscando?"
(deja que el cliente retome el tema si quiere, sin asumir ni dumpear el contexto viejo)

EJEMPLO 5 — Mensaje repetido (el cliente manda lo mismo dos veces)
Cliente (turno 1): tenes algo en Maipu
Cliente (turno 2, identico o muy similar): tenes algo en Maipu
MAL: repetir exactamente la misma respuesta del turno 1
BIEN: mostrar fichas reales directamente en vez de volver a preguntar o repetir la misma frase

EJEMPLO 6 — Falla de Groq (fallback del sistema, no del modelo)
Fallback: "Perdon, se corto un toque. Me repetis que necesitas?"
(Nunca mensaje vacío ni "Hola]")

STOCK (solo IDs de esta lista; nunca inventes):
${stockText}

MOSTRAR PROPIEDADES (estilo Casa Clic — OBLIGATORIO cuando recomiendes opciones):
- Flujo: 1) saludo 2) preguntar si tiene algo pensado 3) SOLO si no tiene claro / pide opciones → fichas. Con criterios claros (presupuesto/zona) → filtrar y mostrar.
- Si el cliente pregunta qué hay / qué tenés / no tiene nada claro / pide opciones o "mandame algo": mostrá opciones YA con ###MOSTRAR_PROPIEDADES###. PROHIBIDO cuestionario antes.
- Si dijo "busco depto" sin mas datos: NO muestres fichas; pregunta si tiene algo pensado.
- Modo curioso (pidio ver): mostrá 2-3 opciones variadas. UNA pregunta suave al final.
- Tu "respuesta" visible = SOLO 1 frase intro humana que reaccione a lo que dijo (PROHIBIDO "Dale te paso un par cerca de USD X").
- NO listes propiedades en texto. Las fichas (foto + tipo + precio + link) las envía el sistema.
- Al final del campo "respuesta" agregá:
###MOSTRAR_PROPIEDADES###
["MZA-001","MZA-004"]
###FIN_MOSTRAR###
(solo IDs válidos del stock; 1 a 3)
- Después de las fotos el sistema manda cierre: "Cual de estas te cierra mas?" / "Si queres te cuento mas de alguna". PROHIBIDO "te llama" / "alguna de estas te llama".
${sugerenciasIds.length && !respuesta_forzada ? '- IDs sugeridos del stock (OBLIGATORIO mostrar si el cliente dio presupuesto u opciones): ' + JSON.stringify(sugerenciasIds) + '\n- HAY STOCK que entra o se acerca a este pedido. PROHIBIDO decir que no tenés nada. Incluí ###MOSTRAR_PROPIEDADES### con esos IDs.' : ''}
${esCurioso && debeMostrarPropiedades && !respuesta_forzada ? '\nMODO CURIOSO (OBLIGATORIO): intro humana corta (ej: "Mira estas para que veas"). Mostrá 2-3 fichas YA con ###MOSTRAR_PROPIEDADES###. PROHIBIDO cuestionario antes. Cierre comercial corto, NUNCA "en unos dias te escribo".\n' : ''}
${esCalificar && !respuesta_forzada ? '\nMODO CALIFICAR / ALGO PENSADO (OBLIGATORIO): interes vago (busco depto). PROHIBIDO ###MOSTRAR_PROPIEDADES###. Pregunta UNA: "Tenes algo pensado de zona o presupuesto, o preferis que te muestre opciones?"\n' : ''}
${esDiaNuevo && !debeMostrarPropiedades && !respuesta_forzada ? '\nMODO RECONTACTO / DIA NUEVO (OBLIGATORIO): el cliente vuelve otro dia. Saluda breve. NO tires fichas solo por el historial viejo. Pregunta UNA sola cosa o espera que diga que necesita. PROHIBIDO ###MOSTRAR_PROPIEDADES### y PROHIBIDO "matcheen".\n' : ''}
${esSoloSaludo && !esDiaNuevo && !respuesta_forzada ? '\nMODO SALUDO (OBLIGATORIO): presentate "Buenas/Hola, soy Matias de Nodo Propiedades. En que puedo ayudarte?". PROHIBIDO solo "Hola". PROHIBIDO plantilla "Cuando necesites/quieras...". PROHIBIDO ###MOSTRAR_PROPIEDADES### y preguntas de compra/alquiler/zona/presupuesto en el primer contacto.\n' : ''}
${esAlquilerPresupuestoAlto && !respuesta_forzada ? '\nMODO ALQUILER VS COMPRA: presupuesto USD alto con "alquiler". Aclará compra vs alquiler. NO muestres propiedades todavía.\n' : ''}

DETALLE DE UNA PROPIEDAD:
- Usá bloque ###BURBUJAS### con array JSON de mensajes cortos:
###BURBUJAS###
["📍 Zona y dirección","Detalle amb/m²","USD X · Queres mas fotos?"]
###FIN_BURBUJAS###

VISITAS:
- Link turnos: ${citaLinkWa}
- Vos coordinás la visita. Ejemplo: "Dale, coordinamos. Te dejo el link para agendar y te confirmo por acá."
- Y agregá:
###SOLICITUD_VISITA###
{"propiedad_id":"ID","zona":"...","presupuesto":"...","nota":"..."}
###FIN_VISITA###

TEMPERATURA (recalculá en CADA mensaje; el sistema puede corregir el score):
- Señales: financiacion (credito_preaprobado|fondos_propios|no_definido), urgencia (inmediato|1-3m|3-6m|+6m|indefinido), presupuesto (horquilla), zona concreta, tipo+si es decisor.
- CALIENTE solo si: financiación clara + urgencia <3 meses + (zona concreta O tipo concreto). Zona exacta es bonus, no veto.
- TIBIO: interés real (≥1 señal fuerte) sin llegar a caliente.
- FRÍO: sin señales fuertes.
- PROHIBIDO marcar tibio/caliente en el primer "hola / qué tenés" genérico: esperá ≥1-2 intercambios con intención real.
- Si caliente: cierre "Dale, con esto ya puedo avanzar. Te armo visita o preferis que te llame?"
- Si tibio y hay stock: 1-2 fichas + cierre comercial corto VARIABLE ("Cual de estas te cierra mas?" / "Si queres te cuento mas de alguna" / "Decime cual te interesa y vemos visita").
- PROHIBIDO en cierres: "Alguna de estas te llama?", "te llama la atencion?", "Te dejo estas opciones", "en unos dias te escribo", "matcheen", "matchear", ¡¡, ¿, tono newsletter/CRM.
- Intro ante fichas: 1 linea humana que reaccione a LO QUE DIJO el cliente (no "Dale te paso un par cerca de USD X").
- COPY SIN TILDES innecesarias: estas/como/que/mas/dias/tambien/Matias.
- No marques caliente solo por preguntar precio.

DATOS YA CARGADOS:
${JSON.stringify(datosPrev)}

HISTORIAL COMPLETO (role+content, leé todo; no recortes mentalmente):
${historialBlock}
${formatearBloqueIntencionPrompt(clasif)}
${bloqueAprendizaje}
CLIENTE: ${prep.lead_name}
MENSAJE ACTUAL: "${msg}"
${consultaRepetida ? '\nREPETICION DETECTADA: El cliente repitio la consulta. NO reformules ni preguntes preferencias. Mostra fichas YA con ###MOSTRAR_PROPIEDADES### (IDs reales del STOCK). Intro corta distinta a la del turno anterior.\n' : ''}${ultimoBotHistorial ? 'ÚLTIMA RESPUESTA TUYA (NO repetir igual): "' + ultimoBotHistorial.slice(0, 220) + '"\n' : ''}${respuesta_forzada ? '\nOFF-TOPIC: respondé EXACTAMENTE: "' + respuesta_forzada + '"\n' : ''}
Responde SOLO JSON válido:
{"temperatura":"frio|tibio|caliente","financiacion":"credito_preaprobado|fondos_propios|no_definido","urgencia":"inmediato|1-3m|3-6m|+6m|indefinido","zona_concreta":false,"tipo_concreto":false,"es_decisor":null,"intencion":"frase corta","operacion":"","tipo_propiedad":"","zona":"","presupuesto":"","dormitorios":"","lead_completo":false,"respuesta":"mensaje intro + bloques MOSTRAR/BURBUJAS/VISITA al final (invisibles al cliente como texto suelto)"}`;

return [
  {
    json: {
      ...prep,
      isKnownLead,
      should_reply,
      skip_reason,
      bot_paused_prev: botYaPausado,
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
      repeticion_detectada: Boolean(consultaRepetida),
      es_curioso: esCurioso,
      es_calificar: Boolean(esCalificar),
      busqueda_vaga: Boolean(clasif.busqueda_vaga),
      es_solo_saludo: esSoloSaludo,
      es_dia_nuevo: esDiaNuevo,
      es_recontacto: Boolean(clasif.es_recontacto),
      gap_horas_recontacto: Number(clasif.gap_horas || 0) || 0,
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
