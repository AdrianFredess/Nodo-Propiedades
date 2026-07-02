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
          /authorization grant|invalid_grant|token is invalid|OAuth2/i.test(row.error)
        ) &&
        !(Object.keys(row).length === 1 && Object.prototype.hasOwnProperty.call(row, 'error')),
    );
} catch (e) {
  stockItems = [];
}

function rowToStockLine(row) {
  const id = row.id ?? row.ID ?? row.codigo ?? '';
  const tipo = row.tipo ?? row.Tipo ?? row.tipologia ?? '';
  const zona = row.zona ?? row.Zona ?? row.barrio ?? '';
  const precio = row.precio ?? row.Precio ?? row.precio_usd ?? '';
  const desc = row.descripcion ?? row.Descripcion ?? row.detalle ?? '';
  const estado = row.estado ?? row.Estado ?? row.stock ?? 'disponible';
  const bits = [tipo, zona, precio ? String(precio) : '', desc].filter(Boolean);
  const head = id ? '[' + id + '] ' : '';
  return head + bits.join(' | ') + (estado ? ' (' + estado + ')' : '');
}

let stockText = '';
if (stockItems.length) {
  stockText = stockItems.map(rowToStockLine).map((l) => '- ' + l).join('\n');
} else {
  stockText =
    '- (Sin filas en hoja Propiedades o no se pudo leer. Ofrece ayuda humana o pedir cargar stock.)';
}

const matchRow = historialItems.find(
  (item) => item.json && String(item.json.chat_id) === String(chatId),
);
const historialItemsFiltered = matchRow ? [matchRow] : [];

let historialJson = [];
let turno = 1;
let rowExists = false;

if (
  historialItemsFiltered.length > 0 &&
  historialItemsFiltered[0].json &&
  historialItemsFiltered[0].json.chat_id
) {
  const row = historialItemsFiltered[0].json;
  rowExists = true;
  turno = parseInt(row.turno || 0) + 1;
  try {
    historialJson = JSON.parse(row.historial_json || '[]');
  } catch (e) {
    historialJson = [];
  }
}

const systemPrompt =
  'Sos un asesor inmobiliario amigable y profesional de Argentina llamado Matias.\n' +
  'Entende que busca el cliente y ofrece opciones alineadas al STOCK REAL listado abajo.\n\n' +
  'STOCK (solo ofrece propiedades de esta lista; si no hay match, ofrece parecidas o pide mas datos):\n' +
  stockText +
  '\n\n' +
  'INSTRUCCIONES:\n' +
  '- Conversa naturalmente; una pregunta por vez si hace falta.\n' +
  '- Responde en espanol rioplatense (vos, che).\n' +
  '- Si el cliente vuelve despues de dias o el lead ya estaba completo, IGUAL contesta siempre (precios, zonas, visitas).\n' +
  '- No inventes datos fuera del stock; podes parafrasear la lista.\n' +
  '- Cuando sepas nombre, zona, presupuesto aproximado y compra o alquiler, al FINAL pega exactamente este bloque:\n\n' +
  '  ###LEAD_COMPLETO###\n' +
  '  {"nombre":"...","zona":"...","presupuesto":"...","operacion":"compra|alquiler","temperatura":"caliente|tibio|frio","resumen":"..."}\n' +
  '  ###FIN_LEAD###\n\n' +
  '- caliente = urgencia / presupuesto claro; tibio = interes sin fecha; frio = curiosidad.\n' +
  '- Si falta info para cerrar el lead, sigue charlando SIN el bloque JSON.';

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
    },
  },
];
