/**
 * Migra SIMPLE-03 Messenger a Matías (mismos snippets WA) + outbound Graph API.
 *
 * Uso:
 *   node scripts/patch-messenger-matias.js
 *   node scripts/patch-messenger-matias.js --deploy
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const WF_PATH = path.join(ROOT, 'workflows', 'SIMPLE-03 Messenger Bot.json');
const MEDIA_PATH = path.join(ROOT, 'data', 'propiedad-media.json');
const WF_ID = 'XhceE1kxNalCTMw4';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'adrianfredes12@gmail.com';
const DEPLOY = process.argv.includes('--deploy');

function loadEnvValueEarly(key, fallback) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return fallback;
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) return fallback;
  return String(m[1]).trim().replace(/^["']|["']$/g, '') || fallback;
}

const META_GRAPH_VERSION = 'v21.0';
const META_MSG_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/messages`;
const MESSENGER_PAGE_TOKEN = loadEnvValueEarly(
  'MESSENGER_PAGE_TOKEN',
  'EAAPfGQWI8MMBSUjBpOlKNbP9SWZBEXmjn9AIlQeG4SM1MM6DMQACHzPsjbeiDei7SDbiHFZANCSkEylIpJObmcLVDHbg0Gbn8wdZC4nq73AaVVS4WZCR1kTU0fX0y5pl9HfsR1moqWFPilMGXV910buhGpC9on5BjK7zKIca7ET5ncaQIUq4h8SVKOp8XSonjWMZB86EMjwZDZD',
);
const META_AUTH = `Bearer ${MESSENGER_PAGE_TOKEN}`;

const PROP_MEDIA = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));

function snippet(name) {
  let code = fs.readFileSync(path.join(__dirname, 'snippets', name), 'utf8');
  code = code.replace(/__PROP_MEDIA_JSON__/g, JSON.stringify(PROP_MEDIA));
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
  const learningPath = path.join(ROOT, 'data', 'bot-aprendizaje.json');
  const BOT_APRENDIZAJE = JSON.parse(fs.readFileSync(learningPath, 'utf8'));
  code = code.replace(/__BOT_APRENDIZAJE_JSON__/g, JSON.stringify(BOT_APRENDIZAJE));
  return code;
}

function postProcessSnippet(name) {
  const shared = fs.readFileSync(
    path.join(__dirname, 'snippets', 'humanize-voz.js'),
    'utf8',
  );
  return (
    shared +
    '\n' +
    intentClassifierSnippet() +
    '\n' +
    learningSnippet() +
    '\n' +
    snippet(name)
  );
}

function loadEnvValue(key, fallback) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return fallback;
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) return fallback;
  return String(m[1]).trim().replace(/^["']|["']$/g, '') || fallback;
}

function citaWebhookBase() {
  const webhook = loadEnvValue(
    'WEBHOOK_URL',
    'https://deranged-defile-comrade.ngrok-free.dev',
  );
  return webhook.replace(/\/$/, '');
}

function msSnippetFromWa(waName) {
  const shared = fs.readFileSync(
    path.join(__dirname, 'snippets', 'humanize-voz.js'),
    'utf8',
  );
  let code =
    waName === 'wa-procesar-ia.js'
      ? postProcessSnippet(waName)
      : shared +
        '\n' +
        intentClassifierSnippet() +
        '\n' +
        learningSnippet() +
        '\n' +
        snippet(waName);
  code = code.replace(/__CITA_WEBHOOK_BASE__/g, citaWebhookBase());
  code = code.replace(
    /\$\('Code - Normalizar WhatsApp'\)/g,
    "$('Code - Normalizar Messenger')",
  );
  code = code.replace(/respuesta_wa/g, 'respuesta_messenger');
  code = code.replace(/WhatsApp/g, 'Messenger');
  code = code.replace(/whatsapp/g, 'messenger');
  return code;
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

function metaHeaders() {
  return {
    parameters: [
      { name: 'Authorization', value: META_AUTH },
      { name: 'Content-Type', value: 'application/json' },
    ],
  };
}

function msRecipient(jsonPath) {
  return `String(${jsonPath}.chat_id || "")`;
}

function patchNormalizer(wf) {
  const norm = wf.nodes.find((n) => n.name === 'Code - Normalizar Messenger');
  if (!norm) throw new Error('Code - Normalizar Messenger no encontrado');
  norm.parameters.jsCode = snippet('ms-normalizar.js');
}

function patchBuscarLead(wf) {
  const buscar = wf.nodes.find((n) => n.name === 'Google Sheets - Buscar Lead');
  if (!buscar) throw new Error('Google Sheets - Buscar Lead no encontrado');
  buscar.typeVersion = 4.7;
  buscar.onError = 'continueRegularOutput';
  buscar.alwaysOutputData = true;
  buscar.parameters = {
    documentId: {
      __rl: true,
      mode: 'id',
      value: '__SET_GOOGLE_SHEET_ID__',
    },
    filtersUI: {
      values: [
        {
          lookupColumn: 'chat_id',
          lookupValue: "={{ $('Code - Normalizar Messenger').item.json.chat_id }}",
        },
      ],
    },
    operation: 'read',
    options: { returnFirstMatch: true },
    resource: 'sheet',
    sheetName: { __rl: true, mode: 'name', value: 'Leads_Bot' },
  };
}

function patchPrompts(wf) {
  const armar = wf.nodes.find((n) => n.name === 'Code - Armar Prompt');
  const procesar = wf.nodes.find((n) => n.name === 'Code - Procesar IA');
  if (!armar || !procesar) throw new Error('Nodos Armar/Procesar faltantes');
  armar.parameters.jsCode = msSnippetFromWa('wa-armar-prompt.js');
  procesar.parameters.jsCode = msSnippetFromWa('wa-procesar-ia.js');
}

function patchSheetsUpdate(wf) {
  const upd = wf.nodes.find((n) => n.name === 'Google Sheets - Actualizar Temperatura');
  if (!upd) throw new Error('Google Sheets - Actualizar Temperatura no encontrado');
  upd.typeVersion = 4.7;
  upd.onError = 'continueRegularOutput';
  upd.parameters = {
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: ['chat_id'],
      schema: [],
      value: {
        canal_origen: 'messenger',
        chat_id: '={{ $json.chat_id }}',
        consultas_count: '={{ $json.consultas_count }}',
        dedupe_key: '={{ $json.dedupe_key }}',
        dormitorios: '={{ $json.dormitorios }}',
        estado_seguimiento: 'ninguno',
        historial: '={{ $json.historial }}',
        historial_json: '={{ $json.historial_json }}',
        last_bot_message: '={{ $json.respuesta_messenger }}',
        last_message: '={{ $json.mensaje }}',
        lead_completo: '={{ $json.lead_completo }}',
        lead_intent: '={{ $json.intencion }}',
        lead_name: '={{ $json.lead_name }}',
        nombre: '={{ $json.lead_name }}',
        operacion: '={{ $json.operacion }}',
        phone: '={{ $json.phone }}',
        presupuesto: '={{ $json.presupuesto }}',
        source: 'messenger',
        status: '={{ $json.status }}',
        temperature: '={{ $json.temperatura }}',
        tipo_propiedad: '={{ $json.tipo_propiedad }}',
        ultima_actualizacion: '={{ $json.fecha }}',
        ultima_consulta_fecha: '={{ $json.fecha_local }}',
        updated_at: '={{ $json.fecha }}',
        zona: '={{ $json.zona }}',
      },
    },
    documentId: { __rl: true, mode: 'id', value: '__SET_GOOGLE_SHEET_ID__' },
    operation: 'appendOrUpdate',
    options: {},
    resource: 'sheet',
    sheetName: { __rl: true, mode: 'name', value: 'Leads_Bot' },
  };
}

function msSendNode(id, name, position, jsonBodyExpr) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: META_MSG_URL,
      sendBody: true,
      specifyBody: 'json',
      sendHeaders: true,
      headerParameters: metaHeaders(),
      jsonBody: jsonBodyExpr,
      options: {},
    },
  };
}

function patchOutboundAndAsesor(wf) {
  const buscarLead = wf.nodes.find((n) => n.name === 'Google Sheets - Buscar Lead');
  const sheetsCred = buscarLead?.credentials || {
    googleSheetsOAuth2Api: {
      id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__',
      name: 'Cuenta de Google Sheets',
    },
  };

  const sendMs = wf.nodes.find((n) => n.name === 'HTTP Request - Enviar Messenger');
  if (!sendMs) throw new Error('HTTP Request - Enviar Messenger no encontrado');
  const procRef = "$('Code - Procesar IA').first().json";
  sendMs.parameters = {
    method: 'POST',
    url: META_MSG_URL,
    sendBody: true,
    specifyBody: 'json',
    sendHeaders: true,
    headerParameters: metaHeaders(),
    jsonBody: `={{ JSON.stringify({ recipient: { id: ${msRecipient(procRef)} }, messaging_type: "RESPONSE", message: { text: String(${procRef}.respuesta_messenger || "").slice(0, 2000) } }) }}`,
    options: {},
  };
  sendMs.onError = 'continueRegularOutput';

  const stockNode = {
    id: 'ms-leer-stock',
    name: 'Leer Stock Propiedades MS',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1080, 520],
    credentials: sheetsCred,
    onError: 'continueRegularOutput',
    parameters: {
      documentId: {
        __rl: true,
        mode: 'id',
        value: '1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU',
      },
      sheetName: { __rl: true, mode: 'name', value: 'Hoja 1' },
      resource: 'sheet',
      operation: 'read',
      options: {
        dataLocationOnSheet: {
          values: { range: 'A:ZZ', rangeDefinition: 'specifyRangeA1' },
        },
      },
    },
  };

  const prepBurbujas = {
    id: 'ms-prep-burbujas',
    name: 'Preparar Burbujas MS',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2840, 180],
    parameters: { jsCode: msSnippetFromWa('wa-preparar-burbujas.js') },
  };

  const ifBurbujas = {
    id: 'ms-if-burbujas',
    name: 'IF Tiene Burbujas MS',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3060, 180],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-burbuja-ms',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const metaBurbuja = msSendNode(
    'ms-send-burbuja',
    'Meta Enviar Burbuja MS',
    [3280, 140],
    `={{ JSON.stringify({ recipient: { id: ${msRecipient('$json')} }, messaging_type: "RESPONSE", message: { text: String($json.text || "").slice(0, 2000) } }) }}`,
  );

  const ifUltimaBurbuja = {
    id: 'ms-if-ultima-burbuja',
    name: 'IF Ultima Burbuja MS',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3500, 140],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'ultima-burbuja-ms',
            leftValue: "={{ $('Preparar Burbujas MS').item.json.is_last_burbuja }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const prepFotos = {
    id: 'ms-prep-fotos',
    name: 'Preparar Fotos MS',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2840, 300],
    parameters: { jsCode: msSnippetFromWa('wa-preparar-fotos.js') },
  };

  const ifFotos = {
    id: 'ms-if-fotos',
    name: 'IF Tiene Fotos MS',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3060, 300],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-photo-ms',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const metaCaption = msSendNode(
    'ms-send-caption',
    'Meta Enviar Caption MS',
    [3280, 380],
    `={{ JSON.stringify({ recipient: { id: ${msRecipient('$json')} }, messaging_type: "RESPONSE", message: { text: String($json.caption || "").slice(0, 2000) } }) }}`,
  );

  const metaImg = msSendNode(
    'ms-send-image',
    'Meta Enviar Imagen MS',
    [3500, 300],
    `={{ JSON.stringify({ recipient: { id: ${msRecipient('$json')} }, messaging_type: "RESPONSE", message: { attachment: { type: "image", payload: { url: String($json.photo_url || ""), is_reusable: true } } } }) }}`,
  );

  const ifUltimaFoto = {
    id: 'ms-if-ultima-foto',
    name: 'IF Ultima Foto MS',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3720, 300],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'ultima-foto-ms',
            leftValue: "={{ $('Preparar Fotos MS').item.json.is_last_photo }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const ifCierre = {
    id: 'ms-if-cierre',
    name: 'IF Tiene Cierre MS',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3940, 260],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-cierre-ms',
            leftValue:
              "={{ String($('Code - Procesar IA').first().json.mensaje_cierre || '').trim() }}",
            rightValue: '',
            operator: { type: 'string', operation: 'notEquals' },
          },
        ],
        options: { version: 2 },
      },
    },
  };

  const metaCierre = msSendNode(
    'ms-send-cierre',
    'Meta Mensaje Cierre MS',
    [4160, 260],
    `={{ JSON.stringify({ recipient: { id: ${msRecipient("$('Code - Procesar IA').first().json")} }, messaging_type: "RESPONSE", message: { text: String($('Code - Procesar IA').first().json.mensaje_cierre || "").slice(0, 2000) } }) }}`,
  );

  const ifVisita = {
    id: 'ms-if-visita',
    name: 'IF Solicitud Visita MS',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2400, 520],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'visita-ms',
            leftValue: "={{ $('Code - Procesar IA').first().json.solicitud_visita }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2 },
      },
    },
  };

  const emailVisita = {
    id: 'ms-email-visita',
    name: 'Email Solicitud Visita MS',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [2620, 520],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: `https://formsubmit.co/ajax/${NOTIFY_EMAIL}`,
      sendBody: true,
      specifyBody: 'json',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Accept', value: 'application/json' },
        ],
      },
      jsonBody:
        "={{ JSON.stringify({ name: 'Nodo Propiedades', email: 'bot@nodopropiedades.local', _subject: 'SOLICITUD VISITA MS - ' + $('Code - Procesar IA').first().json.lead_name, message: 'Visita Messenger.\\nNombre: ' + $('Code - Procesar IA').first().json.lead_name + '\\nPSID: ' + $('Code - Procesar IA').first().json.chat_id + '\\nZona: ' + $('Code - Procesar IA').first().json.zona + '\\nPresupuesto: ' + $('Code - Procesar IA').first().json.presupuesto + '\\nPropiedad: ' + $('Code - Procesar IA').first().json.visita_propiedad_id + '\\nNota: ' + $('Code - Procesar IA').first().json.visita_nota + '\\nMensaje: ' + $('Code - Procesar IA').first().json.mensaje }) }}",
    },
  };

  ensureNode(wf, 'ms-leer-stock', stockNode);
  ensureNode(wf, 'ms-prep-burbujas', prepBurbujas);
  ensureNode(wf, 'ms-if-burbujas', ifBurbujas);
  ensureNode(wf, 'ms-send-burbuja', metaBurbuja);
  ensureNode(wf, 'ms-if-ultima-burbuja', ifUltimaBurbuja);
  ensureNode(wf, 'ms-prep-fotos', prepFotos);
  ensureNode(wf, 'ms-if-fotos', ifFotos);
  ensureNode(wf, 'ms-send-caption', metaCaption);
  ensureNode(wf, 'ms-send-image', metaImg);
  ensureNode(wf, 'ms-if-ultima-foto', ifUltimaFoto);
  ensureNode(wf, 'ms-if-cierre', ifCierre);
  ensureNode(wf, 'ms-send-cierre', metaCierre);
  ensureNode(wf, 'ms-if-visita', ifVisita);
  ensureNode(wf, 'ms-email-visita', emailVisita);

  const ifTiene = wf.connections['IF - Tiene Mensaje']?.main?.[0] || [];
  if (!ifTiene.some((c) => c.node === 'Leer Stock Propiedades MS')) {
    ifTiene.push({ node: 'Leer Stock Propiedades MS', type: 'main', index: 0 });
  }
  wf.connections['IF - Tiene Mensaje'] = { main: [ifTiene] };

  wf.connections['HTTP Request - Enviar Messenger'] = {
    main: [[{ node: 'Preparar Burbujas MS', type: 'main', index: 0 }]],
  };
  wf.connections['Preparar Burbujas MS'] = {
    main: [[{ node: 'IF Tiene Burbujas MS', type: 'main', index: 0 }]],
  };
  wf.connections['IF Tiene Burbujas MS'] = {
    main: [
      [{ node: 'Meta Enviar Burbuja MS', type: 'main', index: 0 }],
      [{ node: 'Preparar Fotos MS', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Meta Enviar Burbuja MS'] = {
    main: [[{ node: 'IF Ultima Burbuja MS', type: 'main', index: 0 }]],
  };
  wf.connections['IF Ultima Burbuja MS'] = {
    main: [[{ node: 'Preparar Fotos MS', type: 'main', index: 0 }], []],
  };
  wf.connections['Preparar Fotos MS'] = {
    main: [[{ node: 'IF Tiene Fotos MS', type: 'main', index: 0 }]],
  };
  wf.connections['IF Tiene Fotos MS'] = {
    main: [
      [{ node: 'Meta Enviar Caption MS', type: 'main', index: 0 }],
      [{ node: 'IF Tiene Cierre MS', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Meta Enviar Caption MS'] = {
    main: [[{ node: 'Meta Enviar Imagen MS', type: 'main', index: 0 }]],
  };
  wf.connections['Meta Enviar Imagen MS'] = {
    main: [[{ node: 'IF Ultima Foto MS', type: 'main', index: 0 }]],
  };
  wf.connections['IF Ultima Foto MS'] = {
    main: [[{ node: 'IF Tiene Cierre MS', type: 'main', index: 0 }], []],
  };
  wf.connections['IF Tiene Cierre MS'] = {
    main: [
      [{ node: 'Meta Mensaje Cierre MS', type: 'main', index: 0 }],
      [{ node: 'Respond - Enviado OK', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Meta Mensaje Cierre MS'] = {
    main: [[{ node: 'Respond - Enviado OK', type: 'main', index: 0 }]],
  };

  const procOut = wf.connections['Code - Procesar IA']?.main?.[0] || [];
  if (!procOut.some((c) => c.node === 'IF Solicitud Visita MS')) {
    procOut.push({ node: 'IF Solicitud Visita MS', type: 'main', index: 0 });
  }
  wf.connections['Code - Procesar IA'] = { main: [procOut] };
  wf.connections['IF Solicitud Visita MS'] = {
    main: [[{ node: 'Email Solicitud Visita MS', type: 'main', index: 0 }], []],
  };
}

function patchWorkflow(wf) {
  patchNormalizer(wf);
  patchBuscarLead(wf);
  patchPrompts(wf);
  patchSheetsUpdate(wf);
  patchOutboundAndAsesor(wf);
  return wf;
}

function putSettings(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: s.executionOrder || 'v1',
      ...(s.saveManualExecutions != null
        ? { saveManualExecutions: s.saveManualExecutions }
        : {}),
      ...(s.callerPolicy ? { callerPolicy: s.callerPolicy } : {}),
    },
  };
}

function loadApiKey() {
  try {
    const mcp = JSON.parse(
      fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'),
    );
    for (const s of Object.values(mcp.mcpServers || {})) {
      if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
    }
  } catch (_) {}
  return process.env.N8N_API_KEY || '';
}

function request(method, urlPath, body, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
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

async function deployToN8n(wf) {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.log('  SKIP deploy: sin N8N_API_KEY');
    return false;
  }
  try {
    let remote = await request('GET', `/api/v1/workflows/${WF_ID}`, null, apiKey);
    const patched = patchWorkflow(remote);
    await request('PUT', `/api/v1/workflows/${WF_ID}`, putSettings(patched), apiKey);
    await request('POST', `/api/v1/workflows/${WF_ID}/deactivate`, null, apiKey);
    await request('POST', `/api/v1/workflows/${WF_ID}/activate`, null, apiKey);
    return true;
  } catch (e) {
    console.log('  SKIP deploy:', e.message);
    return false;
  }
}

async function main() {
  console.log('→ Parche Messenger Matías (SIMPLE-03)');
  const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  patchWorkflow(wf);
  fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('  OK workflow JSON:', WF_PATH);

  if (DEPLOY) {
    const ok = await deployToN8n(wf);
    if (ok) console.log('  OK deploy n8n workflow', WF_ID);
  } else {
    console.log('  Tip: node scripts/patch-messenger-matias.js --deploy');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
