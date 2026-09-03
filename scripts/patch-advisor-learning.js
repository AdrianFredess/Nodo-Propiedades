/**
 * Despliega nodos de aprendizaje Matías (Sheets few-shot + registro) en WA y Telegram.
 *
 * Uso:
 *   node scripts/patch-advisor-learning.js           # actualiza JSON locales
 *   node scripts/patch-advisor-learning.js --deploy  # también sube a n8n local
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const MEDIA_PATH = path.join(ROOT, 'data', 'propiedad-media.json');
const LEARNING_PATH = path.join(ROOT, 'data', 'bot-aprendizaje.json');
const DEPLOY = process.argv.includes('--deploy');

const WORKFLOWS = [
  {
    label: 'SIMPLE-02 WhatsApp',
    id: 'npq6sC6YLaUBpHac',
    path: path.join(ROOT, 'workflows', 'SIMPLE-02 WhatsApp Bot.json'),
    kind: 'wa',
  },
  {
    label: 'Bot Telegram',
    id: '8JoSfkcn3pE1f0av',
    path: path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json'),
    kind: 'tg',
  },
];

const PROP_MEDIA = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
const BOT_APRENDIZAJE = JSON.parse(fs.readFileSync(LEARNING_PATH, 'utf8'));
const STOCK_CSV_PATH = path.join(ROOT, 'csv', 'Simulacion_30_Propiedades_Mendoza.csv');

function stockFallbackJson() {
  try {
    const raw = fs.readFileSync(STOCK_CSV_PATH, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return '[]';
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 5) continue;
      const id = parts[0].trim();
      const tipo = parts[1].trim();
      const zona = parts[2].trim();
      const precio = parts[3].trim();
      const estado = parts[parts.length - 1].trim();
      const descripcion = parts.slice(4, -1).join(',').trim();
      if (!id) continue;
      rows.push({ id, tipo, zona, precio, descripcion, estado, operacion: 'venta' });
    }
    return JSON.stringify(rows);
  } catch (e) {
    return '[]';
  }
}

function loadEnvValue(key, fallback) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return fallback;
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) return fallback;
  return String(m[1]).trim().replace(/^["']|["']$/g, '') || fallback;
}

function loadApiKey() {
  const fromEnv = loadEnvValue('N8N_API_KEY', '');
  if (fromEnv) return fromEnv;
  try {
    const mcp = JSON.parse(
      fs.readFileSync(
        path.join(process.env.USERPROFILE, '.cursor/mcp.json'),
        'utf8',
      ),
    );
    for (const s of Object.values(mcp.mcpServers || {})) {
      if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
    }
  } catch (e) {}
  return '';
}

function snippet(name) {
  let code = fs.readFileSync(path.join(__dirname, 'snippets', name), 'utf8');
  code = code.replace(/__PROP_MEDIA_JSON__/g, JSON.stringify(PROP_MEDIA));
  code = code.replace(/__STOCK_FALLBACK_JSON__/g, stockFallbackJson());
  return code;
}

function intentClassifierSnippet() {
  return fs.readFileSync(
    path.join(__dirname, 'snippets', 'intent-classifier.js'),
    'utf8',
  );
}

function learningSnippet() {
  let code = fs.readFileSync(
    path.join(__dirname, 'snippets', 'bot-aprendizaje.js'),
    'utf8',
  );
  code = code.replace(/__BOT_APRENDIZAJE_JSON__/g, JSON.stringify(BOT_APRENDIZAJE));
  return code;
}

function humanizeSnippet() {
  return fs.readFileSync(
    path.join(__dirname, 'snippets', 'humanize-voz.js'),
    'utf8',
  );
}

function citaWebhookBase() {
  const webhook = loadEnvValue(
    'WEBHOOK_URL',
    'https://deranged-defile-comrade.ngrok-free.dev',
  );
  return webhook.replace(/\/$/, '');
}

function promptSnippet(name) {
  let code =
    humanizeSnippet() +
    '\n' +
    intentClassifierSnippet() +
    '\n' +
    learningSnippet() +
    '\n' +
    snippet(name);
  code = code.replace(/__CITA_WEBHOOK_BASE__/g, citaWebhookBase());
  return code;
}

function postProcessSnippet(name) {
  return (
    humanizeSnippet() +
    '\n' +
    intentClassifierSnippet() +
    '\n' +
    learningSnippet() +
    '\n' +
    snippet(name)
  );
}

function ensureNode(wf, id, node) {
  const idx = wf.nodes.findIndex((n) => n.id === id || n.name === node.name);
  if (idx >= 0) {
    wf.nodes[idx] = { ...wf.nodes[idx], ...node };
    return false;
  }
  wf.nodes.push(node);
  return true;
}

function sheetsCredFrom(wf) {
  const buscar =
    wf.nodes.find((n) => n.name === 'Google Sheets - Buscar Lead') ||
    wf.nodes.find((n) => n.name === 'Registrar Consulta Telegram') ||
    wf.nodes.find((n) => n.name === 'Google Sheets - Registrar Consulta');
  return (
    buscar?.credentials || {
      googleSheetsOAuth2Api: {
        id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__',
        name: 'Cuenta de Google Sheets',
      },
    }
  );
}

function sheetId() {
  return loadEnvValue(
    'GOOGLE_SHEET_ID',
    '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ',
  );
}

function leerAprendizajeNode(id, name, cred, position) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position,
    credentials: cred,
    onError: 'continueRegularOutput',
    parameters: {
      documentId: { __rl: true, mode: 'id', value: sheetId() },
      sheetName: { __rl: true, mode: 'name', value: 'Aprendizaje_Matias' },
      resource: 'sheet',
      operation: 'read',
      options: {
        dataLocationOnSheet: {
          values: { range: 'A:J', rangeDefinition: 'specifyRangeA1' },
        },
      },
    },
  };
}

function ifRegistrarNode(id, name, position, sourceNode) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'registrar-aprendizaje',
            leftValue: `={{ $('${sourceNode}').first().json.registrar_aprendizaje }}`,
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
}

function registrarAprendizajeNode(id, name, cred, position, sourceNode) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position,
    credentials: cred,
    onError: 'continueRegularOutput',
    parameters: {
      documentId: { __rl: true, mode: 'id', value: sheetId() },
      sheetName: { __rl: true, mode: 'name', value: 'Aprendizaje_Matias' },
      resource: 'sheet',
      operation: 'append',
      options: { useAppend: true },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: [],
        schema: [],
        value: {
          fecha: `={{ $('${sourceNode}').first().json.aprendizaje_fecha }}`,
          canal: `={{ $('${sourceNode}').first().json.aprendizaje_canal }}`,
          contexto_cliente: `={{ $('${sourceNode}').first().json.aprendizaje_contexto_cliente }}`,
          respuesta_matias: `={{ $('${sourceNode}').first().json.aprendizaje_respuesta_matias }}`,
          zona: `={{ $('${sourceNode}').first().json.aprendizaje_zona }}`,
          operacion: `={{ $('${sourceNode}').first().json.aprendizaje_operacion }}`,
          presupuesto: `={{ $('${sourceNode}').first().json.aprendizaje_presupuesto }}`,
          temperatura: `={{ $('${sourceNode}').first().json.aprendizaje_temperatura }}`,
          intencion: `={{ $('${sourceNode}').first().json.aprendizaje_intencion }}`,
          patron: `={{ $('${sourceNode}').first().json.aprendizaje_patron }}`,
        },
      },
    },
  };
}

function patchSnippetsWa(wf) {
  const armar = wf.nodes.find((n) => n.name === 'Code - Armar Prompt');
  const procesar = wf.nodes.find((n) => n.name === 'Code - Procesar IA');
  if (!armar || !procesar) throw new Error('Nodos WA Armar/Procesar faltantes');
  armar.parameters.jsCode = promptSnippet('wa-armar-prompt.js');
  procesar.parameters.jsCode = postProcessSnippet('wa-procesar-ia.js');
}

function patchSnippetsTg(wf) {
  const construir = wf.nodes.find((n) => n.name === 'Construir Prompt');
  const parsear = wf.nodes.find((n) => n.name === 'Parsear Respuesta');
  if (!construir || !parsear) throw new Error('Nodos TG Construir/Parsear faltantes');
  construir.parameters.jsCode = promptSnippet('tg-construir-prompt.js');
  parsear.parameters.jsCode = postProcessSnippet('tg-parsear-respuesta.js');
}

function setGroqMaxTokens(wf) {
  for (const node of wf.nodes || []) {
    if (node.name === 'Groq Chat Model' && node.parameters) {
      if (!node.parameters.options) node.parameters.options = {};
      node.parameters.options.maxTokens = 1200;
    }
    const body = node.parameters && node.parameters.jsonBody;
    if (typeof body === 'string' && /max_tokens:\s*\d+/.test(body) && /gpt-oss/.test(body)) {
      node.parameters.jsonBody = body.replace(/max_tokens:\s*\d+/, 'max_tokens: 1200');
    }
  }
}

function patchWa(wf) {
  patchSnippetsWa(wf);
  setGroqMaxTokens(wf);
  const cred = sheetsCredFrom(wf);

  ensureNode(
    wf,
    'wa-leer-aprendizaje',
    leerAprendizajeNode(
      'wa-leer-aprendizaje',
      'Leer Aprendizaje Matias',
      cred,
      [1080, 680],
    ),
  );
  ensureNode(
    wf,
    'wa-if-aprendizaje',
    ifRegistrarNode(
      'wa-if-aprendizaje',
      'IF Registrar Aprendizaje',
      [2620, 680],
      'Code - Procesar IA',
    ),
  );
  ensureNode(
    wf,
    'wa-registrar-aprendizaje',
    registrarAprendizajeNode(
      'wa-registrar-aprendizaje',
      'Registrar Aprendizaje Matias',
      cred,
      [2840, 680],
      'Code - Procesar IA',
    ),
  );

  const ifTiene = wf.connections['IF - Tiene Mensaje']?.main?.[0] || [];
  if (!ifTiene.some((c) => c.node === 'Leer Aprendizaje Matias')) {
    ifTiene.push({ node: 'Leer Aprendizaje Matias', type: 'main', index: 0 });
  }
  wf.connections['IF - Tiene Mensaje'] = { main: [ifTiene] };

  const procOut = wf.connections['Code - Procesar IA']?.main?.[0] || [];
  if (!procOut.some((c) => c.node === 'IF Registrar Aprendizaje')) {
    procOut.push({ node: 'IF Registrar Aprendizaje', type: 'main', index: 0 });
  }
  wf.connections['Code - Procesar IA'] = { main: [procOut] };

  wf.connections['IF Registrar Aprendizaje'] = {
    main: [[{ node: 'Registrar Aprendizaje Matias', type: 'main', index: 0 }], []],
  };

  return wf;
}

function patchTg(wf) {
  patchSnippetsTg(wf);
  setGroqMaxTokens(wf);
  const cred = sheetsCredFrom(wf);

  const setNode = wf.nodes.find((n) => n.name === 'Set Variables');
  if (setNode && setNode.parameters && setNode.parameters.assignments) {
    const assigns = setNode.parameters.assignments.assignments || [];
    const hasVoice = assigns.some((a) => a.name === 'voice_file_id');
    if (!hasVoice) {
      assigns.push({
        id: 'assign-voice',
        name: 'voice_file_id',
        value:
          "={{ $json.message.voice ? $json.message.voice.file_id : ($json.message.audio ? $json.message.audio.file_id : '') }}",
        type: 'string',
      });
    }
    const texto = assigns.find((a) => a.name === 'texto_usuario');
    if (texto) {
      texto.value =
        "={{ $json.message.text || $json.message.caption || '' }}";
    }
  }

  ensureNode(wf, 'tg-transcribir-audio', {
    id: 'tg-transcribir-audio',
    name: 'Transcribir Audio TG',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [520, 304],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: snippet('tg-transcribir-audio.js'),
    },
  });

  wf.connections['Set Variables'] = {
    main: [[{ node: 'Transcribir Audio TG', type: 'main', index: 0 }]],
  };

  const tgReaders = [
    { node: 'Leer Stock Propiedades', type: 'main', index: 0 },
    { node: 'Leer Historial', type: 'main', index: 0 },
    { node: 'Leer Politicas Pago', type: 'main', index: 0 },
    { node: 'Leer Aprendizaje Matias TG', type: 'main', index: 0 },
  ];
  const existingFan = (wf.connections['Transcribir Audio TG']?.main?.[0] || []).filter(
    (c) =>
      c.node &&
      c.node !== 'Transcribir Audio TG' &&
      !tgReaders.some((r) => r.node === c.node),
  );
  wf.connections['Transcribir Audio TG'] = {
    main: [[...tgReaders, ...existingFan]],
  };

  ensureNode(
    wf,
    'tg-leer-aprendizaje',
    leerAprendizajeNode(
      'tg-leer-aprendizaje',
      'Leer Aprendizaje Matias TG',
      cred,
      [576, 680],
    ),
  );
  ensureNode(
    wf,
    'tg-if-aprendizaje',
    ifRegistrarNode(
      'tg-if-aprendizaje',
      'IF Registrar Aprendizaje TG',
      [1792, 680],
      'Parsear Respuesta',
    ),
  );
  ensureNode(
    wf,
    'tg-registrar-aprendizaje',
    registrarAprendizajeNode(
      'tg-registrar-aprendizaje',
      'Registrar Aprendizaje Matias TG',
      cred,
      [2012, 680],
      'Parsear Respuesta',
    ),
  );

  const merge = wf.nodes.find((n) => n.name === 'Esperar Lecturas');
  if (merge?.parameters) {
    const inputs = Number(merge.parameters.numberInputs) || 3;
    if (inputs < 4) merge.parameters.numberInputs = 4;
  }

  wf.connections['Leer Aprendizaje Matias TG'] = {
    main: [[{ node: 'Esperar Lecturas', type: 'main', index: 3 }]],
  };

  const parseOut = wf.connections['Parsear Respuesta']?.main?.[0] || [];
  if (!parseOut.some((c) => c.node === 'IF Registrar Aprendizaje TG')) {
    parseOut.push({ node: 'IF Registrar Aprendizaje TG', type: 'main', index: 0 });
  }
  wf.connections['Parsear Respuesta'] = { main: [parseOut] };

  wf.connections['IF Registrar Aprendizaje TG'] = {
    main: [
      [{ node: 'Registrar Aprendizaje Matias TG', type: 'main', index: 0 }],
      [],
    ],
  };

  return wf;
}

function substituteEnv(wf) {
  const vars = {
    __SET_GOOGLE_SHEET_ID__: sheetId(),
    __SET_GROQ_API_KEY__: loadEnvValue('GROQ_API_KEY', ''),
    __SET_TELEGRAM_BOT_TOKEN__: loadEnvValue('TELEGRAM_BOT_TOKEN', ''),
  };
  let raw = JSON.stringify(wf);
  for (const [k, v] of Object.entries(vars)) {
    if (v) raw = raw.split(k).join(v);
  }
  return JSON.parse(raw);
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

function request(method, urlPath, body, apiKey) {
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
          'X-N8N-API-KEY': apiKey,
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
            reject(new Error(data.slice(0, 400)));
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

async function deployWorkflow(meta, apiKey) {
  let remote = await request('GET', `/api/v1/workflows/${meta.id}`, null, apiKey);
  const patcher = meta.kind === 'wa' ? patchWa : patchTg;
  const patched = substituteEnv(patcher(remote));
  await request('PUT', `/api/v1/workflows/${meta.id}`, putSettings(patched), apiKey);
  await request('POST', `/api/v1/workflows/${meta.id}/deactivate`, null, apiKey);
  await request('POST', `/api/v1/workflows/${meta.id}/activate`, null, apiKey);
}

async function main() {
  console.log('→ Aprendizaje Matías (Sheets few-shot)');

  for (const meta of WORKFLOWS) {
    console.log(`  ${meta.label}`);
    const wf = JSON.parse(fs.readFileSync(meta.path, 'utf8'));
    if (meta.kind === 'wa') patchWa(wf);
    else patchTg(wf);
    fs.writeFileSync(meta.path, JSON.stringify(wf, null, 2) + '\n', 'utf8');
    console.log('    OK JSON:', meta.path);
  }

  if (DEPLOY) {
    const apiKey = loadApiKey();
    if (!apiKey) {
      console.log('  SKIP deploy: sin N8N_API_KEY');
    } else {
      for (const meta of WORKFLOWS) {
        try {
          await deployWorkflow(meta, apiKey);
          console.log('    OK deploy n8n', meta.id);
        } catch (e) {
          console.log('    WARN deploy', meta.label + ':', e.message);
        }
      }
    }
  } else {
    console.log(
      '  Tip: node scripts/patch-advisor-learning.js --deploy cuando n8n esté activo',
    );
  }

  console.log('\n  Recordá crear la pestaña Aprendizaje_Matias (ver docs/APRENDIZAJE-MATIAS.md)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
