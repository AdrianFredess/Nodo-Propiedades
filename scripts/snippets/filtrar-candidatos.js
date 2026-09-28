const rows = $input.all().map((i) => i.json);
const now = Date.now();

let mode = 'demo';
try {
  mode = String(($env && $env.SEGUIMIENTO_MODE) || 'demo').toLowerCase();
} catch (e) {
  mode = 'demo';
}

return filtrarCandidatos(rows, now, mode);

function diaClaveAR(ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch (e) {
    const d = new Date(ms - 3 * 60 * 60 * 1000);
    return (
      d.getUTCFullYear() +
      '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getUTCDate()).padStart(2, '0')
    );
  }
}

function esMensajeCliente(m) {
  const role = String(m.role || m.rol || '').toLowerCase();
  if (!role) return true;
  return role === 'user' || role === 'cliente' || role === 'human';
}

function tsDe(m) {
  const raw = m.ts || m.timestamp || m.fecha || m.date || m.created_at;
  if (raw == null || raw === '') return NaN;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function ultimoClienteMs(row) {
  const histRaw = row.historial_json || row.historial || '';
  if (!histRaw) return NaN;
  let parsed = histRaw;
  if (typeof histRaw === 'string') {
    try {
      parsed = JSON.parse(histRaw);
    } catch (_) {
      return NaN;
    }
  }
  if (!Array.isArray(parsed)) return NaN;
  let best = NaN;
  for (const m of parsed) {
    if (!m || typeof m !== 'object' || !esMensajeCliente(m)) continue;
    const t = tsDe(m);
    if (!Number.isNaN(t) && (Number.isNaN(best) || t > best)) best = t;
  }
  return best;
}

function lastMessageTs(row) {
  const candidates = [];
  for (const key of ['ultima_actualizacion', 'last_interaction_at', 'updated_at', 'fecha']) {
    const raw = row[key];
    if (raw == null || raw === '') continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) candidates.push(t);
  }
  const histRaw = row.historial_json || row.historial || '';
  if (histRaw) {
    try {
      const parsed = typeof histRaw === 'string' ? JSON.parse(histRaw) : histRaw;
      if (Array.isArray(parsed)) {
        for (const m of parsed) {
          if (!m || typeof m !== 'object') continue;
          const t = tsDe(m);
          if (!Number.isNaN(t)) candidates.push(t);
        }
      }
    } catch (_) {}
  }
  if (!candidates.length) return { t: NaN, raw: '' };
  const t = Math.max(...candidates);
  return { t, raw: new Date(t).toISOString() };
}

function filtrarCandidatos(rows, now, mode) {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const MS_FIRST = mode === 'prod' ? 5 * MS_DAY : 20 * 60 * 1000;
  const MS_SECOND = mode === 'prod' ? 10 * MS_DAY : 20 * 60 * 1000;
  const blocked = new Set(['cerrado', 'respondido', 'cerrado_sin_respuesta', 'requiere_plantilla']);
  const out = [];
  const hoyAR = diaClaveAR(now);
  for (const row of rows) {
    if (!row || row.error) continue;
    let estado = String(row.estado_seguimiento ?? 'ninguno').trim().toLowerCase();
    if (!estado) estado = 'ninguno';
    if (blocked.has(estado)) continue;
    if (estado !== 'ninguno' && estado !== 'enviado_1') continue;

    const { t, raw: rawDate } = lastMessageTs(row);
    if (!rawDate || Number.isNaN(t)) continue;
    if (diaClaveAR(t) === hoyAR) continue;
    const need = estado === 'enviado_1' ? MS_SECOND : MS_FIRST;
    if (now - t < need) continue;

    const chat_id = String(row.chat_id || row.phone || '').trim();
    if (!chat_id) continue;

    const nombre = String(row.nombre || row.lead_name || 'Cliente').trim() || 'Cliente';
    const zona = String(row.zona || '').trim() || 'tu zona';
    const canal_origen = String(row.canal_origen || row.source || 'telegram').trim().toLowerCase();
    const interes = String(row.temperature || row.temperatura || row.interes || '').trim();
    const telefono = String(row.phone || row.telefono || '').trim();
    const last_message = String(row.last_message || row.ultimo_mensaje || '').trim();

    if (canal_origen === 'whatsapp') {
      const clienteMs = ultimoClienteMs(row);
      const fuera = Number.isNaN(clienteMs) || now - clienteMs > MS_DAY;
      if (fuera) {
        out.push({
          json: {
            chat_id,
            nombre,
            zona,
            canal_origen,
            estado_seguimiento: 'requiere_plantilla',
            requiere_plantilla: true,
            ultima_actualizacion: rawDate,
            interes,
            telefono,
            last_message,
            mensaje: '',
            aviso_vendedor:
              'Seguimiento WhatsApp fuera de 24h. ' +
              nombre +
              ' (' +
              chat_id +
              '). Zona: ' +
              zona +
              '. ' +
              last_message.slice(0, 180),
            seguimiento_mode: mode,
          },
        });
        continue;
      }
    }

    let mensaje;
    if (estado === 'enviado_1') {
      mensaje = 'Hola ' + nombre + ', te dejo por acá. Si retomás la búsqueda avisame y lo vemos';
    } else {
      mensaje =
        'Hola ' + nombre + ', seguís buscando por ' + zona + '? Si querés te paso un par de opciones';
    }

    out.push({
      json: {
        chat_id,
        nombre,
        zona,
        canal_origen,
        estado_seguimiento: estado,
        ultima_actualizacion: rawDate,
        interes,
        telefono,
        last_message,
        mensaje,
        es_ultimo_seguimiento: estado === 'enviado_1',
        seguimiento_mode: mode,
        requiere_plantilla: false,
      },
    });
  }
  return out;
}
