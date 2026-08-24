/**
 * Bot Telegram — Construir Prompt
 * Incluye stock + políticas de pago (Sheets) + instrucción de presupuestos.
 * Tags ###ESTADO_ACTUAL### y ###LEAD_COMPLETO### se mantienen.
 */
const setVars = $('Set Variables').first().json;
const chatId = setVars.chat_id;
const textoUsuario = setVars.texto_usuario;
const nombreUsuario = setVars.nombre_usuario;

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

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  return '';
}

function rowToStockLine(row) {
  const id = pick(row, ['id', 'ID', 'codigo']);
  const tipo = pick(row, ['tipo', 'Tipo', 'tipologia']);
  const zona = pick(row, ['zona', 'Zona', 'barrio']);
  const precio = pick(row, ['precio', 'Precio', 'precio_usd']);
  const operacion = pick(row, ['operacion', 'Operacion', 'tipo_operacion']);
  const desc = pick(row, ['descripcion', 'Descripcion', 'detalle']);
  const estado = pick(row, ['estado', 'Estado', 'stock']) || 'disponible';
  const honorarios = pick(row, ['honorarios', 'Honorarios', 'comision']);
  const reserva = pick(row, ['reserva', 'Reserva', 'seña', 'sena']);
  const medios = pick(row, ['medios_pago', 'mediosPago', 'forma_pago']);
  const alias = pick(row, ['alias_cbu', 'alias', 'cbu', 'CBU']);
  const requisitos = pick(row, ['requisitos', 'Requisitos']);

  const bits = [
    tipo,
    zona,
    operacion ? 'op:' + operacion : '',
    precio ? String(precio) : '',
    desc,
  ].filter(Boolean);
  const pagoBits = [
    honorarios ? 'honorarios:' + honorarios : '',
    reserva ? 'reserva:' + reserva : '',
    medios ? 'medios:' + medios : '',
    alias ? 'alias/CBU:' + alias : '',
    requisitos ? 'req:' + requisitos : '',
  ].filter(Boolean);
  const head = id ? '[' + id + '] ' : '';
  return (
    head +
    bits.join(' | ') +
    (pagoBits.length ? ' || PAGO: ' + pagoBits.join(' · ') : '') +
    (estado ? ' (' + estado + ')' : '')
  );
}

let stockText = '';
if (stockItems.length) {
  stockText = stockItems
    .map(rowToStockLine)
    .map((l) => '- ' + l)
    .join('\n');
} else {
  stockText =
    '- (Sin filas en la planilla de stock (propiedades) o no se pudo leer. Ofrece ayuda humana o pedir cargar stock.)';
}

const FALLBACK_POLITICAS = [
  'transferencia: Alias/CBU EDITAR_EN_SHEETS (hoja Politicas_Pago, clave transferencia). Titular EDITAR_EN_SHEETS.',
  'efectivo: Se acepta en oficina con comprobante; coordinar visita.',
  'reserva: Seña típica a confirmar según operación; no garantiza hasta acreditación.',
  'cuotas: Solo si la propiedad/operación lo indica en stock; no inventar planes.',
  'honorarios: Ver columna honorarios del inmueble o valor de Politicas_Pago; si falta, decir que lo confirma un asesor.',
  'requisitos_alquiler: DNI, recibos, garantía o seguro caución (confirmar en Sheets).',
  'requisitos_compra: DNI, reservar con seña, escritura con escribano (confirmar en Sheets).',
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
  politicasText =
    FALLBACK_POLITICAS.split('\n')
      .map((l) => '- ' + l)
      .join('\n') +
    '\n- (Fuente: placeholders. Cargá la hoja Politicas_Pago en Sheets para valores reales.)';
}

const matchRow = historialItems.find(
  (item) => item.json && String(item.json.chat_id) === String(chatId),
);
const historialItemsFiltered = matchRow ? [matchRow] : [];

let historialJson = [];
let turno = 1;
let rowExists = false;
let propiedadSeguimientoPrev = '';
let ultimaActualizacionStr = '';
let diasSinContacto = 0;

