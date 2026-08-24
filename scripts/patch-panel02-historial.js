/**
 * Patch PANEL-02: after successful Telegram send, append advisor message
 * to Sheets historial_json (role:assistant) then emit chat.message with text.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

function loadApiKey() {
  const mcp = JSON.parse(
    fs.readFileSync(
      path.join(process.env.USERPROFILE, '.cursor', 'mcp.json'),
      'utf8',
    ),
  );
  for (const s of Object.values(mcp.mcpServers || {})) {
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  }
  throw new Error('Sin N8N_API_KEY');
}

const KEY = loadApiKey();
const WF_ID = 'ZhesATaZTLCLjscv';
const HIST_DOC = '1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo';
const SHEETS_CRED = {
  googleSheetsOAuth2Api: {
    id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__',
    name: 'Cuenta de Google Sheets',
  },
};

function request(method, urlPath, body) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
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
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `${method} ${urlPath} ${res.statusCode} ${JSON.stringify(json).slice(0, 800)}`,
              ),
            );
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

const APPEND_CODE = `const mapped = $('Mapear Resultado').item.json;
const chatId = String(mapped.chat_id || '').trim();
const text = String(mapped.text || '').trim();
const rows = $input.all().map((i) => i.json).filter((r) => r && !r.error);
const row = rows.find((r) => String(r.chat_id || '').trim() === chatId) || rows[0] || {};

let hist = [];
const raw = row.historial_json;
try {
  if (typeof raw === 'string' && raw.trim()) hist = JSON.parse(raw);
  else if (Array.isArray(raw)) hist = raw;
} catch (e) {
  hist = [];
}
if (!Array.isArray(hist)) hist = [];

const already = hist.some(
  (m) =>
    m &&
    String(m.role || '').toLowerCase() === 'assistant' &&
    String(m.content || '').trim() === text,
);
if (text && !already) {
  hist.push({
    role: 'assistant',
    content: text,
    ts: new Date().toISOString(),
    source: 'panel',
  });
}
if (hist.length > 60) hist = hist.slice(hist.length - 60);

const ahora = new Date().toISOString();
return [
  {
    json: {
      chat_id: chatId,
      text,
      ok: Boolean(mapped.ok),
      nombre: String(row.nombre || row.nombre_usuario || ''),
      historial_json: JSON.stringify(hist),
      ultima_actualizacion: ahora,
      turno: row.turno != null && row.turno !== '' ? row.turno : hist.length,
      propiedad_seguimiento: String(row.propiedad_seguimiento || ''),
      temperatura: String(row.temperatura || ''),
    },
  },
];`;

async function main() {
  const remote = await request('GET', `/api/v1/workflows/${WF_ID}`);
  const wf = remote.data || remote;

  // Remove prior historial nodes if re-running
  const drop = new Set([
    'Leer Historial Panel',
    'Append Historial Asesor',
    'Actualizar Historial Panel',
  ]);
  wf.nodes = wf.nodes.filter((n) => !drop.has(n.name));

  const leer = {
    id: 'panel02-leer-hist',
    name: 'Leer Historial Panel',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1400, 420],
    onError: 'continueRegularOutput',
    credentials: SHEETS_CRED,
    parameters: {
      documentId: {
        __rl: true,
        value: HIST_DOC,
        mode: 'id',
      },
      sheetName: {
        __rl: true,
        value: 'Hoja 1',
        mode: 'name',
      },
      filtersUI: {
        values: [
          {
            lookupColumn: 'chat_id',
            lookupValue: '={{ $json.chat_id }}',
          },
        ],
      },
      options: {},
    },
  };

  const append = {
    id: 'panel02-append-hist',
    name: 'Append Historial Asesor',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1640, 420],
    parameters: { jsCode: APPEND_CODE },
  };

  const actualizar = {
    id: 'panel02-update-hist',
    name: 'Actualizar Historial Panel',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1880, 420],
    onError: 'continueRegularOutput',
    credentials: SHEETS_CRED,
    parameters: {
      operation: 'appendOrUpdate',
      documentId: {
        __rl: true,
        value: HIST_DOC,
        mode: 'id',
      },
      sheetName: {
        __rl: true,
        value: 'Hoja 1',
        mode: 'name',
      },
      columns: {
        ignoreTypeMismatch: false,
        matchingColumns: ['chat_id'],
        schema: [],
        mappingMode: 'defineBelow',
        attemptToConvertTypes: false,
        value: {
          chat_id: '={{ $json.chat_id }}',
          ultima_actualizacion: '={{ $json.ultima_actualizacion }}',
          nombre: '={{ $json.nombre }}',
          historial_json: '={{ $json.historial_json }}',
          turno: '={{ $json.turno }}',
          propiedad_seguimiento: '={{ $json.propiedad_seguimiento }}',
          temperatura: '={{ $json.temperatura }}',
        },
      },
      options: {},
    },
  };

  // Move Emit further right
  const emit = wf.nodes.find((n) => n.name === 'Emit Chat Realtime');
  if (emit) {
    emit.position = [2120, 420];
    emit.parameters = emit.parameters || {};
    emit.parameters.jsonBody =
      "={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String($('Mapear Resultado').item.json.chat_id || ''), text: String($('Mapear Resultado').item.json.text || ''), side: 'bot', source: 'panel' } }) }}";
  }

  wf.nodes.push(leer, append, actualizar);

  const c = wf.connections || {};
  c['IF Emit OK'] = {
    main: [
      [{ node: 'Leer Historial Panel', type: 'main', index: 0 }],
      [],
    ],
  };
  c['Leer Historial Panel'] = {
    main: [[{ node: 'Append Historial Asesor', type: 'main', index: 0 }]],
  };
  c['Append Historial Asesor'] = {
    main: [[{ node: 'Actualizar Historial Panel', type: 'main', index: 0 }]],
  };
  c['Actualizar Historial Panel'] = {
    main: [[{ node: 'Emit Chat Realtime', type: 'main', index: 0 }]],
  };

  const settings = {};
  for (const key of [
    'executionOrder',
    'timezone',
    'saveManualExecutions',
    'callerPolicy',
    'errorWorkflow',
    'availableInMCP',
  ]) {
    if (wf.settings?.[key] !== undefined) settings[key] = wf.settings[key];
  }
  if (!settings.executionOrder) settings.executionOrder = 'v1';

  await request('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: c,
    settings,
    staticData: wf.staticData ?? null,
  });

  try {
    await request('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  } catch {
    /* ignore */
  }
  await request('POST', `/api/v1/workflows/${WF_ID}/activate`);

  // Sync local JSON
  const localPath = path.join(
    'D:/Dev/Nodo-Propiedades/workflows',
    'PANEL-02 Envio Masivo Telegram.json',
  );
  const local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  local.nodes = wf.nodes.map((n) => {
    const { credentials, ...rest } = n;
    // Keep credentials placeholders in repo for telegram; keep sheets creds as in bot files
    if (n.type === 'n8n-nodes-base.telegram') {
      return {
        ...rest,
        credentials: {
          telegramApi: {
            id: '__SET_TELEGRAM_CREDENTIAL_ID__',
            name: '__SET_TELEGRAM_CREDENTIAL_NAME__',
          },
        },
      };
    }
    if (credentials) return { ...rest, credentials };
    return rest;
  });
  local.connections = c;
  fs.writeFileSync(localPath, JSON.stringify(local, null, 2) + '\n');

  console.log('PANEL-02 historial+emit patched+activated');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
