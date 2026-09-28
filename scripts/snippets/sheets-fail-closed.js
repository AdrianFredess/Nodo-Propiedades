/**
 * Lectura de Sheets: distingue "falló" de "vino vacío".
 * Se antepone en los nodos de prompt. También lo usa el test.
 */
const RESPUESTA_SHEETS_CAIDO = 'Dame un rato que chequeo disponibilidad y te confirmo';
const SHEETS_ALERT_MS = 60 * 60 * 1000;

function clasificarLecturaSheets(rows, threw, throwMsg) {
  if (threw) {
    return { ok: false, rows: [], error: String(throwMsg || 'no se pudo leer').slice(0, 180) };
  }
  const list = Array.isArray(rows) ? rows : [];
  const errores = [];
  const okRows = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const soloError =
      Object.keys(row).length === 1 && Object.prototype.hasOwnProperty.call(row, 'error');
    if (row.error || soloError) {
      const err = row.error;
      const msg =
        typeof err === 'string'
          ? err
          : (err && (err.message || err.description)) || 'error de lectura';
      errores.push(String(msg));
      continue;
    }
    const id = row.id || row.ID || row.codigo || row.property_id;
    const tipo = row.tipo || row.Tipo || row.tipologia;
    const zona = row.zona || row.Zona || row.barrio;
    if (id || tipo || zona) okRows.push(row);
  }
  if (errores.length && !okRows.length) {
    return { ok: false, rows: [], error: errores[0].slice(0, 180) };
  }
  return { ok: true, rows: okRows, error: '' };
}

function leerFilasSheets(nodeName) {
  try {
    const items = $(nodeName)
      .all()
      .map((item) => item.json);
    return clasificarLecturaSheets(items, false, '');
  } catch (e) {
    return clasificarLecturaSheets([], true, e && e.message);
  }
}

function demoModeActivo() {
  try {
    if (typeof $env !== 'undefined' && String($env.DEMO_MODE || '') === '1') return true;
  } catch (e) {}
  try {
    if (typeof process !== 'undefined' && process.env && String(process.env.DEMO_MODE || '') === '1') {
      return true;
    }
  } catch (e2) {}
  return false;
}

function debeAlertarSheets(staticData, nowMs) {
  const sd = staticData && typeof staticData === 'object' ? staticData : {};
  const now = Number(nowMs) || Date.now();
  const prev = Number(sd.sheetsAlertAt || 0);
  if (prev && now - prev < SHEETS_ALERT_MS) return false;
  sd.sheetsAlertAt = now;
  return true;
}

function debeAlertarRafagaSheets(staticData, nowMs) {
  // Una vez por hora. No vacía sheetsChats: cada aviso nombra a todos
  // los que siguen esperando desde el anterior. La lista se borra al volver Sheets.
  return debeAlertarSheets(staticData, nowMs);
}

function registrarClienteSheets(staticData, chat) {
  const sd = staticData && typeof staticData === 'object' ? staticData : {};
  if (!Array.isArray(sd.sheetsChats)) sd.sheetsChats = [];
  const id = String((chat && chat.chat_id) || '');
  const canal = String((chat && chat.canal) || '');
  if (!id) return sd.sheetsChats;
  const previo = sd.sheetsChats.find((c) => c && c.chat_id === id && c.canal === canal);
  const row = {
    chat_id: id,
    nombre: String((chat && chat.nombre) || 'sin nombre').slice(0, 80),
    canal: canal,
    mensaje: String((chat && chat.mensaje) || '').slice(0, 160),
  };
  if (previo) {
    previo.nombre = row.nombre || previo.nombre;
    previo.mensaje = row.mensaje || previo.mensaje;
  } else {
    sd.sheetsChats.push(row);
  }
  return sd.sheetsChats;
}

function textoListaSheets(chats) {
  return (Array.isArray(chats) ? chats : [])
    .map(
      (c) =>
        '- ' +
        (c.nombre || 'sin nombre') +
        ' | ' +
        (c.canal || '') +
        ' | ' +
        c.chat_id +
        ' | ' +
        (c.mensaje || ''),
    )
    .join('\n');
}

function textoAlertaSheets(nodo, error, chats) {
  return (
    'Sheets caído: ' +
    String(nodo || 'Sheets') +
    ' ' +
    String(error || '').slice(0, 160) +
    '\n' +
    textoListaSheets(chats)
  );
}

function tomarRecuperacionSheets(staticData) {
  const sd = staticData && typeof staticData === 'object' ? staticData : {};
  const chats = Array.isArray(sd.sheetsChats) ? sd.sheetsChats.slice() : [];
  if (!chats.length) return '';
  sd.sheetsChats = [];
  return (
    'Sheets volvió, quedaron ' +
    chats.length +
    ' clientes esperando respuesta:\n' +
    textoListaSheets(chats)
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RESPUESTA_SHEETS_CAIDO,
    clasificarLecturaSheets,
    debeAlertarSheets,
    debeAlertarRafagaSheets,
    demoModeActivo,
    registrarClienteSheets,
    textoAlertaSheets,
    tomarRecuperacionSheets,
  };
}