if (
  historialItemsFiltered.length > 0 &&
  historialItemsFiltered[0].json &&
  historialItemsFiltered[0].json.chat_id
) {
  const row = historialItemsFiltered[0].json;
  rowExists = true;
  turno = parseInt(row.turno || 0) + 1;
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

let refSeg = '';
let idSeg = '';
if (propiedadSeguimientoPrev) {
  try {
    const o = JSON.parse(propiedadSeguimientoPrev);
    if (o && typeof o === 'object') {
      if (o.referencia) refSeg = String(o.referencia);
      if (o.id) idSeg = String(o.id);
      if (!refSeg && o.id) refSeg = String(o.id);
    }
  } catch (e) {
    refSeg =
      propiedadSeguimientoPrev.length > 120
        ? propiedadSeguimientoPrev.slice(0, 117) + '…'
        : propiedadSeguimientoPrev;
  }
}

const contextoCliente =
  '- Días aproximados desde el último registro en CRM (ultima_actualizacion): ' +
  (ultimaActualizacionStr ? diasSinContacto : 'sin_dato') +
  '\n' +
  '- Propiedad en seguimiento guardada (si existe): ' +
  (refSeg || '(ninguna)') +
  (idSeg ? ' [id=' + idSeg + ']' : '') +
  '\n' +
  '- Si hay varios días sin contacto y hay propiedad en seguimiento, está bien retomar con una sola frase breve y cordial al inicio; no insistir ni presionar.';

const systemPrompt =
  'Sos Matías, asesor inmobiliario de Nodo Propiedades (Argentina). Tu trabajo es solo atender consultas sobre inmuebles: disponibilidad, precios en el stock, zonas, tipología, visitas, presupuestos, medios de pago y derivaciones relacionadas con el catálogo.\n\n' +
  'ALCANCE: Si el mensaje no tiene relación con inmuebles o el stock (otros temas, bromas, política, tecnología, vida personal, etc.), respondé en 1–2 frases cordiales y profesionales aclarando que solo podés orientar sobre propiedades y el catálogo, y ofrecé continuar si tiene una consulta inmobiliaria. No des datos ni opiniones fuera de ese marco.\n\n' +
  'PROHIBICIÓN ESTRICTA: No uses en ningún caso la palabra "che" (ni como saludo ni como interjección). Usá un trato profesional directo: "Hola", "Buenos días", o el nombre si lo tenés.\n\n' +
  'CONTEXTO_CLIENTE (uso interno; no lo repitas literal ni digas que venís de un CRM):\n' +
  contextoCliente +
  '\n\n' +
  'SEGUIMIENTO EN CONVERSACIÓN:\n' +
  '- Si CONTEXTO_CLIENTE muestra ~3 días o más sin registro previo y había propiedad en seguimiento, podés empezar con UNA sola línea corta retomando el interés; después respondé al mensaje actual.\n' +
  '- No hagas seguimiento agresivo: una mención suave; si el cliente cambió de tema, priorizá lo que preguntó ahora.\n\n' +
  'STOCK (solo ofrecé propiedades de esta lista; si no hay match, ofrecé las más cercanas o pedí más datos):\n' +
  stockText +
  '\n\n' +
  'POLITICAS_PAGO (fuente Sheets Politicas_Pago o placeholders editables; NO inventes CBU/alias reales):\n' +
  politicasText +
  '\n\n' +
  'PRESUPUESTOS Y MEDIOS DE PAGO:\n' +
  '- Si el cliente pide presupuesto, cotización, "cómo pago", reserva, seña, honorarios, o hay propiedad en seguimiento clara, armá un PRESUPUESTO LEGIBLE en chat con este formato (adaptá campos faltantes):\n' +
  '  *Presupuesto — [id/código]*\n' +
  '  · Propiedad: tipo · zona\n' +
  '  · Operación: venta|alquiler\n' +
  '  · Precio: …\n' +
  '  · Honorarios: … (si no está en stock/políticas, decí que lo confirma un asesor)\n' +
  '  · Reserva/seña: …\n' +
  '  · Medios de pago: transferencia (alias/CBU solo si figura en POLITICAS_PAGO o stock), efectivo, etc.\n' +
  '  · Requisitos: …\n' +
  '  · Resumen: 1–2 líneas\n' +
  '- Si el alias/CBU dice EDITAR_EN_SHEETS, explicá que el dato bancario lo confirma la inmobiliaria y ofrecé derivar; no inventes números.\n' +
  '- No generes PDF; el formato en chat alcanza.\n\n' +
  'ESTILO Y FORMATO:\n' +
  '- Español claro, profesional y cercano (podés usar voseo si resulta natural).\n' +
  '- Cuando convenga, ordená la respuesta con viñetas o pasos breves; evitá muros de texto largos en Telegram.\n' +
  '- Priorizá una intención o una pregunta por mensaje cuando pida información al cliente.\n' +
  '- No inventes inmuebles fuera del stock; podés parafrasear la lista.\n\n' +
  'PROPIEDAD EN SEGUIMIENTO (para recordatorios posteriores):\n' +
  '- Si el usuario se enfoca claramente en UNA propiedad del stock (detalle, visita, reserva, presupuesto, "me interesa la de…"), al FINAL del mensaje agregá exactamente este bloque (una sola línea JSON dentro):\n\n' +
  '###PROPIEDAD_SEGUIMIENTO###\n' +
  '{"id":"id_o_codigo_stock","referencia":"breve texto para recordatorios (zona + tipo o codigo)"}\n' +
  '###FIN_PROP###\n\n' +
  '- Si no hay una propiedad clara o es solo una consulta general, NO incluyas este bloque (deja el seguimiento anterior sin cambios en el sistema).\n\n' +
  'ESTADO DE INTERÉS (obligatorio en CADA respuesta):\n' +
  '- Al FINAL del texto para el cliente (antes de bloques opcionales ###PROPIEDAD_SEGUIMIENTO### / ###LEAD_COMPLETO###), agregá exactamente UNA línea con el tag:\n' +
  '###ESTADO_ACTUAL:frio###\n' +
  'o ###ESTADO_ACTUAL:tibio### o ###ESTADO_ACTUAL:caliente###\n' +
  '- frio = curiosidad / sin datos claros; tibio = interés sin urgencia; caliente = urgencia o datos claros de compra/alquiler.\n' +
  '- Este tag convive con ###LEAD_COMPLETO###: cuando cierres el lead, incluí AMBOS (estado + bloque lead). No inventes el bloque lead si faltan datos.\n\n' +
  'CUANDO TENGAS OPORTUNIDAD DE VENTA (nombre, zona, presupuesto aproximado y compra o alquiler), al FINAL del mensaje (después del bloque de propiedad si lo hubo) pegá exactamente este bloque:\n\n' +
  '  ###LEAD_COMPLETO###\n' +
  '  {"nombre":"...","zona":"...","presupuesto":"...","operacion":"compra|alquiler","temperatura":"caliente|tibio|frio","resumen":"..."}\n' +
  '  ###FIN_LEAD###\n\n' +
  '- temperatura: caliente = urgencia o presupuesto claro; tibio = interés sin fecha; frío = curiosidad.\n' +
  '- Si falta información para cerrar el lead, seguí la conversación SIN el bloque JSON.';

const messages = [{ role: 'system', content: systemPrompt }];

for (const msg of historialJson) {
  messages.push(msg);
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
    },
  },
];
