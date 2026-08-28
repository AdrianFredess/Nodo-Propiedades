/**
 * Ajusta SIMPLE-04 (timings demo vs prod + mensajes humanos),
 * Bot TG (estado_seguimiento=respondido al contestar),
 * prompts más humanos (patrones tipo MELI / conversational design).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

function loadApiKey() {
  const mcp = JSON.parse(
    fs.readFileSync(
      path.join(process.env.USERPROFILE, '.cursor/mcp.json'),
      'utf8',
    ),
  );
  for (const s of Object.values(mcp.mcpServers || {})) {
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  }
  throw new Error('Sin N8N_API_KEY');
}
const KEY = loadApiKey();

function request(method, urlPath, body) {
  const url = new URL(urlPath, 'http://localhost:5678');
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'X-N8N-API-KEY': KEY,
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            reject(new Error(data.slice(0, 300)));
            return;
          }
          if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode} ${JSON.stringify(json).slice(0, 600)}`));
            return;
          }
          resolve(json);
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function putSettings(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: s.executionOrder || 'v1',
      ...(s.timezone ? { timezone: s.timezone } : {}),
      ...(s.saveManualExecutions != null
        ? { saveManualExecutions: s.saveManualExecutions }
        : {}),
      ...(s.callerPolicy ? { callerPolicy: s.callerPolicy } : {}),
    },
  };
}

const FILTER_CODE = `const rows = $input.all().map((i) => i.json);
const now = Date.now();

// DEMO (tesis): tiempos comprimidos para poder mostrar el flujo.
// PROD (real): 1.er follow ~5 días; 2.º ~10 días después del primero (no intensivo).
// Setear SEGUIMIENTO_MODE=prod en el contenedor n8n cuando pases a operación real.
let mode = 'demo';
try {
  mode = String(($env && $env.SEGUIMIENTO_MODE) || 'demo').toLowerCase();
} catch (e) {
  mode = 'demo';
}
const MS_DAY = 24 * 60 * 60 * 1000;
const MS_FIRST = mode === 'prod' ? 5 * MS_DAY : 20 * 60 * 1000;
const MS_SECOND = mode === 'prod' ? 10 * MS_DAY : 20 * 60 * 1000;
const blocked = new Set(['cerrado', 'respondido', 'cerrado_sin_respuesta']);

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
          const raw = m.ts || m.timestamp || m.fecha || m.date || m.created_at;
          if (raw == null || raw === '') continue;
          const t = new Date(raw).getTime();
          if (!Number.isNaN(t)) candidates.push(t);
        }
      }
    } catch (_) {
      const matches = String(histRaw).match(/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z?/g) || [];
      for (const m of matches) {
        const t = new Date(m).getTime();
        if (!Number.isNaN(t)) candidates.push(t);
      }
    }
  }
  if (!candidates.length) return { t: NaN, raw: '' };
  const t = Math.max(...candidates);
  return { t, raw: new Date(t).toISOString() };
}

const out = [];
for (const row of rows) {
  if (!row || row.error) continue;
  let estado = String(row.estado_seguimiento ?? 'ninguno').trim().toLowerCase();
  if (!estado) estado = 'ninguno';
  if (blocked.has(estado)) continue;
  if (estado !== 'ninguno' && estado !== 'enviado_1') continue;

  const { t, raw: rawDate } = lastMessageTs(row);
  if (!rawDate || Number.isNaN(t)) continue;
  const need = estado === 'enviado_1' ? MS_SECOND : MS_FIRST;
  if (now - t < need) continue;

  const chat_id = String(row.chat_id || row.phone || '').trim();
  if (!chat_id) continue;

  const nombre = String(row.nombre || row.lead_name || 'Cliente').trim() || 'Cliente';
  const zona = String(row.zona || '').trim() || 'tu zona de interés';
  const canal_origen = String(row.canal_origen || row.source || 'telegram').trim().toLowerCase();
  const interes = String(row.temperature || row.temperatura || row.interes || '').trim();
  const telefono = String(row.phone || row.telefono || '').trim();
  const last_message = String(row.last_message || row.ultimo_mensaje || '').trim();

  // Mensajes cortos, sin presión (como haría un asesor real).
  let mensaje;
  if (estado === 'enviado_1') {
    mensaje =
      'Hola ' + nombre + ', te dejo por acá un toque. Si más adelante retomás la búsqueda en ' +
      zona + ', escribime y lo vemos sin problema. ¡Que andes bien!';
  } else {
    mensaje =
      'Hola ' + nombre + ', ¿seguís con ganas de ver algo por ' + zona +
      '? Si querés te paso un par de opciones nuevas, sin compromiso.';
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
    },
  });
}
return out;
`;

const HUMAN_CORE = `
VOZ (inspirada en buenas prácticas de asistentes reales / MELI UX):
- Cálida, leal, clara y curiosa. Tratá a la persona como igual, no como ticket.
- NUNCA digas que sos bot, IA, asistente virtual ni automatizado.
- Mensajes cortos estilo chat (2–4 oraciones). Una sola pregunta por turno.
- Estrechá opciones (alquilar/comprar, zona, presupuesto) en vez de preguntas abiertas enormes.
- Máximo 1–3 propiedades por mensaje; no listes catálogos enteros.
- Si no sabés algo: admitilo y ofrecé derivar al asesor humano (eso genera confianza).
- Variá saludos y cierres. PROHIBIDO la palabra "che".
- Confirmá lo que entendiste en una línea antes de avanzar ("Dale, entonces buscamos depto en Godoy Cruz…").
`;

async function patchS04() {
  const wf = await request('GET', '/api/v1/workflows/U7Ec6hIatY4t47Fu');
  const node = wf.nodes.find((n) => n.name === 'Filtrar Candidatos');
  node.parameters.jsCode = FILTER_CODE;
  await request('PUT', `/api/v1/workflows/${wf.id}`, putSettings(wf));
  console.log('SIMPLE-04 OK');
}

async function patchTgRespondido() {
  const wf = await request('GET', '/api/v1/workflows/8JoSfkcn3pE1f0av');
  // Sync lead node: set estado_seguimiento respondido when client writes
  for (const n of wf.nodes) {
    const cols = n.parameters && n.parameters.columns && n.parameters.columns.value;
    if (!cols) continue;
    if (Object.prototype.hasOwnProperty.call(cols, 'estado_seguimiento')) {
      if (String(cols.estado_seguimiento).includes('ninguno') && n.name.toLowerCase().includes('lead')) {
        cols.estado_seguimiento = 'respondido';
        console.log('TG set respondido on', n.name);
      }
    }
  }
  const construir = wf.nodes.find((n) => n.name === 'Construir Prompt');
  let code = construir.parameters.jsCode;
  if (!code.includes('VOZ (inspirada')) {
    code = code.replace(
      'ESTILO HUMANO (imprescindible',
      HUMAN_CORE.trim() + '\n\nESTILO HUMANO (imprescindible',
    );
  }
  if (!code.includes('a confirmar')) {
    code = code.replace(
      'VISITAS / CITAS:',
      `VISITAS / CITAS (Agenda_Visitas — turnos libres, quedan a confirmar por el asesor):
- No inventes horarios. Pasá el link de coordinación; el cliente elige un turno libre.
- Decí que queda "a confirmar" (vos validás).

VISITAS / CITAS:`,
    );
  }
  construir.parameters.jsCode = code;
  await request('PUT', `/api/v1/workflows/${wf.id}`, putSettings(wf));
  console.log('Bot Telegram OK');
}

async function patchWaHuman() {
  const wf = await request('GET', '/api/v1/workflows/npq6sC6YLaUBpHac');
  const node = wf.nodes.find((n) => n.name === 'Code - Armar Prompt');
  let code = node.parameters.jsCode;
  if (!code.includes('VOZ (inspirada')) {
    code = code.replace(
      'ESTILO HUMANO (imprescindible)',
      HUMAN_CORE.trim() + '\n\nESTILO HUMANO (imprescindible)',
    );
  }
  if (!code.includes('a confirmar')) {
    code = code.replace(
      'VISITAS:',
      `VISITAS (slots de Agenda_Visitas, a confirmar por el asesor):
- Pasá el link de coordinación; el cliente elige turno libre. No inventes horarios ocupados.
VISITAS:`,
    );
  }
  // Ensure respondido on temp update doesn't reset - check Actualizar Temperatura
  const upd = wf.nodes.find((n) => n.name === 'Google Sheets - Actualizar Temperatura');
  if (upd && upd.parameters.columns && upd.parameters.columns.value) {
    // When client talks after follow-up, should be respondido not ninguno
    upd.parameters.columns.value.estado_seguimiento = 'respondido';
  }
  // Crear/Actualizar early nodes already respondido in file
  node.parameters.jsCode = code;
  await request('PUT', `/api/v1/workflows/${wf.id}`, putSettings(wf));
  console.log('SIMPLE-02 OK');
}

async function main() {
  await patchS04();
  await patchTgRespondido();
  await patchWaHuman();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
