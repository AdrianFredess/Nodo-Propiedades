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

function leadTemperaturaSnippet() {
  return fs.readFileSync(
    path.join(__dirname, 'snippets', 'lead-temperatura.js'),
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
    leadTemperaturaSnippet() +
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
    leadTemperaturaSnippet() +
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

function patchWaTemperaturaSheets(wf) {
  const upd = wf.nodes.find((n) => n.name === 'Google Sheets - Actualizar Temperatura');
  if (upd?.parameters?.columns?.value) {
    const v = upd.parameters.columns.value;
    v.temperature = '={{ $json.temperatura }}';
    v.estado_seguimiento = "={{ $json.estado_seguimiento || 'ninguno' }}";
    v.bot_paused = "={{ $json.bot_paused || 'no' }}";
    v.handoff = "={{ $json.handoff || 'no' }}";
    v.senales_json = '={{ $json.senales_json || \"{}\" }}';
  }

  const email = wf.nodes.find((n) => n.name === 'HTTP - Email Lead Caliente');
  if (email?.parameters) {
    email.parameters.jsonBody =
      "={{ JSON.stringify({ name: 'Nodo Propiedades Bot', email: 'bot@nodopropiedades.local', _subject: 'URGENTE LEAD CALIENTE WhatsApp - ' + $('Code - Procesar IA').item.json.lead_name, message: 'URGENTE LEAD CALIENTE WhatsApp\\nNombre: ' + $('Code - Procesar IA').item.json.lead_name + '\\nTel: ' + $('Code - Procesar IA').item.json.phone + '\\nChat: ' + $('Code - Procesar IA').item.json.chat_id + '\\n--- Señales ---\\n' + String($('Code - Procesar IA').item.json.notif_resumen || '') + '\\nÚltimo mensaje: ' + $('Code - Procesar IA').item.json.mensaje }) }}";
  }
  const tgAlert = wf.nodes.find((n) => n.name === 'HTTP - Telegram Alerta Owner');
  if (tgAlert?.parameters) {
    tgAlert.parameters.jsonBody =
      "={{ JSON.stringify({ chat_id: '__SET_OWNER_TELEGRAM_CHAT_ID__', text: 'URGENTE LEAD CALIENTE WhatsApp\\nNombre: ' + $('Code - Procesar IA').item.json.lead_name + '\\nTel: ' + $('Code - Procesar IA').item.json.phone + '\\n' + String($('Code - Procesar IA').item.json.notif_resumen || '') }) }}";
  }
}

function patchSnippetsTg(wf) {
  const construir = wf.nodes.find((n) => n.name === 'Construir Prompt');
  const parsear = wf.nodes.find((n) => n.name === 'Parsear Respuesta');
  if (!construir || !parsear) throw new Error('Nodos TG Construir/Parsear faltantes');
  construir.parameters.jsCode = promptSnippet('tg-construir-prompt.js');
  parsear.parameters.jsCode = postProcessSnippet('tg-parsear-respuesta.js');
}

/**
 * Parche 2: cablea envío de fichas TG (texto → fotos → cierre).
 * Sin esto, propiedades_mostrar se calcula pero nunca se manda.
 */
function wireTgFichasDelivery(wf) {
  const tgCred = wf.nodes.find((n) => n.name === 'Telegram Responder')?.credentials;
  if (!tgCred) throw new Error('Telegram Responder sin credentials');

  const prepFotos = {
    id: 'tg-prep-fotos',
    name: 'Preparar Fotos Propiedad',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2240, 304],
    parameters: { jsCode: snippet('tg-preparar-fotos.js') },
  };
  const ifFotos = {
    id: 'tg-if-fotos',
    name: 'IF Tiene Fotos',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2460, 304],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-photo',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
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
    position: [2680, 280],
    onError: 'continueRegularOutput',
    credentials: tgCred,
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
  const ifUltimaFoto = {
    id: 'tg-if-ultima-foto',
    name: 'IF Ultima Foto',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2900, 280],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'ultima',
            leftValue: '={{ Boolean($json.is_last_photo) }}',
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
    position: [3120, 304],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'has-cierre',
            leftValue:
              "={{ String($('Parsear Respuesta').first().json.mensaje_cierre || '').trim() }}",
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
    position: [3340, 280],
    onError: 'continueRegularOutput',
    credentials: tgCred,
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: "={{ $('Parsear Respuesta').first().json.chat_id }}",
      text: "={{ $('Parsear Respuesta').first().json.mensaje_cierre }}",
      additionalFields: { appendAttribution: false },
    },
  };

  ensureNode(wf, 'tg-prep-fotos', prepFotos);
  ensureNode(wf, 'tg-if-fotos', ifFotos);
  ensureNode(wf, 'tg-send-photo', tgFoto);
  ensureNode(wf, 'tg-if-ultima-foto', ifUltimaFoto);
  ensureNode(wf, 'tg-if-cierre', ifCierre);
  ensureNode(wf, 'tg-send-cierre', tgCierre);

  // Actualizar jsCode de prep fotos siempre
  const prepNode = wf.nodes.find((n) => n.name === 'Preparar Fotos Propiedad');
  if (prepNode) prepNode.parameters.jsCode = snippet('tg-preparar-fotos.js');

  // Texto primero → luego fichas (fichas garantizadas por Parsear + PROP_MEDIA)
  wf.connections['Telegram Responder'] = {
    main: [[{ node: 'Preparar Fotos Propiedad', type: 'main', index: 0 }]],
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

  // No enviar si skip_reply (bot pausado / handoff)
  const ifDebe = {
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
            id: 'debe',
            leftValue: '={{ Boolean($json.skip_reply) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  ensureNode(wf, 'tg-if-debe-responder', ifDebe);

  const parseOut = wf.connections['Parsear Respuesta']?.main?.[0] || [];
  const filtered = parseOut.filter((c) => c.node !== 'Telegram Responder');
  if (!filtered.some((c) => c.node === 'IF Debe Responder TG')) {
    filtered.unshift({ node: 'IF Debe Responder TG', type: 'main', index: 0 });
  }
  wf.connections['Parsear Respuesta'] = { main: [filtered] };
  wf.connections['IF Debe Responder TG'] = {
    main: [[{ node: 'Telegram Responder', type: 'main', index: 0 }], []],
  };

  // Reintento Groq tras 429 (silencio) + rescate fichas legacy
  const waitRl = {
    id: 'tg-wait-rate-limit',
    name: 'Wait Reenvio Rate Limit',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1.1,
    position: [2240, 520],
    webhookId: 'tg-wait-rl-' + Date.now().toString(36),
    parameters: {
      resume: 'timeInterval',
      amount: '={{ Math.max(5, Number($json.wait_retry_sec) || 45) }}',
      unit: 'seconds',
    },
  };
  const codeRl = {
    id: 'tg-code-reenvio-rl',
    name: 'Preparar Reenvio Rate Limit',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2460, 520],
    parameters: { jsCode: snippet('tg-reenvio-rate-limit.js') },
  };
  const restoreRetry = {
    id: 'tg-restore-retry-groq',
    name: 'Restore Retry Groq',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2460, 360],
    parameters: { jsCode: snippet('tg-restore-retry-groq.js') },
  };
  const ifRetryGroq = {
    id: 'tg-if-retry-groq',
    name: 'IF Retry Groq',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2032, 400],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'rg',
            leftValue: '={{ Boolean($json.retry_groq) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  const ifRl = {
    id: 'tg-if-reenvio-rl',
    name: 'IF Reenvio Rate Limit',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2680, 520],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'rl',
            leftValue: '={{ $json.skip }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  const ifRlFichas = {
    id: 'tg-if-reenvio-fichas',
    name: 'IF Reenvio Son Fichas',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2900, 520],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'modo',
            leftValue: '={{ $json.modo }}',
            rightValue: 'fichas',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        options: { version: 2 },
      },
    },
  };
  const tgRlTxt = {
    id: 'tg-send-reenvio-txt',
    name: 'Telegram Reenvio Texto RL',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [3120, 600],
    onError: 'continueRegularOutput',
    credentials: tgCred,
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: '={{ $json.chat_id }}',
      text: '={{ $json.texto }}',
      additionalFields: { appendAttribution: false },
    },
  };
  const codeRlFotos = {
    id: 'tg-code-reenvio-fotos',
    name: 'Override Fotos Reenvio RL',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [3120, 480],
    parameters: {
      jsCode:
        "const j=$input.first().json||{}; const ids=j.photo_ids||[]; const chat=String(j.chat_id||''); const PROP_MEDIA=__PROP_MEDIA_JSON__; const out=[]; for (const id of ids.slice(0,3)) { const m=PROP_MEDIA[id]; if(!m||!m.fotos||!m.fotos.length) continue; out.push({json:{chat_id:chat,photo_url:m.fotos[0],caption:String(m.caption||m.titulo||id).slice(0,900),parse_mode:'HTML',propiedad_id:id}}); } if(!out.length) return [{json:{skip:true}}]; out[out.length-1].json.is_last_photo=true; return out;",
    },
  };
  const ifNotifyOwnerRl = {
    id: 'tg-if-notify-owner-rl',
    name: 'IF Notify Owner Groq',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2032, 640],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'no',
            leftValue: '={{ Boolean($json.notify_owner_groq) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  const existingOwner = wf.nodes.find((n) => n.name === 'Telegram Alerta Owner');
  const tgOwnerRl = {
    id: 'tg-alert-owner-rl',
    name: 'Telegram Alerta Owner RL',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: existingOwner?.typeVersion || 4.4,
    position: [2240, 640],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url:
        (existingOwner?.parameters && existingOwner.parameters.url) ||
        'https://api.telegram.org/bot__SET_TELEGRAM_BOT_TOKEN__/sendMessage',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ chat_id: '__SET_OWNER_TELEGRAM_CHAT_ID__', text: '⚠️ Groq sin tokens / fallo duro\\nChat: ' + String($json.chat_id || '') + '\\nCliente: ' + String($json.nombre || $json.nombre_usuario || '') + '\\nMsg: ' + String($json.texto_usuario || '').slice(0,200) + '\\nRevisá el chat o subí TPM (Developer).' }) }}",
      options: {},
    },
  };

  ensureNode(wf, 'tg-wait-rate-limit', waitRl);
  ensureNode(wf, 'tg-code-reenvio-rl', codeRl);
  ensureNode(wf, 'tg-restore-retry-groq', restoreRetry);
  ensureNode(wf, 'tg-if-retry-groq', ifRetryGroq);
  ensureNode(wf, 'tg-if-reenvio-rl', ifRl);
  ensureNode(wf, 'tg-if-reenvio-fichas', ifRlFichas);
  ensureNode(wf, 'tg-send-reenvio-txt', tgRlTxt);
  ensureNode(wf, 'tg-code-reenvio-fotos', codeRlFotos);
  ensureNode(wf, 'tg-if-notify-owner-rl', ifNotifyOwnerRl);
  ensureNode(wf, 'tg-alert-owner-rl', tgOwnerRl);
  const overrideNode = wf.nodes.find((n) => n.name === 'Override Fotos Reenvio RL');
  if (overrideNode) {
    overrideNode.parameters.jsCode = snippet('tg-reenvio-fotos-override.js');
  }
  const restoreNode = wf.nodes.find((n) => n.name === 'Restore Retry Groq');
  if (restoreNode?.parameters) {
    restoreNode.parameters.jsCode = snippet('tg-restore-retry-groq.js');
  }
  const waitNode = wf.nodes.find((n) => n.name === 'Wait Reenvio Rate Limit');
  if (waitNode?.parameters) {
    waitNode.parameters.amount =
      '={{ Math.max(5, Number($json.wait_retry_sec) || 45) }}';
    waitNode.parameters.unit = 'seconds';
    waitNode.parameters.resume = 'timeInterval';
  }

  const ifRlTrigger = {
    id: 'tg-if-programar-rl',
    name: 'IF Programar Reenvio RL',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2032, 520],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'prog',
            leftValue: '={{ Boolean($json.reenvio_rate_limit) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  ensureNode(wf, 'tg-if-programar-rl', ifRlTrigger);

  const po2 = wf.connections['Parsear Respuesta']?.main?.[0] || [];
  if (!po2.some((c) => c.node === 'IF Retry Groq')) {
    po2.push({ node: 'IF Retry Groq', type: 'main', index: 0 });
  }
  if (!po2.some((c) => c.node === 'IF Programar Reenvio RL')) {
    po2.push({ node: 'IF Programar Reenvio RL', type: 'main', index: 0 });
  }
  if (!po2.some((c) => c.node === 'IF Notify Owner Groq')) {
    po2.push({ node: 'IF Notify Owner Groq', type: 'main', index: 0 });
  }
  wf.connections['Parsear Respuesta'] = { main: [po2] };

  wf.connections['IF Retry Groq'] = {
    main: [[{ node: 'Wait Reenvio Rate Limit', type: 'main', index: 0 }], []],
  };
  // Wait bifurca: si venía de retry_groq → Restore → HTTP Groq; si reenvio fichas → Preparar
  // Simplificación: Wait siempre va a un router Code
  const routeAfterWait = {
    id: 'tg-route-after-wait-rl',
    name: 'Route After Wait RL',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2350, 440],
    parameters: {
      jsCode: `const j = $input.first().json || {};
let parsed = {};
try { parsed = $('Parsear Respuesta').first().json || {}; } catch (e) { parsed = j; }
if (parsed.retry_groq || j.retry_groq) {
  let prompt = {};
  try { prompt = $('Construir Prompt').first().json || {}; } catch (e2) { prompt = {}; }
  return [{ json: { ...prompt, es_retry_groq: true, retry_groq: true, wait_retry_sec: Number(parsed.wait_retry_sec || j.wait_retry_sec) || 45, _route: 'retry_groq', messages: prompt.messages || [] } }];
}
return [{ json: { ...parsed, ...j, _route: 'reenvio' } }];`,
    },
  };
  const ifRouteRetry = {
    id: 'tg-if-route-retry',
    name: 'IF Route Retry Groq',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2550, 440],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'rt',
            leftValue: '={{ $json._route }}',
            rightValue: 'retry_groq',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        options: { version: 2 },
      },
    },
  };
  ensureNode(wf, 'tg-route-after-wait-rl', routeAfterWait);
  ensureNode(wf, 'tg-if-route-retry', ifRouteRetry);

  wf.connections['IF Programar Reenvio RL'] = {
    main: [[{ node: 'Wait Reenvio Rate Limit', type: 'main', index: 0 }], []],
  };
  wf.connections['Wait Reenvio Rate Limit'] = {
    main: [[{ node: 'Route After Wait RL', type: 'main', index: 0 }]],
  };
  wf.connections['Route After Wait RL'] = {
    main: [[{ node: 'IF Route Retry Groq', type: 'main', index: 0 }]],
  };
  wf.connections['IF Route Retry Groq'] = {
    main: [
      [{ node: 'HTTP Groq', type: 'main', index: 0 }],
      [{ node: 'Preparar Reenvio Rate Limit', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Preparar Reenvio Rate Limit'] = {
    main: [[{ node: 'IF Reenvio Rate Limit', type: 'main', index: 0 }]],
  };
  wf.connections['IF Reenvio Rate Limit'] = {
    main: [[{ node: 'IF Reenvio Son Fichas', type: 'main', index: 0 }], []],
  };
  wf.connections['IF Reenvio Son Fichas'] = {
    main: [
      [{ node: 'Override Fotos Reenvio RL', type: 'main', index: 0 }],
      [{ node: 'Telegram Reenvio Texto RL', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Override Fotos Reenvio RL'] = {
    main: [[{ node: 'Telegram Enviar Foto', type: 'main', index: 0 }]],
  };
  wf.connections['IF Notify Owner Groq'] = {
    main: [[{ node: 'Telegram Alerta Owner RL', type: 'main', index: 0 }], []],
  };
}

function refreshConversacionesRevisionSnippet(wf, canal) {
  const name =
    canal === 'whatsapp'
      ? 'Code - Preparar Registro Revision WA'
      : 'Code - Preparar Registro Revision TG';
  const node = wf.nodes.find((n) => n.name === name);
  if (!node?.parameters) return;
  const raw = fs.readFileSync(
    path.join(__dirname, 'snippets', 'conversaciones-revision-prepare-row.js'),
    'utf8',
  );
  node.parameters.jsCode = raw.replace(/__CANAL__/g, canal);
}

/** Emite advisor.action al instante cuando hay rate limit / handoff / ficha pendiente. */
function wireAdvisorActionEmit(wf) {
  const emitChat = wf.nodes.find((n) => n.name === 'Emit Panel Realtime');
  if (emitChat?.parameters) {
    emitChat.parameters.jsonBody =
      "={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String(($('Parsear Respuesta').first().json.chat_id || $('Set Variables').first().json.chat_id || '')), mensajeCliente: String(($('Set Variables').first().json.texto_usuario || '')), respuestaBot: String(($('Parsear Respuesta').first().json.respuesta_bot || '')), nombre: String(($('Parsear Respuesta').first().json.nombre || $('Set Variables').first().json.nombre_usuario || '')), temperatura: String(($('Parsear Respuesta').first().json.temperatura || '')), presupuesto: String(($('Parsear Respuesta').first().json.presupuesto || '')), historial_json: String(($('Parsear Respuesta').first().json.historial_json || '[]')), status: 'abierto', source: 'telegram', botPaused: String(($('Parsear Respuesta').first().json.bot_paused || 'no')) === 'si', handoff: String(($('Parsear Respuesta').first().json.handoff || 'no')) === 'si', rateLimit: Boolean($('Parsear Respuesta').first().json.rate_limit), needsAdvisor: Boolean($('Parsear Respuesta').first().json.needs_advisor_action), propiedadesMostrar: String(($('Parsear Respuesta').first().json.propiedades_mostrar || '[]')), citaLink: String(($('Parsear Respuesta').first().json.cita_link || '')), solicitudVisita: Boolean($('Parsear Respuesta').first().json.solicitud_visita) } }) }}";
  }

  const emitAdv = {
    id: 'emit-advisor-action',
    name: 'Emit Advisor Action',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [2032, 720],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://127.0.0.1:3099/emit',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ type: 'advisor.action', payload: { chatId: String($json.chat_id || ''), leadId: 'telegram:' + String($json.chat_id || ''), nombre: String($json.nombre || $json.nombre_usuario || 'Cliente'), source: 'telegram', kind: $json.rate_limit ? ($json.reenvio_tipo === 'link' ? 'link' : ($json.reenvio_tipo === 'fichas' || String($json.propiedades_mostrar || '[]') !== '[]' ? 'fichas' : 'rate_limit')) : ($json.solicitud_visita || String($json.bot_paused || '') === 'si' ? (String($json.cita_link || '') ? 'link' : 'handoff') : 'handoff'), propIds: (function(){ try { return JSON.parse($json.reenvio_ids || $json.propiedades_mostrar || '[]'); } catch(e) { return []; } })(), link: String($json.reenvio_link || $json.cita_link || ''), rateLimit: Boolean($json.rate_limit), botPaused: String($json.bot_paused || '') === 'si', handoff: String($json.handoff || '') === 'si', needsAdvisor: true, detail: $json.rate_limit ? 'Sin tokens — reenviá ficha/link al cliente' : 'Bot pausado — tomá el chat' } }) }}",
    },
  };
  const ifAdv = {
    id: 'tg-if-advisor-action',
    name: 'IF Advisor Action',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1792, 720],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'need',
            leftValue: '={{ Boolean($json.needs_advisor_action) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  ensureNode(wf, 'tg-if-advisor-action', ifAdv);
  ensureNode(wf, 'emit-advisor-action', emitAdv);

  const parseOut = wf.connections['Parsear Respuesta']?.main?.[0] || [];
  if (!parseOut.some((c) => c.node === 'IF Advisor Action')) {
    parseOut.push({ node: 'IF Advisor Action', type: 'main', index: 0 });
  }
  wf.connections['Parsear Respuesta'] = { main: [parseOut] };
  wf.connections['IF Advisor Action'] = {
    main: [[{ node: 'Emit Advisor Action', type: 'main', index: 0 }], []],
  };
}

function patchTgTemperaturaSheets(wf) {
  const sync = wf.nodes.find((n) => n.name === 'Sync Leads_Bot');
  if (sync?.parameters?.columns?.value) {
    const v = sync.parameters.columns.value;
    v.temperature = "={{ $('Parsear Respuesta').first().json.temperatura }}";
    v.estado_seguimiento =
      "={{ $('Parsear Respuesta').first().json.estado_seguimiento || 'ninguno' }}";
    v.bot_paused = "={{ $('Parsear Respuesta').first().json.bot_paused || 'no' }}";
    v.handoff = "={{ $('Parsear Respuesta').first().json.handoff || 'no' }}";
    v.senales_json =
      "={{ $('Parsear Respuesta').first().json.senales_json || '{}' }}";
  }

  const hist = wf.nodes.find((n) => n.name === 'Actualizar Historial');
  if (hist?.parameters?.columns?.value) {
    hist.parameters.columns.value.bot_paused =
      '={{ $json.bot_paused || \"no\" }}';
    hist.parameters.columns.value.temperatura = '={{ $json.temperatura }}';
  }

  // Notificar caliente siempre (no solo si lead_completo)
  const parseOut = wf.connections['Parsear Respuesta']?.main?.[0] || [];
  if (!parseOut.some((c) => c.node === 'IF Temperatura Caliente')) {
    parseOut.push({ node: 'IF Temperatura Caliente', type: 'main', index: 0 });
  }
  wf.connections['Parsear Respuesta'] = { main: [parseOut] };

  // Quitar IF caliente del branch de lead completo (evitar doble o bloqueo)
  const leadOut = wf.connections['IF Lead Completo']?.main?.[0];
  if (Array.isArray(leadOut)) {
    wf.connections['IF Lead Completo'].main[0] = leadOut.filter(
      (c) => c.node !== 'IF Temperatura Caliente',
    );
  }

  const email = wf.nodes.find((n) => n.name === 'Email Lead Caliente');
  if (email?.parameters) {
    email.parameters.jsonBody =
      "={{ JSON.stringify({ name: 'Nodo Propiedades Bot', email: 'bot@nodopropiedades.local', _subject: 'URGENTE LEAD CALIENTE Telegram - ' + $('Parsear Respuesta').first().json.nombre, message: 'URGENTE LEAD CALIENTE Telegram\\nNombre: ' + $('Parsear Respuesta').first().json.nombre + '\\nChat: ' + $('Parsear Respuesta').first().json.chat_id + '\\n--- Señales ---\\n' + String($('Parsear Respuesta').first().json.notif_resumen || '') + '\\nZona: ' + $('Parsear Respuesta').first().json.zona + '\\nPresupuesto: ' + $('Parsear Respuesta').first().json.presupuesto }) }}";
  }
  const tgAlert = wf.nodes.find((n) => n.name === 'Telegram Alerta Owner');
  if (tgAlert?.parameters) {
    tgAlert.parameters.jsonBody =
      "={{ JSON.stringify({ chat_id: '__SET_OWNER_TELEGRAM_CHAT_ID__', text: 'URGENTE LEAD CALIENTE Telegram\\nNombre: ' + $('Parsear Respuesta').first().json.nombre + '\\nChat: ' + $('Parsear Respuesta').first().json.chat_id + '\\n' + String($('Parsear Respuesta').first().json.notif_resumen || '') }) }}";
  }
}

function setGroqMaxTokens(wf) {
  for (const node of wf.nodes || []) {
    if (node.name === 'Groq Chat Model' && node.parameters) {
      if (!node.parameters.options) node.parameters.options = {};
      node.parameters.options.maxTokens = 1200;
      node.onError = 'continueRegularOutput';
      node.retryOnFail = true;
      node.maxTries = 2;
      node.waitBetweenTries = 3000;
    }
    const body = node.parameters && node.parameters.jsonBody;
    if (typeof body === 'string' && /max_tokens:\s*\d+/.test(body) && /gpt-oss/.test(body)) {
      node.parameters.jsonBody = body.replace(/max_tokens:\s*\d+/, 'max_tokens: 1200');
    }
    // Anti-visto: rate-limit / error Groq no debe matar el workflow
    if (
      node.name === 'HTTP Groq' ||
      (node.name && /Groq/i.test(node.name) && node.type === 'n8n-nodes-base.httpRequest')
    ) {
      node.onError = 'continueRegularOutput';
      // Cola justa maneja el spacing; no quemar TPM con retry a 3s
      node.retryOnFail = false;
      node.maxTries = 1;
      if (!node.parameters) node.parameters = {};
      if (!node.parameters.options) node.parameters.options = {};
      if (!node.parameters.options.response) node.parameters.options.response = {};
      if (!node.parameters.options.response.response) {
        node.parameters.options.response.response = {};
      }
      node.parameters.options.response.response.neverError = true;
      if (!node.parameters.options.response.response.responseFormat) {
        node.parameters.options.response.response.responseFormat = 'json';
      }
    }
  }
}

function patchWa(wf) {
  patchSnippetsWa(wf);
  patchWaTemperaturaSheets(wf);
  setGroqMaxTokens(wf);
  refreshConversacionesRevisionSnippet(wf, 'whatsapp');
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
  patchTgTemperaturaSheets(wf);
  setGroqMaxTokens(wf);
  wireTgFichasDelivery(wf);
  refreshConversacionesRevisionSnippet(wf, 'telegram');
  wireAdvisorActionEmit(wf);

  // Si skip_reply (handoff), no llamar Groq
  const ifLlamar = {
    id: 'tg-if-llamar-ia',
    name: 'IF Llamar IA TG',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1000, 304],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'call',
            leftValue: '={{ Boolean($json.skip_reply) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'notEquals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  const stub = {
    id: 'tg-stub-groq-skip',
    name: 'Stub Groq Skip',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1120, 480],
    parameters: {
      jsCode:
        "const p=$input.first().json||{}; return [{ json: { choices: [{ message: { content: '' } }], skip_reply: true, ...p } }];",
    },
  };
  const colaTokens = {
    id: 'tg-cola-tokens-groq',
    name: 'Cola Tokens Groq',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1120, 304],
    parameters: { jsCode: snippet('tg-cola-tokens-groq.js') },
  };
  const ifWaitCola = {
    id: 'tg-if-wait-cola',
    name: 'IF Wait Cola Tokens',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1280, 304],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'w',
            leftValue: '={{ Number($json.wait_cola_sec) || 0 }}',
            rightValue: 0,
            operator: { type: 'number', operation: 'gt' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
  const waitCola = {
    id: 'tg-wait-cola-tokens',
    name: 'Wait Cola Tokens',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1.1,
    position: [1460, 240],
    webhookId: 'tg-wait-cola-' + Date.now().toString(36),
    parameters: {
      resume: 'timeInterval',
      amount: '={{ Math.max(1, Number($json.wait_cola_sec) || 1) }}',
      unit: 'seconds',
    },
  };
  ensureNode(wf, 'tg-if-llamar-ia', ifLlamar);
  ensureNode(wf, 'tg-stub-groq-skip', stub);
  ensureNode(wf, 'tg-cola-tokens-groq', colaTokens);
  ensureNode(wf, 'tg-if-wait-cola', ifWaitCola);
  ensureNode(wf, 'tg-wait-cola-tokens', waitCola);
  // Refresh snippets on existing nodes
  const colaNode = wf.nodes.find((n) => n.name === 'Cola Tokens Groq');
  if (colaNode?.parameters) colaNode.parameters.jsCode = snippet('tg-cola-tokens-groq.js');

  wf.connections['Construir Prompt'] = {
    main: [[{ node: 'IF Llamar IA TG', type: 'main', index: 0 }]],
  };
  wf.connections['IF Llamar IA TG'] = {
    main: [
      [{ node: 'Cola Tokens Groq', type: 'main', index: 0 }],
      [{ node: 'Stub Groq Skip', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Cola Tokens Groq'] = {
    main: [[{ node: 'IF Wait Cola Tokens', type: 'main', index: 0 }]],
  };
  wf.connections['IF Wait Cola Tokens'] = {
    main: [
      [{ node: 'Wait Cola Tokens', type: 'main', index: 0 }],
      [{ node: 'HTTP Groq', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Wait Cola Tokens'] = {
    main: [[{ node: 'HTTP Groq', type: 'main', index: 0 }]],
  };
  wf.connections['Stub Groq Skip'] = {
    main: [[{ node: 'Parsear Respuesta', type: 'main', index: 0 }]],
  };

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
  const wasActive = Boolean(remote.active);
  const patcher = meta.kind === 'wa' ? patchWa : patchTg;
  const patched = substituteEnv(patcher(remote));
  await request('PUT', `/api/v1/workflows/${meta.id}`, putSettings(patched), apiKey);
  // Evitar deactivate+activate en cada deploy: Telegram setWebhook falla a veces (Unauthorized)
  // y deja el bot caído. El PUT ya actualiza los Code nodes para la próxima ejecución.
  if (!wasActive) {
    try {
      await request('POST', `/api/v1/workflows/${meta.id}/activate`, null, apiKey);
    } catch (e) {
      console.log('    WARN activate', meta.label + ':', e.message);
    }
  }
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
