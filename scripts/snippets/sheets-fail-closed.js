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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RESPUESTA_SHEETS_CAIDO,
    clasificarLecturaSheets,
    debeAlertarSheets,
    demoModeActivo,
  };
}
