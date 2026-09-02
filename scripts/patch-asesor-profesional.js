/**
 * Entrena Bot Telegram + SIMPLE-02 como asesor profesional:
 * - Prompt Matías (serio, humano, contexto, fotos, visitas)
 * - Envío de fotos post-mensaje (Telegram)
 * - Email al dueño en solicitud de visita
 *
 * Uso: node scripts/patch-asesor-profesional.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const MEDIA_PATH = path.join(ROOT, 'data', 'propiedad-media.json');
const LEARNING_PATH = path.join(ROOT, 'data', 'bot-aprendizaje.json');
const NOTIFY_EMAIL =
  process.env.NOTIFY_EMAIL || 'adrianfredes12@gmail.com';

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
  throw new Error('Sin N8N_API_KEY en mcp.json');
}

const KEY = loadApiKey();
const PROP_MEDIA = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
const BOT_APRENDIZAJE = JSON.parse(fs.readFileSync(LEARNING_PATH, 'utf8'));

function snippet(name) {
  let code = fs.readFileSync(
    path.join(__dirname, 'snippets', name),
    'utf8',
  );
  code = code.replace(
    /__PROP_MEDIA_JSON__/g,
    JSON.stringify(PROP_MEDIA),
  );
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

function promptSnippet(name) {
  return (
    fs.readFileSync(path.join(__dirname, 'snippets', 'humanize-voz.js'), 'utf8') +
    '\n' +
    intentClassifierSnippet() +
    '\n' +
    learningSnippet() +
    '\n' +
    snippet(name)
  );
}

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
            reject(new Error(data.slice(0, 400)));
            return;
          }
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `${res.statusCode} ${JSON.stringify(json).slice(0, 600)}`,
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

function ensureNode(wf, id, node) {
  const idx = wf.nodes.findIndex((n) => n.id === id || n.name === node.name);
  if (idx >= 0) {
    wf.nodes[idx] = { ...wf.nodes[idx], ...node };
    return false;
  }
  wf.nodes.push(node);
  return true;
}

function patchTelegram(wf) {
  const construir = wf.nodes.find((n) => n.name === 'Construir Prompt');
  const parsear = wf.nodes.find((n) => n.name === 'Parsear Respuesta');
  if (!construir || !parsear) throw new Error('Nodos TG faltantes');

  construir.parameters.jsCode = promptSnippet('tg-construir-prompt.js');
  parsear.parameters.jsCode = postProcessSnippet('tg-parsear-respuesta.js');

  const groq = wf.nodes.find((n) => n.name === 'HTTP Groq');
  if (groq?.parameters?.jsonBody) {
    groq.parameters.jsonBody = groq.parameters.jsonBody.replace(
      /temperature:\s*0\.\d+/,
      'temperature: 0.4',
    );
  }

  const prepFotos = {
    id: 'tg-prep-fotos',
    name: 'Preparar Fotos Propiedad',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2240, 480],
    parameters: { jsCode: snippet('tg-preparar-fotos.js') },
  };
  const ifFotos = {
    id: 'tg-if-fotos',
    name: 'IF Tiene Fotos',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2460, 480],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-photo',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'notEquals',
            },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  const tgFoto = {
    id: 'tg-send-photo',
    name: 'Telegram Enviar Foto',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [2680, 480],
    onError: 'continueRegularOutput',
    credentials: wf.nodes.find((n) => n.name === 'Telegram Responder')
      ?.credentials,
    parameters: {
      resource: 'message',
      operation: 'sendPhoto',
      chatId: '={{ $json.chat_id }}',
      file: '={{ $json.photo_url }}',
      additionalFields: {
        caption: '={{ $json.caption }}',
        parse_mode: '={{ $json.parse_mode || "HTML" }}',
        appendAttribution: false,
      },
    },
  };

  const ifVisita = {
    id: 'tg-if-visita',
    name: 'IF Solicitud Visita',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2260, 600],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'visita',
            leftValue: "={{ $('Parsear Respuesta').first().json.solicitud_visita }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2 },
      },
    },
  };

  const emailVisita = {
    id: 'tg-email-visita',
    name: 'Email Solicitud Visita',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [2500, 600],
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
        "={{ JSON.stringify({ name: 'Nodo Propiedades', email: 'bot@nodopropiedades.local', _subject: 'SOLICITUD VISITA - ' + $('Parsear Respuesta').first().json.nombre, message: 'El cliente quiere coordinar visita.\\nNombre: ' + $('Parsear Respuesta').first().json.nombre + '\\nChat: ' + $('Parsear Respuesta').first().json.chat_id + '\\nZona: ' + $('Parsear Respuesta').first().json.zona + '\\nPresupuesto: ' + $('Parsear Respuesta').first().json.presupuesto + '\\nPropiedad: ' + $('Parsear Respuesta').first().json.visita_propiedad_id + '\\nNota: ' + $('Parsear Respuesta').first().json.visita_nota + '\\nMensaje: ' + $('Parsear Respuesta').first().json.texto_usuario }) }}",
    },
  };

  const ifUltimaFoto = {
    id: 'tg-if-ultima-foto',
    name: 'IF Ultima Foto',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2900, 400],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'ultima',
            leftValue:
              "={{ $('Preparar Fotos Propiedad').item.json.is_last_photo }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const ifCierre = {
    id: 'tg-if-cierre',
    name: 'IF Tiene Cierre',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3120, 400],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-cierre',
            leftValue: "={{ String($('Parsear Respuesta').first().json.mensaje_cierre || '').trim() }}",
            rightValue: '',
            operator: { type: 'string', operation: 'notEquals' },
          },
        ],
        options: { version: 2 },
      },
    },
  };

  const tgCierre = {
    id: 'tg-send-cierre',
    name: 'Telegram Mensaje Cierre',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [3340, 400],
    credentials: wf.nodes.find((n) => n.name === 'Telegram Responder')
      ?.credentials,
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: "={{ $('Parsear Respuesta').first().json.chat_id }}",
      text: "={{ $('Parsear Respuesta').first().json.mensaje_cierre }}",
      additionalFields: { appendAttribution: false },
    },
  };

  const prepBurbujas = {
    id: 'tg-prep-burbujas',
    name: 'Preparar Burbujas Extra',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2240, 360],
    parameters: { jsCode: snippet('tg-preparar-burbujas.js') },
  };

  const ifBurbujas = {
    id: 'tg-if-burbujas',
    name: 'IF Tiene Burbujas',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2460, 360],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-burbuja',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const tgBurbuja = {
    id: 'tg-send-burbuja',
    name: 'Telegram Enviar Burbuja',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [2680, 320],
    credentials: wf.nodes.find((n) => n.name === 'Telegram Responder')
      ?.credentials,
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: '={{ $json.chat_id }}',
      text: '={{ $json.text }}',
      additionalFields: { appendAttribution: false },
    },
  };

  const ifUltimaBurbuja = {
    id: 'tg-if-ultima-burbuja',
    name: 'IF Ultima Burbuja',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2900, 320],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'ultima-burbuja',
            leftValue:
              "={{ $('Preparar Burbujas Extra').item.json.is_last_burbuja }}",
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const ifSkipReply = {
    id: 'tg-if-debe-responder',
    name: 'IF Debe Responder TG',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1900, 304],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'not-skip',
            leftValue: '={{ Boolean($json.skip_reply) }}',
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'notEquals',
            },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const ifLlamarIa = {
    id: 'tg-if-llamar-ia',
    name: 'IF Llamar IA TG',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1020, 304],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'call-ia',
            leftValue: '={{ Boolean($json.skip_reply) }}',
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'notEquals',
            },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };

  const stubGroq = {
    id: 'tg-stub-groq-skip',
    name: 'Stub Groq Skip',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1120, 480],
    parameters: {
      jsCode:
        "return [{ json: { choices: [{ message: { content: '' } }], skip_reply: true } }];",
    },
  };

  ensureNode(wf, 'tg-if-ultima-foto', ifUltimaFoto);
  ensureNode(wf, 'tg-if-cierre', ifCierre);
  ensureNode(wf, 'tg-send-cierre', tgCierre);

  ensureNode(wf, 'tg-prep-burbujas', prepBurbujas);
  ensureNode(wf, 'tg-if-burbujas', ifBurbujas);
  ensureNode(wf, 'tg-send-burbuja', tgBurbuja);
  ensureNode(wf, 'tg-if-ultima-burbuja', ifUltimaBurbuja);

  ensureNode(wf, 'tg-prep-fotos', prepFotos);
  ensureNode(wf, 'tg-if-fotos', ifFotos);
  ensureNode(wf, 'tg-send-photo', tgFoto);
  ensureNode(wf, 'tg-if-visita', ifVisita);
  ensureNode(wf, 'tg-email-visita', emailVisita);
  ensureNode(wf, 'tg-if-debe-responder', ifSkipReply);
  ensureNode(wf, 'tg-if-llamar-ia', ifLlamarIa);
  ensureNode(wf, 'tg-stub-groq-skip', stubGroq);

  // Construir → IF Llamar IA → Groq|Stub → Parsear
  wf.connections['Construir Prompt'] = {
    main: [[{ node: 'IF Llamar IA TG', type: 'main', index: 0 }]],
  };
  wf.connections['IF Llamar IA TG'] = {
    main: [
      [{ node: 'HTTP Groq', type: 'main', index: 0 }],
      [{ node: 'Stub Groq Skip', type: 'main', index: 0 }],
    ],
  };
  wf.connections['HTTP Groq'] = {
    main: [[{ node: 'Parsear Respuesta', type: 'main', index: 0 }]],
  };
  wf.connections['Stub Groq Skip'] = {
    main: [[{ node: 'Parsear Respuesta', type: 'main', index: 0 }]],
  };

  // Parsear → IF Debe Responder → Telegram (si no skip_reply)
  const parseOut = (wf.connections['Parsear Respuesta']?.main?.[0] || []).filter(
    (c) => c.node !== 'Telegram Responder' && c.node !== 'IF Debe Responder TG',
  );
  parseOut.unshift({ node: 'IF Debe Responder TG', type: 'main', index: 0 });
  if (!parseOut.some((c) => c.node === 'IF Solicitud Visita')) {
    parseOut.push({ node: 'IF Solicitud Visita', type: 'main', index: 0 });
  }
  wf.connections['Parsear Respuesta'] = { main: [parseOut] };
  wf.connections['IF Debe Responder TG'] = {
    main: [[{ node: 'Telegram Responder', type: 'main', index: 0 }], []],
  };

  wf.connections['Telegram Responder'] = {
    main: [[{ node: 'Preparar Burbujas Extra', type: 'main', index: 0 }]],
  };
  wf.connections['Preparar Burbujas Extra'] = {
    main: [[{ node: 'IF Tiene Burbujas', type: 'main', index: 0 }]],
  };
  wf.connections['IF Tiene Burbujas'] = {
    main: [
      [{ node: 'Telegram Enviar Burbuja', type: 'main', index: 0 }],
      [{ node: 'Preparar Fotos Propiedad', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Telegram Enviar Burbuja'] = {
    main: [[{ node: 'IF Ultima Burbuja', type: 'main', index: 0 }]],
  };
  wf.connections['IF Ultima Burbuja'] = {
    main: [[{ node: 'Preparar Fotos Propiedad', type: 'main', index: 0 }], []],
  };
  wf.connections['Preparar Fotos Propiedad'] = {
    main: [[{ node: 'IF Tiene Fotos', type: 'main', index: 0 }]],
  };
  wf.connections['IF Tiene Fotos'] = {
    main: [
      [{ node: 'Telegram Enviar Foto', type: 'main', index: 0 }],
      [{ node: 'IF Tiene Cierre', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Telegram Enviar Foto'] = {
    main: [[{ node: 'IF Ultima Foto', type: 'main', index: 0 }]],
  };
  wf.connections['IF Ultima Foto'] = {
    main: [[{ node: 'IF Tiene Cierre', type: 'main', index: 0 }], []],
  };
  wf.connections['IF Tiene Cierre'] = {
    main: [[{ node: 'Telegram Mensaje Cierre', type: 'main', index: 0 }], []],
  };

  wf.connections['IF Solicitud Visita'] = {
    main: [[{ node: 'Email Solicitud Visita', type: 'main', index: 0 }], []],
  };

  return wf;
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

function waSnippet(name, extra = {}) {
  let code = promptSnippet(name);
  code = code.replace(/__CITA_WEBHOOK_BASE__/g, citaWebhookBase());
  for (const [k, v] of Object.entries(extra)) {
    code = code.replace(new RegExp(k, 'g'), v);
  }
  return code;
}

function patchWhatsApp(wf) {
  const armar = wf.nodes.find((n) => n.name === 'Code - Armar Prompt');
  const procesar = wf.nodes.find((n) => n.name === 'Code - Procesar IA');
  const sendWa = wf.nodes.find((n) => n.name === 'HTTP Request - Enviar WhatsApp');
  const buscarLead = wf.nodes.find((n) => n.name === 'Google Sheets - Buscar Lead');
  if (!armar || !procesar || !sendWa) {
    throw new Error('Nodos WA faltantes (Armar/Procesar/Enviar)');
  }

  armar.parameters.jsCode = waSnippet('wa-armar-prompt.js');
  procesar.parameters.jsCode = postProcessSnippet('wa-procesar-ia.js');

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

  const wahaKey =
    sendWa.parameters?.headerParameters?.parameters?.find(
      (p) => p.name === 'X-Api-Key',
    )?.value || '__SET_WAHA_API_KEY__';

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

  const wahaImg = {
    id: 'wa-send-image',
    name: 'WAHA Enviar Imagen',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [3280, 300],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://host.docker.internal:3002/api/sendImage',
      sendBody: true,
      specifyBody: 'json',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'X-Api-Key', value: wahaKey },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      jsonBody:
        '={{ JSON.stringify({ session: "nodo", chatId: String($json.chat_id), caption: String($json.caption || ""), file: { mimetype: "image/jpeg", url: String($json.photo_url) } }) }}',
    },
  };

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

  const waBurbuja = {
    id: 'wa-send-burbuja',
    name: 'WAHA Enviar Burbuja',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [3280, 140],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://host.docker.internal:3002/api/sendText',
      sendBody: true,
      specifyBody: 'json',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'X-Api-Key', value: wahaKey },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      jsonBody:
        '={{ JSON.stringify({ session: "nodo", chatId: String($json.chat_id), text: String($json.text || "") }) }}',
    },
  };

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
            leftValue:
              "={{ $('Preparar Burbujas WA').item.json.is_last_burbuja }}",
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
            leftValue:
              "={{ $('Preparar Fotos WA').item.json.is_last_photo }}",
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

  const waCierre = {
    id: 'wa-send-cierre',
    name: 'WAHA Mensaje Cierre',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [3940, 260],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://host.docker.internal:3002/api/sendText',
      sendBody: true,
      specifyBody: 'json',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'X-Api-Key', value: wahaKey },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      jsonBody:
        '={{ JSON.stringify({ session: "nodo", chatId: String($(\'Code - Procesar IA\').first().json.chat_id), text: String($(\'Code - Procesar IA\').first().json.mensaje_cierre || "") }) }}',
    },
  };

  ensureNode(wf, 'wa-leer-stock', stockNode);
  ensureNode(wf, 'wa-prep-burbujas', prepBurbujas);
  ensureNode(wf, 'wa-if-burbujas', ifBurbujas);
  ensureNode(wf, 'wa-send-burbuja', waBurbuja);
  ensureNode(wf, 'wa-if-ultima-burbuja', ifUltimaBurbuja);
  ensureNode(wf, 'wa-prep-fotos', prepFotos);
  ensureNode(wf, 'wa-if-fotos', ifFotos);
  ensureNode(wf, 'wa-send-image', wahaImg);
  ensureNode(wf, 'wa-if-ultima-foto', ifUltimaFoto);
  ensureNode(wf, 'wa-if-cierre', ifCierre);
  ensureNode(wf, 'wa-send-cierre', waCierre);
  ensureNode(wf, 'wa-if-visita', ifVisita);
  ensureNode(wf, 'wa-email-visita', emailVisita);

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
      [{ node: 'WAHA Enviar Burbuja', type: 'main', index: 0 }],
      [{ node: 'Preparar Fotos WA', type: 'main', index: 0 }],
    ],
  };
  wf.connections['WAHA Enviar Burbuja'] = {
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
      [{ node: 'WAHA Enviar Imagen', type: 'main', index: 0 }],
      [{ node: 'IF Tiene Cierre WA', type: 'main', index: 0 }],
    ],
  };
  wf.connections['WAHA Enviar Imagen'] = {
    main: [[{ node: 'IF Ultima Foto WA', type: 'main', index: 0 }]],
  };
  wf.connections['IF Ultima Foto WA'] = {
    main: [[{ node: 'IF Tiene Cierre WA', type: 'main', index: 0 }], []],
  };
  wf.connections['IF Tiene Cierre WA'] = {
    main: [[{ node: 'WAHA Mensaje Cierre', type: 'main', index: 0 }], []],
  };

  const procOut = wf.connections['Code - Procesar IA']?.main?.[0] || [];
  if (!procOut.some((c) => c.node === 'IF Solicitud Visita WA')) {
    procOut.push({ node: 'IF Solicitud Visita WA', type: 'main', index: 0 });
  }
  wf.connections['Code - Procesar IA'] = { main: [procOut] };
  wf.connections['IF Solicitud Visita WA'] = {
    main: [[{ node: 'Email Solicitud Visita WA', type: 'main', index: 0 }], []],
  };

  return wf;
}

async function main() {
  console.log('→ Bot Telegram');
  let tg = await request('GET', '/api/v1/workflows/8JoSfkcn3pE1f0av');
  tg = patchTelegram(tg);
  await request('PUT', `/api/v1/workflows/${tg.id}`, putSettings(tg));
  await request('POST', `/api/v1/workflows/${tg.id}/deactivate`);
  await request('POST', `/api/v1/workflows/${tg.id}/activate`);
  console.log('  OK TG');

  console.log('→ SIMPLE-02 WhatsApp (stock + fotos + email visita)');
  let wa = await request('GET', '/api/v1/workflows/npq6sC6YLaUBpHac');
  patchWhatsApp(wa);
  await request('PUT', `/api/v1/workflows/${wa.id}`, putSettings(wa));
  await request('POST', `/api/v1/workflows/${wa.id}/deactivate`);
  await request('POST', `/api/v1/workflows/${wa.id}/activate`);
  console.log('  OK WA');

  console.log('Listo. Fotos:', Object.keys(PROP_MEDIA).length, 'propiedades');
  console.log('WhatsApp: corré node scripts/patch-meta-whatsapp.js --deploy para Meta Cloud API.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
