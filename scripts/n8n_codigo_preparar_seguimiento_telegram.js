/** Usado por workflow "Telegram seguimiento inactivos" (n8n Code node). */
const MIN_DIAS_SIN_CHAT = 4;
const MIN_DIAS_ENTRE_RECORDATORIOS = 5;
const now = Date.now();

const out = [];
for (const item of $input.all()) {
  const r = item.json || {};
  const chatId = r.chat_id != null ? String(r.chat_id).trim() : '';
  const propRaw = r.propiedad_seguimiento != null ? String(r.propiedad_seguimiento).trim() : '';
  if (!chatId || !propRaw) continue;

  const pause = String(r.seguimiento_pausado || '')
    .trim()
    .toUpperCase();
  if (pause === 'SI' || pause === 'SÍ' || pause === '1' || pause === 'TRUE') continue;

  const ultStr = r.ultima_actualizacion != null ? String(r.ultima_actualizacion).trim() : '';
  if (!ultStr) continue;
  const ult = new Date(ultStr);
  if (isNaN(ult.getTime())) continue;
  const diasSinChat = (now - ult.getTime()) / 86400000;
  if (diasSinChat < MIN_DIAS_SIN_CHAT) continue;

  const ultSegStr = r.ultimo_seguimiento != null ? String(r.ultimo_seguimiento).trim() : '';
  if (ultSegStr) {
    const u = new Date(ultSegStr);
    if (!isNaN(u.getTime())) {
      const diasEntre = (now - u.getTime()) / 86400000;
      if (diasEntre < MIN_DIAS_ENTRE_RECORDATORIOS) continue;
    }
  }

  let ref = '';
  try {
    const o = JSON.parse(propRaw);
    if (o && typeof o === 'object') {
      ref = String(o.referencia || o.id || '').trim();
    }
  } catch (e) {
    ref = propRaw.length > 100 ? propRaw.slice(0, 97) + '…' : propRaw;
  }
  if (!ref) ref = 'la propiedad que habíamos visto';

  const nombre = r.nombre != null ? String(r.nombre).trim() : '';
  const saludo = nombre ? 'Hola ' + nombre + ',' : 'Hola,';
  const texto =
    saludo +
    ' te escribo para saber si seguís interesado en ' +
    ref +
    ". No hay ningún compromiso: cuando quieras podés responder y seguimos. Gracias.";

  out.push({
    json: {
      chat_id: chatId,
      texto_seguimiento: texto,
      ultimo_seguimiento_iso: new Date().toISOString(),
    },
  });
}

return out;
