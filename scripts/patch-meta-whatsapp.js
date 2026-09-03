/**
 * Migra SIMPLE-02 de WAHA a Meta WhatsApp Cloud API + prompts Matías (Casa Clic).
 *
 * Uso:
 *   node scripts/patch-meta-whatsapp.js           # actualiza workflows/SIMPLE-02 WhatsApp Bot.json
 *   node scripts/patch-meta-whatsapp.js --deploy  # también sube a n8n local si está activo
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const WF_PATH = path.join(ROOT, 'workflows', 'SIMPLE-02 WhatsApp Bot.json');
const MEDIA_PATH = path.join(ROOT, 'data', 'propiedad-media.json');
const LEARNING_PATH = path.join(ROOT, 'data', 'bot-aprendizaje.json');
const WF_ID = 'npq6sC6YLaUBpHac';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'adrianfredes12@gmail.com';
const DEPLOY = process.argv.includes('--deploy');
const SUBSCRIBE_WABA = process.argv.includes('--subscribe-waba') || DEPLOY;

const META_MSG_URL =
  'https://graph.facebook.com/__SET_META_GRAPH_VERSION__/__SET_META_PHONE_NUMBER_ID__/messages';
const META_AUTH = 'Bearer __SET_META_ACCESS_TOKEN__';

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

function waSnippet(name) {
  let code =
    fs.readFileSync(path.join(__dirname, 'snippets', 'humanize-voz.js'), 'utf8') +
    '\n' +
    intentClassifierSnippet() +
    '\n' +
    learningSnippet() +
    '\n' +
    snippet(name);
  return code.replace(/__CITA_WEBHOOK_BASE__/g, citaWebhookBase());
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

function metaToExpr(jsonPath) {
  // Meta dev allowlist (AR) suele registrar sin el 9 móvil; inbound viene como 549...
  return `(function(p){p=String(p||"").replace(/\\D/g,"");if(/^549\\d{8,11}$/.test(p))return "54"+p.slice(3);return p;})(${jsonPath}.phone || ${jsonPath}.chat_id || "")`;
}

function patchMetaWebhooks(wf) {
  const postWh = wf.nodes.find((n) => n.name === 'Webhook WhatsApp');
  if (!postWh) throw new Error('Webhook WhatsApp no encontrado');
  postWh.parameters.path = 'meta-whatsapp';
  postWh.parameters.httpMethod = 'POST';
  postWh.parameters.responseMode = 'onReceived';
  postWh.webhookId = 's02-meta-whatsapp-webhook';

  ensureNode(wf, 's02-meta-verify', {
    id: 's02-meta-verify',
    name: 'Webhook WhatsApp Verify',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [200, 500],
    webhookId: 's02-meta-whatsapp-verify',
    parameters: {
      httpMethod: 'GET',
      path: 'meta-whatsapp',
      responseMode: 'responseNode',
      options: { responseNode: 'Respond - Verify Meta' },
    },
  });

  ensureNode(wf, 's02-meta-verify-resp', {
    id: 's02-meta-verify-resp',
    name: 'Respond - Verify Meta',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    position: [420, 500],
    parameters: {
      respondWith: 'text',
      responseBody: "={{ $json.query['hub.challenge'] }}",
      options: { responseCode: 200 },
    },
  });

  wf.connections['Webhook WhatsApp Verify'] = {
    main: [[{ node: 'Respond - Verify Meta', type: 'main', index: 0 }]],
  };
}

function patchNormalizer(wf) {
  const norm = wf.nodes.find((n) => n.name === 'Code - Normalizar WhatsApp');
  if (!norm) throw new Error('Code - Normalizar WhatsApp no encontrado');
  norm.parameters.jsCode = snippet('wa-normalizar-meta.js');
}

function patchAudioTranscription(wf) {
  ensureNode(wf, 'wa-transcribir-audio', {
    id: 'wa-transcribir-audio',
    name: 'Transcribir Audio WA',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [520, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: snippet('wa-transcribir-audio.js'),
    },
  });

  const ifMsg = wf.nodes.find((n) => n.name === 'IF - Tiene Mensaje');
  if (ifMsg && ifMsg.parameters && ifMsg.parameters.conditions) {
    ifMsg.parameters.conditions = {
      options: {
        caseSensitive: true,
        leftValue: '',
        typeValidation: 'loose',
      },
      combinator: 'or',
      conditions: [
        {
          id: 'has-text',
          leftValue: "={{ $json.mensaje || '' }}",
          rightValue: '',
          operator: {
            type: 'string',
            operation: 'notEmpty',
            singleValue: true,
          },
        },
        {
          id: 'has-audio-fail',
          leftValue: '={{ $json.es_audio_sin_transcripcion }}',
          rightValue: true,
          operator: {
            type: 'boolean',
            operation: 'true',
            singleValue: true,
          },
        },
      ],
    };
  }

  wf.connections['Code - Normalizar WhatsApp'] = {
    main: [[{ node: 'Transcribir Audio WA', type: 'main', index: 0 }]],
  };
  wf.connections['Transcribir Audio WA'] = {
    main: [[{ node: 'IF - Tiene Mensaje', type: 'main', index: 0 }]],
  };
}

function patchPrompts(wf) {
  const armar = wf.nodes.find((n) => n.name === 'Code - Armar Prompt');
  const procesar = wf.nodes.find((n) => n.name === 'Code - Procesar IA');
  if (!armar || !procesar) throw new Error('Nodos Armar/Procesar faltantes');
  armar.parameters.jsCode = waSnippet('wa-armar-prompt.js');
  procesar.parameters.jsCode = postProcessSnippet('wa-procesar-ia.js');
}

function patchLeadFlow(wf) {
  wf.connections['Google Sheets - Buscar Lead'] = {
    main: [[{ node: 'IF - Lead Existe', type: 'main', index: 0 }]],
  };
  // Merge v3 passThrough rompe en n8n actual; Armar Prompt lee stock vía $('Leer Stock...').
  const armar = { node: 'Code - Armar Prompt', type: 'main', index: 0 };
  wf.connections['Google Sheets - Actualizar Lead'] = { main: [[armar]] };
  wf.connections['Google Sheets - Crear Lead'] = { main: [[armar]] };
  if (wf.connections.Merge) delete wf.connections.Merge;
  wf.nodes = wf.nodes.filter((n) => n.name !== 'Merge');
}

function applySheetIds(wf) {
  const sheetId = loadEnvValue(
    'GOOGLE_SHEET_ID',
    '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ',
  );
  if (!sheetId) return;
  for (const node of wf.nodes) {
    if (node.type !== 'n8n-nodes-base.googleSheets') continue;
    const doc = node.parameters?.documentId;
    if (!doc) continue;
    if (
      doc.value === '__SET_GOOGLE_SHEET_ID__' ||
      String(doc.value || '').includes('SET_GOOGLE_SHEET')
    ) {
      doc.value = sheetId;
    }
  }
}

function patchOutboundMeta(wf) {
  const sendWa = wf.nodes.find((n) => n.name === 'HTTP Request - Enviar WhatsApp');
  if (!sendWa) throw new Error('HTTP Request - Enviar WhatsApp no encontrado');

  const procRef = "$('Code - Procesar IA').first().json";
  sendWa.parameters = {
    method: 'POST',
    url: META_MSG_URL,
    sendBody: true,
    specifyBody: 'json',
    sendHeaders: true,
    headerParameters: metaHeaders(),
    jsonBody: `={{ JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: ${metaToExpr(procRef)}, type: "text", text: { preview_url: false, body: String(${procRef}.respuesta_wa || "") } }) }}`,
    options: {},
  };
  sendWa.onError = 'continueRegularOutput';
}

function metaSendNode(id, name, position, jsonBodyExpr) {
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

function patchAsesorNodes(wf) {
  const buscarLead = wf.nodes.find((n) => n.name === 'Google Sheets - Buscar Lead');
  const sheetsCred = buscarLead?.credentials || {
    googleSheetsOAuth2Api: {
      id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__',
      name: 'Cuenta de Google Sheets',
    },
  };

  const stockNode = {
    id: 'wa-leer-stock',
    name: 'Leer Stock Propiedades WA',
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

  const prepFotos = {
    id: 'wa-prep-fotos',
    name: 'Preparar Fotos WA',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2840, 300],
    parameters: { jsCode: snippet('wa-preparar-fotos.js') },
  };

  const ifFotos = {
    id: 'wa-if-fotos',
    name: 'IF Tiene Fotos WA',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3060, 300],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-photo-wa',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const metaImg = metaSendNode(
    'wa-send-image',
    'Meta Enviar Imagen',
    [3280, 300],
    `={{ JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: ${metaToExpr('$json')}, type: "image", image: { link: String($json.photo_url || ""), caption: String($json.caption || "").slice(0, 1000) } }) }}`,
  );

  const prepBurbujas = {
    id: 'wa-prep-burbujas',
    name: 'Preparar Burbujas WA',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2840, 180],
    parameters: { jsCode: snippet('wa-preparar-burbujas.js') },
  };

  const ifBurbujas = {
    id: 'wa-if-burbujas',
    name: 'IF Tiene Burbujas WA',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3060, 180],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-burbuja-wa',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const metaBurbuja = metaSendNode(
    'wa-send-burbuja',
    'Meta Enviar Burbuja',
    [3280, 140],
    `={{ JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: ${metaToExpr('$json')}, type: "text", text: { preview_url: false, body: String($json.text || "") } }) }}`,
  );

  const ifUltimaBurbuja = {
    id: 'wa-if-ultima-burbuja',
    name: 'IF Ultima Burbuja WA',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3500, 140],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'ultima-burbuja-wa',
            leftValue: "={{ $('Preparar Burbujas WA').item.json.is_last_burbuja }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const ifUltimaFoto = {
    id: 'wa-if-ultima-foto',
    name: 'IF Ultima Foto WA',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3500, 300],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'ultima-foto-wa',
            leftValue: "={{ $('Preparar Fotos WA').item.json.is_last_photo }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const ifCierre = {
    id: 'wa-if-cierre',
    name: 'IF Tiene Cierre WA',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3720, 260],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-cierre-wa',
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

  const metaCierre = metaSendNode(
    'wa-send-cierre',
    'Meta Mensaje Cierre',
    [3940, 260],
    `={{ JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: ${metaToExpr("$('Code - Procesar IA').first().json")}, type: "text", text: { preview_url: false, body: String($('Code - Procesar IA').first().json.mensaje_cierre || "") } }) }}`,
  );

  const ifVisita = {
    id: 'wa-if-visita',
    name: 'IF Solicitud Visita WA',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2400, 520],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'visita-wa',
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
    id: 'wa-email-visita',
    name: 'Email Solicitud Visita WA',
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
        "={{ JSON.stringify({ name: 'Nodo Propiedades', email: 'bot@nodopropiedades.local', _subject: 'SOLICITUD VISITA WA - ' + $('Code - Procesar IA').first().json.lead_name, message: 'Visita WhatsApp.\\nNombre: ' + $('Code - Procesar IA').first().json.lead_name + '\\nChat: ' + $('Code - Procesar IA').first().json.chat_id + '\\nTel: ' + $('Code - Procesar IA').first().json.phone + '\\nZona: ' + $('Code - Procesar IA').first().json.zona + '\\nPresupuesto: ' + $('Code - Procesar IA').first().json.presupuesto + '\\nPropiedad: ' + $('Code - Procesar IA').first().json.visita_propiedad_id + '\\nNota: ' + $('Code - Procesar IA').first().json.visita_nota + '\\nMensaje: ' + $('Code - Procesar IA').first().json.mensaje }) }}",
    },
  };

  ensureNode(wf, 'wa-leer-stock', stockNode);
  ensureNode(wf, 'wa-prep-burbujas', prepBurbujas);
  ensureNode(wf, 'wa-if-burbujas', ifBurbujas);
  ensureNode(wf, 'wa-send-burbuja', metaBurbuja);
  ensureNode(wf, 'wa-if-ultima-burbuja', ifUltimaBurbuja);
  ensureNode(wf, 'wa-prep-fotos', prepFotos);
  ensureNode(wf, 'wa-if-fotos', ifFotos);
  ensureNode(wf, 'wa-send-image', metaImg);
  ensureNode(wf, 'wa-if-ultima-foto', ifUltimaFoto);
  ensureNode(wf, 'wa-if-cierre', ifCierre);
  ensureNode(wf, 'wa-send-cierre', metaCierre);
  ensureNode(wf, 'wa-if-visita', ifVisita);
  ensureNode(wf, 'wa-email-visita', emailVisita);

  // Remove legacy WAHA nodes if present
  wf.nodes = wf.nodes.filter(
    (n) =>
      !['WAHA Enviar Imagen', 'WAHA Enviar Burbuja', 'WAHA Mensaje Cierre'].includes(
        n.name,
      ),
  );

  const ifTiene = wf.connections['IF - Tiene Mensaje']?.main?.[0] || [];
  if (!ifTiene.some((c) => c.node === 'Leer Stock Propiedades WA')) {
    ifTiene.push({ node: 'Leer Stock Propiedades WA', type: 'main', index: 0 });
  }
  wf.connections['IF - Tiene Mensaje'] = { main: [ifTiene] };

  wf.connections['HTTP Request - Enviar WhatsApp'] = {
    main: [[{ node: 'Preparar Burbujas WA', type: 'main', index: 0 }]],
  };
  wf.connections['Preparar Burbujas WA'] = {
    main: [[{ node: 'IF Tiene Burbujas WA', type: 'main', index: 0 }]],
  };
  wf.connections['IF Tiene Burbujas WA'] = {
    main: [
      [{ node: 'Meta Enviar Burbuja', type: 'main', index: 0 }],
      [{ node: 'Preparar Fotos WA', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Meta Enviar Burbuja'] = {
    main: [[{ node: 'IF Ultima Burbuja WA', type: 'main', index: 0 }]],
  };
  wf.connections['IF Ultima Burbuja WA'] = {
    main: [[{ node: 'Preparar Fotos WA', type: 'main', index: 0 }], []],
  };
  wf.connections['Preparar Fotos WA'] = {
    main: [[{ node: 'IF Tiene Fotos WA', type: 'main', index: 0 }]],
  };
  wf.connections['IF Tiene Fotos WA'] = {
    main: [
      [{ node: 'Meta Enviar Imagen', type: 'main', index: 0 }],
      [{ node: 'IF Tiene Cierre WA', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Meta Enviar Imagen'] = {
    main: [[{ node: 'IF Ultima Foto WA', type: 'main', index: 0 }]],
  };
  wf.connections['IF Ultima Foto WA'] = {
    main: [[{ node: 'IF Tiene Cierre WA', type: 'main', index: 0 }], []],
  };
  wf.connections['IF Tiene Cierre WA'] = {
    main: [[{ node: 'Meta Mensaje Cierre', type: 'main', index: 0 }], []],
  };

  const procOut = wf.connections['Code - Procesar IA']?.main?.[0] || [];
  if (!procOut.some((c) => c.node === 'IF Solicitud Visita WA')) {
    procOut.push({ node: 'IF Solicitud Visita WA', type: 'main', index: 0 });
  }
  wf.connections['Code - Procesar IA'] = { main: [procOut] };
  wf.connections['IF Solicitud Visita WA'] = {
    main: [[{ node: 'Email Solicitud Visita WA', type: 'main', index: 0 }], []],
  };
}

function patchWorkflow(wf) {
  patchMetaWebhooks(wf);
  patchNormalizer(wf);
  patchAudioTranscription(wf);
  applySheetIds(wf);
  patchLeadFlow(wf);
  patchPrompts(wf);
  patchOutboundMeta(wf);
  patchAsesorNodes(wf);
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
      ...(s.timezone ? { timezone: s.timezone } : {}),
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

function substituteMetaEnv(wf) {
  const vars = {
    __SET_META_GRAPH_VERSION__: loadEnvValue('META_GRAPH_VERSION', 'v21.0'),
    __SET_META_PHONE_NUMBER_ID__: loadEnvValue('META_PHONE_NUMBER_ID', ''),
    __SET_META_ACCESS_TOKEN__: loadEnvValue('META_ACCESS_TOKEN', ''),
    __SET_META_VERIFY_TOKEN__: loadEnvValue('META_VERIFY_TOKEN', 'nodo2026'),
    __SET_GROQ_API_KEY__: loadEnvValue('GROQ_API_KEY', ''),
    __SET_GOOGLE_SHEET_ID__: loadEnvValue(
      'GOOGLE_SHEET_ID',
      '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ',
    ),
  };
  let raw = JSON.stringify(wf);
  for (const [k, v] of Object.entries(vars)) {
    if (v) raw = raw.split(k).join(v);
  }
  return JSON.parse(raw);
}

async function subscribeWabaMessages() {
  const token = loadEnvValue('META_ACCESS_TOKEN', '');
  const wabaId = loadEnvValue('META_WABA_ID', '');
  const graphVersion = loadEnvValue('META_GRAPH_VERSION', 'v21.0');
  if (!token || !wabaId) {
    console.log('  SKIP subscribe WABA: falta META_ACCESS_TOKEN o META_WABA_ID');
    return false;
  }
  const url = new URL(
    `https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`,
  );
  url.searchParams.set('subscribed_fields', 'messages');
  url.searchParams.set('access_token', token);
  return new Promise((resolve) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'POST' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400 || !json.success) {
            console.log('  WARN subscribe WABA:', data.slice(0, 300));
            resolve(false);
            return;
          }
          console.log('  OK WABA suscripta a messages (app Nodo Propiedades)');
          resolve(true);
        } catch {
          console.log('  WARN subscribe WABA parse:', data.slice(0, 300));
          resolve(false);
        }
      });
    });
    req.on('error', (e) => {
      console.log('  WARN subscribe WABA:', e.message);
      resolve(false);
    });
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
    const patched = substituteMetaEnv(patchWorkflow(remote));
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
  console.log('→ Parche Meta WhatsApp (SIMPLE-02)');
  const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  patchWorkflow(wf);
  fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('  OK workflow JSON:', WF_PATH);

  if (SUBSCRIBE_WABA) {
    await subscribeWabaMessages();
  }

  if (DEPLOY) {
    const ok = await deployToN8n(wf);
    if (ok) console.log('  OK deploy n8n workflow', WF_ID);
  } else {
    console.log(
      '  Tip: node scripts/patch-meta-whatsapp.js --deploy [--subscribe-waba] cuando n8n esté activo',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
