/**
 * Importa SIMPLE-01/02/03 (con parches) y crea SIMPLE-04 en n8n.
 * Uso: node scripts/build_and_import_simple04.js
 */
const fs = require('fs');
const path = require('path');

const API = 'http://localhost:5678/api/v1';
const KEY = process.env.N8N_API_KEY;
if (!KEY) {
  console.error('Falta N8N_API_KEY');
  process.exit(1);
}

const SHEETS_CRED = {
  googleSheetsOAuth2Api: { id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__', name: 'Cuenta de Google Sheets' },
};
const TG_CRED = {
  telegramApi: { id: '__SET_TELEGRAM_CREDENTIAL_ID__', name: 'Telegram Bot Inmobiliaria' },
};
const SPREADSHEET_ID = '__SET_GOOGLE_SHEET_ID__';
const SHEET_LEADS_BOT = 'Leads_Bot';

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      'X-N8N-API-KEY': KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} -> ${res.status}: ${text.slice(0, 800)}`);
  }
  return data;
}

function patchSheetNode(node, canal) {
  if (!node?.parameters?.columns?.value) return false;
  const op = node.parameters.operation;
  if (!['append', 'update', 'appendOrUpdate'].includes(op)) return false;
  node.parameters.columns.value.estado_seguimiento = 'respondido';
  node.parameters.columns.value.canal_origen = canal;
  const schema = node.parameters.columns.schema || [];
  const ensure = (id) => {
    if (!schema.some((s) => s.id === id)) {
      schema.push({
        id,
        displayName: id,
        required: false,
        defaultMatch: false,
        canBeUsedToMatch: false,
      });
    }
  };
  ensure('estado_seguimiento');
  ensure('canal_origen');
  node.parameters.columns.schema = schema;
  return true;
}

function loadAndPatchSimple(fileName, canal, updateNodeNames) {
  const full = path.join(__dirname, '..', 'workflows', fileName);
  const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
  delete wf.id;
  delete wf.active;
  delete wf.versionId;
  delete wf.meta;
  delete wf.tags;
  delete wf.pinData;
  delete wf.staticData;
  let patched = 0;
  for (const node of wf.nodes) {
    if (updateNodeNames.includes(node.name)) {
      if (patchSheetNode(node, canal)) patched += 1;
    }
  }
  return { wf, patched };
}

const FILTER_CODE = `const rows = $input.all().map((i) => i.json);
const now = Date.now();
const MS_WAIT = 20 * 60 * 1000; // 20 min desde último mensaje
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
  if (now - t < MS_WAIT) continue;

  const chat_id = String(row.chat_id || row.phone || '').trim();
  if (!chat_id) continue;

  const nombre = String(row.nombre || row.lead_name || 'Cliente').trim() || 'Cliente';
  const zona = String(row.zona || '').trim() || 'tu zona de interés';
  const canal_origen = String(row.canal_origen || row.source || 'telegram').trim().toLowerCase();

  out.push({
    json: {
      chat_id,
      nombre,
      zona,
      canal_origen,
      estado_seguimiento: estado,
      ultima_actualizacion: rawDate,
      mensaje:
        'Hola ' +
        nombre +
        ', seguís buscando por ' +
        zona +
        '? Si querés te paso un par de opciones',
    },
  });
}
return out;
`;

function buildSimple04() {
  return {
    name: 'SIMPLE-04 Seguimiento Automático',
    settings: {
      executionOrder: 'v1',
      timezone: 'America/Argentina/Buenos_Aires',
    },
    nodes: [
      {
        id: 's04-n01',
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        typeVersion: 1.2,
        position: [0, 300],
        parameters: {
          rule: { interval: [{ field: 'hours', hoursInterval: 6 }] },
        },
      },
      {
        id: 's04-n01b',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 480],
        parameters: {},
        notes: 'Solo para pruebas manuales; el schedule de 6h es el trigger productivo.',
      },
      {
        id: 's04-n02',
        name: 'Google Sheets - Read',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.5,
        position: [260, 300],
        parameters: {
          operation: 'read',
          documentId: { __rl: true, mode: 'id', value: SPREADSHEET_ID },
          sheetName: { __rl: true, mode: 'name', value: SHEET_LEADS_BOT },
          options: {},
        },
        credentials: SHEETS_CRED,
        alwaysOutputData: true,
        onError: 'continueRegularOutput',
      },
      {
        id: 's04-n03',
        name: 'Filtrar Candidatos',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [520, 300],
        parameters: { jsCode: FILTER_CODE },
      },
      {
        id: 's04-n04',
        name: 'IF Hay Candidatos',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [780, 300],
        parameters: {
          conditions: {
            options: {
              version: 2,
              leftValue: '',
              caseSensitive: true,
              typeValidation: 'loose',
            },
            combinator: 'and',
            conditions: [
              {
                id: 'cond-has-chat',
                leftValue: '={{ $json.chat_id }}',
                rightValue: '',
                operator: { type: 'string', operation: 'notEmpty', singleValue: true },
              },
            ],
          },
        },
      },
      {
        id: 's04-n05',
        name: 'Split In Batches',
        type: 'n8n-nodes-base.splitInBatches',
        typeVersion: 3,
        position: [1040, 200],
        parameters: { batchSize: 1, options: {} },
      },
      {
        id: 's04-n06',
        name: 'Switch Canal',
        type: 'n8n-nodes-base.switch',
        typeVersion: 3.2,
        position: [1300, 200],
        parameters: {
          mode: 'rules',
          rules: {
            values: [
              {
                outputKey: 'telegram',
                conditions: {
                  options: {
                    version: 2,
                    leftValue: '',
                    caseSensitive: false,
                    typeValidation: 'loose',
                  },
                  combinator: 'and',
                  conditions: [
                    {
                      leftValue: '={{ $json.canal_origen }}',
                      rightValue: 'telegram',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                },
              },
              {
                outputKey: 'whatsapp',
                conditions: {
                  options: {
                    version: 2,
                    leftValue: '',
                    caseSensitive: false,
                    typeValidation: 'loose',
                  },
                  combinator: 'and',
                  conditions: [
                    {
                      leftValue: '={{ $json.canal_origen }}',
                      rightValue: 'whatsapp',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                },
              },
              {
                outputKey: 'messenger',
                conditions: {
                  options: {
                    version: 2,
                    leftValue: '',
                    caseSensitive: false,
                    typeValidation: 'loose',
                  },
                  combinator: 'and',
                  conditions: [
                    {
                      leftValue: '={{ $json.canal_origen }}',
                      rightValue: 'messenger',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                },
              },
            ],
          },
          options: { fallbackOutput: 'none' },
        },
      },
      {
        id: 's04-n07',
        name: 'Enviar Telegram',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [1580, 40],
        parameters: {
          operation: 'sendMessage',
          chatId: '={{ $json.chat_id }}',
          text: '={{ $json.mensaje }}',
          additionalFields: {},
        },
        credentials: TG_CRED,
        onError: 'continueRegularOutput',
      },
      {
        id: 's04-n08',
        name: 'Enviar WhatsApp',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1580, 200],
        parameters: {
          method: 'POST',
          url: '=https://graph.facebook.com/__SET_META_GRAPH_VERSION__/__SET_META_PHONE_NUMBER_ID__/messages',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'Authorization', value: '=Bearer __SET_META_ACCESS_TOKEN__' },
              { name: 'Content-Type', value: 'application/json' },
            ],
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.chat_id, type: 'text', text: { body: $json.mensaje } }) }}",
          options: {},
        },
        onError: 'continueRegularOutput',
      },
      {
        id: 's04-n09',
        name: 'Enviar Messenger',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1580, 360],
        parameters: {
          method: 'POST',
          url: '=https://graph.facebook.com/__SET_META_GRAPH_VERSION__/me/messages',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'Authorization', value: '=Bearer __SET_META_ACCESS_TOKEN__' },
              { name: 'Content-Type', value: 'application/json' },
            ],
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ JSON.stringify({ recipient: { id: $json.chat_id }, message: { text: $json.mensaje } }) }}',
          options: {},
        },
        onError: 'continueRegularOutput',
      },
      {
        id: 's04-n10',
        name: 'Google Sheets - Update',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.5,
        position: [1860, 200],
        parameters: {
          operation: 'update',
          documentId: { __rl: true, mode: 'id', value: SPREADSHEET_ID },
          sheetName: { __rl: true, mode: 'name', value: SHEET_LEADS_BOT },
          columns: {
            mappingMode: 'defineBelow',
            matchingColumns: ['chat_id'],
            value: {
              chat_id: "={{ $('Split In Batches').item.json.chat_id }}",
              estado_seguimiento:
                "={{ $('Split In Batches').item.json.estado_seguimiento === 'enviado_1' ? 'enviado_2' : 'enviado_1' }}",
              ultima_actualizacion: '={{ $now.toISO() }}',
            },
          },
          options: {},
        },
        credentials: SHEETS_CRED,
        onError: 'continueRegularOutput',
      },
    ],
    connections: {
      'Schedule Trigger': {
        main: [[{ node: 'Google Sheets - Read', type: 'main', index: 0 }]],
      },
      'Manual Trigger': {
        main: [[{ node: 'Google Sheets - Read', type: 'main', index: 0 }]],
      },
      'Google Sheets - Read': {
        main: [[{ node: 'Filtrar Candidatos', type: 'main', index: 0 }]],
      },
      'Filtrar Candidatos': {
        main: [[{ node: 'IF Hay Candidatos', type: 'main', index: 0 }]],
      },
      'IF Hay Candidatos': {
        main: [[{ node: 'Split In Batches', type: 'main', index: 0 }], []],
      },
      'Split In Batches': {
        main: [[{ node: 'Switch Canal', type: 'main', index: 0 }], []],
      },
      'Switch Canal': {
        main: [
          [{ node: 'Enviar Telegram', type: 'main', index: 0 }],
          [{ node: 'Enviar WhatsApp', type: 'main', index: 0 }],
          [{ node: 'Enviar Messenger', type: 'main', index: 0 }],
        ],
      },
      'Enviar Telegram': {
        main: [[{ node: 'Google Sheets - Update', type: 'main', index: 0 }]],
      },
      'Enviar WhatsApp': {
        main: [[{ node: 'Google Sheets - Update', type: 'main', index: 0 }]],
      },
      'Enviar Messenger': {
        main: [[{ node: 'Google Sheets - Update', type: 'main', index: 0 }]],
      },
      'Google Sheets - Update': {
        main: [[{ node: 'Split In Batches', type: 'main', index: 0 }]],
      },
    },
  };
}

function buildSeedWorkflow() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  return {
    name: '_TMP Seed Leads_Bot pruebas',
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        id: 'seed-manual',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      {
        id: 'seed-code',
        name: 'Armar filas prueba',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [240, 0],
        parameters: {
          jsCode: `return [
  { json: { chat_id: 'TEST_SEG_48H', nombre: 'Prueba Seguimiento', zona: 'Godoy Cruz', canal_origen: 'telegram', estado_seguimiento: 'ninguno', ultima_actualizacion: '${threeDaysAgo}' } },
  { json: { chat_id: 'TEST_SEG_RECIENTE', nombre: 'Prueba Reciente', zona: 'Maipu', canal_origen: 'telegram', estado_seguimiento: 'ninguno', ultima_actualizacion: '${oneDayAgo}' } },
  { json: { chat_id: 'TEST_SEG_ENVIADO2', nombre: 'Prueba Tope', zona: 'Ciudad', canal_origen: 'telegram', estado_seguimiento: 'enviado_2', ultima_actualizacion: '${threeDaysAgo}' } },
];`,
        },
      },
      {
        id: 'seed-append',
        name: 'Google Sheets - Append prueba',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.5,
        position: [500, 0],
        parameters: {
          operation: 'append',
          documentId: { __rl: true, mode: 'id', value: SPREADSHEET_ID },
          sheetName: { __rl: true, mode: 'name', value: SHEET_LEADS_BOT },
          columns: {
            mappingMode: 'defineBelow',
            value: {
              chat_id: '={{ $json.chat_id }}',
              nombre: '={{ $json.nombre }}',
              zona: '={{ $json.zona }}',
              canal_origen: '={{ $json.canal_origen }}',
              estado_seguimiento: '={{ $json.estado_seguimiento }}',
              ultima_actualizacion: '={{ $json.ultima_actualizacion }}',
            },
          },
          options: {},
        },
        credentials: SHEETS_CRED,
        onError: 'continueRegularOutput',
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Armar filas prueba', type: 'main', index: 0 }]],
      },
      'Armar filas prueba': {
        main: [[{ node: 'Google Sheets - Append prueba', type: 'main', index: 0 }]],
      },
    },
  };
}

async function findByName(name) {
  const list = await api('GET', '/workflows?limit=100');
  return (list.data || []).find((w) => w.name === name) || null;
}

async function upsertWorkflow(payload) {
  const existing = await findByName(payload.name);
  if (existing) {
    const full = await api('GET', `/workflows/${existing.id}`);
    const updated = await api('PUT', `/workflows/${existing.id}`, {
      name: payload.name,
      nodes: payload.nodes,
      connections: payload.connections,
      settings: payload.settings || full.settings || { executionOrder: 'v1' },
    });
    return { id: updated.id || existing.id, action: 'updated' };
  }
  const created = await api('POST', '/workflows', payload);
  return { id: created.id, action: 'created' };
}

async function main() {
  const out = {};

  // SIMPLE-01
  const s01 = loadAndPatchSimple('SIMPLE-01 Telegram Bot.json', 'telegram', [
    'Google Sheets - Guardar',
  ]);
  out.s01 = { ...(await upsertWorkflow(s01.wf)), patchedNodes: s01.patched };

  // SIMPLE-02
  const s02 = loadAndPatchSimple('SIMPLE-02 WhatsApp Bot.json', 'whatsapp', [
    'Google Sheets - Actualizar Lead',
    'Google Sheets - Crear Lead',
  ]);
  out.s02 = { ...(await upsertWorkflow(s02.wf)), patchedNodes: s02.patched };

  // SIMPLE-03
  const s03 = loadAndPatchSimple('SIMPLE-03 Messenger Bot.json', 'messenger', [
    'Google Sheets - Actualizar Lead',
    'Google Sheets - Crear Lead',
  ]);
  out.s03 = { ...(await upsertWorkflow(s03.wf)), patchedNodes: s03.patched };

  // SIMPLE-04
  const s04 = buildSimple04();
  fs.writeFileSync(
    path.join(__dirname, '..', 'workflows', 'SIMPLE-04 Seguimiento Automatico.json'),
    JSON.stringify(s04, null, 2),
    'utf8',
  );
  out.s04 = await upsertWorkflow(s04);

  // Seed
  const seed = buildSeedWorkflow();
  out.seed = await upsertWorkflow(seed);

  // Clean old probe if present
  const probe = await findByName('_TMP Probe Leads_Bot');
  if (probe) {
    await api('DELETE', `/workflows/${probe.id}`);
    out.probeDeleted = probe.id;
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
