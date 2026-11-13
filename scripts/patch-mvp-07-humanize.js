#!/usr/bin/env node
'use strict';

/**
 * Fase 7 — humanize, CÓMO ESCRIBÍS, typing, /start, partir respuesta.
 * Uso: node scripts/patch-mvp-07-humanize.js [--deploy]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, loadEnv, apiKey, request } = require('./lib/n8n-http-helper');

const BOT_PATH = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');
const BAK_DIR = path.join(ROOT, 'docs', 'ops', `backup-workflows-${new Date().toISOString().slice(0, 10)}`);
const PROD = '8JoSfkcn3pE1f0av';
const SNIP_PARSE = path.join(ROOT, 'scripts', 'snippets', 'tg-parsear-respuesta.js');
const SNIP_PROMPT = path.join(ROOT, 'scripts', 'snippets', 'tg-construir-prompt.js');

const COMO_ESCRIBIS = `
CÓMO ESCRIBÍS
- Sos parte del equipo de {inmobiliaria_nombre}. No anunciás que sos un bot ni usás frases de bot.
- Si el cliente pregunta en serio si sos una persona o un bot, no mentís: decís que sos el asistente de la inmobiliaria y que, si prefiere, lo pasás con alguien del equipo.
- Respondé primero lo que preguntó. Si falta un dato, hacé UNA sola pregunta, la más útil.
- Terminá llevando la charla al paso siguiente (coordinar una visita, pedir zona o presupuesto) sin presionar.
- Escribí como en un chat: 1 a 3 frases cortas. Sin listas, títulos ni negritas.
- No saludes de nuevo si ya saludaste. No empieces todos los mensajes igual. Usá el nombre del cliente a veces, no siempre.
- Copiá el registro del cliente (vos, tú o usted). Emojis solo si el cliente los usa, y pocos.
- Si vas a mandar la respuesta y una pregunta, separalas con una línea en blanco.
`.trim();

function loadHumanizeSrc() {
  let src = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'humanize-reply.js'), 'utf8');
  src = src.replace(/^'use strict';\s*/m, '');
  src = src.replace(/module\.exports[\s\S]*$/, '');
  return src.trim();
}

function loadSplitSrc() {
  let src = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'split-reply.js'), 'utf8');
  src = src.replace(/^'use strict';\s*/m, '');
  src = src.replace(/module\.exports[\s\S]*$/, '');
  return src.trim();
}

function ensureHumanizeInCode(code) {
  if (!code.includes('function humanizeReply')) {
    code = '/* mvp-07-humanize */\n' + loadHumanizeSrc() + '\n' + code;
  }
  if (!code.includes('humanizeReply(respuestaBot')) {
    code = code.replace(
      /respuesta_bot:\s*respuestaBot\s*\|\|\s*\(propiedadesMostrar\.length \? 'Mira estas' : 'Buenas, en que te ayudo\?'\)/,
      "respuesta_bot: humanizeReply(respuestaBot || (propiedadesMostrar.length ? 'Mira estas' : 'Buenas, en que te ayudo?'))",
    );
  }
  return code;
}

function ensureComoEscribis(code) {
  if (code.includes('Sos parte del equipo de')) return code;
  if (!code.includes("'FRASES PROHIBIDAS")) return code;
  const inj = `
  '\\n' +
  'CÓMO ESCRIBÍS\\n' +
  '- Sos parte del equipo de ' + ((typeof botConfig !== 'undefined' && botConfig && botConfig.inmobiliaria_nombre) ? String(botConfig.inmobiliaria_nombre) : 'la inmobiliaria') + '. No anunciás que sos un bot ni usás frases de bot.\\n' +
  '- Si el cliente pregunta en serio si sos una persona o un bot, no mentís: decís que sos el asistente de la inmobiliaria y que, si prefiere, lo pasás con alguien del equipo.\\n' +
  '- Respondé primero lo que preguntó. Si falta un dato, hacé UNA sola pregunta, la más útil.\\n' +
  '- Terminá llevando la charla al paso siguiente (coordinar una visita, pedir zona o presupuesto) sin presionar.\\n' +
  '- Escribí como en un chat: 1 a 3 frases cortas. Sin listas, títulos ni negritas.\\n' +
  '- No saludes de nuevo si ya saludaste. No empieces todos los mensajes igual. Usá el nombre del cliente a veces, no siempre.\\n' +
  '- Copiá el registro del cliente (vos, tú o usted). Emojis solo si el cliente los usa, y pocos.\\n' +
  '- Si vas a mandar la respuesta y una pregunta, separalas con una línea en blanco.\\n' +
  `;
  return code.replace("'FRASES PROHIBIDAS", inj + "'FRASES PROHIBIDAS");
}

function uid(prefix) {
  return prefix + '-' + crypto.randomBytes(4).toString('hex');
}

function ensureNode(wf, node) {
  const i = (wf.nodes || []).findIndex((n) => n.name === node.name);
  if (i >= 0) return false; // no pisar ids/webhookId (idempotencia)
  wf.nodes.push(node);
  return true;
}

function setConn(wf, from, toList, outputIndex) {
  if (!wf.connections[from]) wf.connections[from] = { main: [] };
  const main = wf.connections[from].main;
  while (main.length <= outputIndex) main.push([]);
  main[outputIndex] = toList.map((node) => ({ node, type: 'main', index: 0 }));
}

function patchWorkflow(wf) {
  // 1) humanize in Parsear Respuesta Base (+ Parsear Respuesta if present)
  for (const name of ['Parsear Respuesta Base', 'Parsear Respuesta']) {
    const n = (wf.nodes || []).find((x) => x.name === name);
    if (n?.parameters?.jsCode) n.parameters.jsCode = ensureHumanizeInCode(n.parameters.jsCode);
  }

  // 2) CÓMO ESCRIBÍS in Construir Prompt
  const construir = (wf.nodes || []).find((x) => x.name === 'Construir Prompt');
  if (construir?.parameters?.jsCode) {
    construir.parameters.jsCode = ensureComoEscribis(construir.parameters.jsCode);
  }

  const tgCred =
    (wf.nodes || []).find((n) => n.name === 'Telegram Responder')?.credentials || {
      telegramApi: { id: '__SET_TELEGRAM_CREDENTIAL_ID__', name: 'Telegram Bot Inmobiliaria' },
    };

  // 3) Mostrar escribiendo (antes de Groq)
  ensureNode(wf, {
    id: uid('typing'),
    name: 'Mostrar escribiendo',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [1100, 400],
    onError: 'continueRegularOutput',
    credentials: tgCred,
    parameters: {
      resource: 'chat',
      operation: 'sendChatAction',
      chatId: '={{ $json.chat_id || $("Set Variables").first().json.chat_id }}',
      action: 'typing',
    },
  });

  // Rewire: paths that went to HTTP Groq → Mostrar escribiendo → HTTP Groq
  for (const [from, conf] of Object.entries(wf.connections || {})) {
    if (from === 'Mostrar escribiendo') continue;
    const main = conf.main || [];
    for (let oi = 0; oi < main.length; oi++) {
      const arr = main[oi] || [];
      let changed = false;
      const next = arr.map((l) => {
        if (l.node === 'HTTP Groq') {
          changed = true;
          return { node: 'Mostrar escribiendo', type: 'main', index: 0 };
        }
        return l;
      });
      if (changed) main[oi] = next;
    }
  }
  setConn(wf, 'Mostrar escribiendo', ['HTTP Groq'], 0);

  // 4) /start fijo
  ensureNode(wf, {
    id: uid('if-start'),
    name: 'IF Es Start',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [420, 200],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'start',
            leftValue:
              "={{ String($json.texto_usuario || '').trim().split(/\\s+/)[0].toLowerCase() }}",
            rightValue: '/start',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  });

  ensureNode(wf, {
    id: uid('start-reply'),
    name: 'Respuesta Start Fija',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [640, 120],
    parameters: {
      jsCode: `
const j = $input.first().json || {};
const cfg = j.bot_config || {};
let nombre = 'la inmobiliaria';
try {
  const live = $('Leer Config Bot').first().json;
  if (live && live.inmobiliaria_nombre) nombre = String(live.inmobiliaria_nombre);
} catch (_) {
  if (cfg.inmobiliaria_nombre) nombre = String(cfg.inmobiliaria_nombre);
}
const texto = 'Hola! Soy Matías, de ' + nombre + '. Contame qué estás buscando: comprar o alquilar, en qué zona y más o menos con qué presupuesto.';
return [{ json: { ...j, respuesta_bot: texto, skip_reply: false, debe_responder: true, photo_ids: [], es_start: true, startTime: Date.now() } }];
`.trim(),
    },
  });

  // Set Variables → IF Es Start (una sola vez)
  const setOut = wf.connections['Set Variables'];
  const setTargets = (setOut?.main?.[0] || []).map((l) => l.node);
  if (!setTargets.includes('IF Es Start')) {
    setConn(wf, 'Set Variables', ['IF Es Start'], 0);
    setConn(wf, 'IF Es Start', ['Respuesta Start Fija'], 0);
    if (setTargets.length) setConn(wf, 'IF Es Start', setTargets, 1);
  }

  // 5) Partir respuesta
  ensureNode(wf, {
    id: uid('partir'),
    name: 'Partir Respuesta',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1500, 300],
    parameters: {
      jsCode: `
${loadSplitSrc()}
const j = $input.first().json || {};
const full = String(j.respuesta_bot || '').trim();
const photos = Array.isArray(j.photo_ids) ? j.photo_ids : [];
let mandarEnPartes = true;
try {
  const cfg = $('Leer Config Bot').first().json || {};
  if (cfg.mandar_en_partes === false) mandarEnPartes = false;
} catch (_) {}
if (j.mandar_en_partes === false) mandarEnPartes = false;

const noSplit = !mandarEnPartes || photos.length > 0 || j.es_start;
const parts = noSplit ? (full ? [full] : []) : splitReplyParts(full);
const use = parts.length ? parts : full ? [full] : ['Buenas'];
return use.map((texto_parte, idx) => ({
  json: {
    chat_id: j.chat_id,
    texto_parte,
    respuesta_bot: full,
    pausa_ms: idx === 0 ? 0 : pausaMsForPart(texto_parte),
    is_last_parte: idx === use.length - 1,
    photo_ids: idx === use.length - 1 ? photos : [],
    startTime: j.startTime || Date.now(),
    parte_idx: idx,
  },
}));
`.trim(),
    },
  });

  ensureNode(wf, {
    id: uid('loop'),
    name: 'Loop Partes Respuesta',
    type: 'n8n-nodes-base.splitInBatches',
    typeVersion: 3,
    position: [1720, 300],
    parameters: { batchSize: 1, options: {} },
  });

  ensureNode(wf, {
    id: uid('wait-parte'),
    name: 'Wait Parte Respuesta',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1.1,
    position: [1940, 300],
    webhookId: uid('wait-wh'),
    parameters: {
      resume: 'timeInterval',
      amount: '={{ Math.max(0.05, Number($json.pausa_ms || 0) / 1000) }}',
      unit: 'seconds',
    },
  });

  ensureNode(wf, {
    id: uid('typing2'),
    name: 'Mostrar escribiendo parte',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [2160, 300],
    onError: 'continueRegularOutput',
    credentials: tgCred,
    parameters: {
      resource: 'chat',
      operation: 'sendChatAction',
      chatId: '={{ $json.chat_id }}',
      action: 'typing',
    },
  });

  // Telegram Responder: usar texto_parte del item
  const tg = (wf.nodes || []).find((n) => n.name === 'Telegram Responder');
  if (tg?.parameters) {
    tg.parameters.chatId = '={{ $json.chat_id }}';
    tg.parameters.text = '={{ $json.texto_parte || $json.respuesta_bot }}';
  }

  // IF Debe Responder → Partir (en vez de Telegram directo)
  setConn(wf, 'IF Debe Responder TG', ['Partir Respuesta'], 0);
  // Start fijo también parte
  setConn(wf, 'Respuesta Start Fija', ['Partir Respuesta'], 0);

  setConn(wf, 'Partir Respuesta', ['Loop Partes Respuesta'], 0);
  // splitInBatches: output 0 = each batch, output 1 = done
  setConn(wf, 'Loop Partes Respuesta', ['Wait Parte Respuesta'], 0);
  setConn(wf, 'Wait Parte Respuesta', ['Mostrar escribiendo parte'], 0);
  setConn(wf, 'Mostrar escribiendo parte', ['Telegram Responder'], 0);
  // after each telegram → back to loop
  setConn(wf, 'Telegram Responder', ['Loop Partes Respuesta'], 0);
  // when loop done → fotos (need IF from done output)
  // splitInBatches output index 1 = done — connect to Preparar Fotos with last context
  if (!wf.connections['Loop Partes Respuesta']) wf.connections['Loop Partes Respuesta'] = { main: [] };
  while (wf.connections['Loop Partes Respuesta'].main.length < 2) {
    wf.connections['Loop Partes Respuesta'].main.push([]);
  }
  wf.connections['Loop Partes Respuesta'].main[0] = [
    { node: 'Wait Parte Respuesta', type: 'main', index: 0 },
  ];
  wf.connections['Loop Partes Respuesta'].main[1] = [
    { node: 'Preparar Fotos Propiedad', type: 'main', index: 0 },
  ];

  return wf;
}

function syncSnippets() {
  if (fs.existsSync(SNIP_PARSE)) {
    let c = fs.readFileSync(SNIP_PARSE, 'utf8');
    c = ensureHumanizeInCode(c);
    fs.writeFileSync(SNIP_PARSE, c);
  }
  if (fs.existsSync(SNIP_PROMPT)) {
    let c = fs.readFileSync(SNIP_PROMPT, 'utf8');
    c = ensureComoEscribis(c);
    fs.writeFileSync(SNIP_PROMPT, c);
  }
}

async function deploy(wf) {
  const key = apiKey();
  const live = await request('GET', `/api/v1/workflows/${PROD}`, key);
  const was = !!live.json.active;
  if (was) await request('POST', `/api/v1/workflows/${PROD}/deactivate`, key);
  const put = await request('PUT', `/api/v1/workflows/${PROD}`, key, {
    name: live.json.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1' },
  });
  if (put.status >= 400) throw new Error(put.raw.slice(0, 500));
  if (was) await request('POST', `/api/v1/workflows/${PROD}/activate`, key);
}

async function main() {
  loadEnv();
  const args = new Set(process.argv.slice(2));
  fs.mkdirSync(BAK_DIR, { recursive: true });
  const raw = fs.readFileSync(BOT_PATH, 'utf8');
  fs.writeFileSync(path.join(BAK_DIR, 'Bot Telegram Inmobiliaria.json'), raw);

  syncSnippets();
  let wf = JSON.parse(raw);
  wf = patchWorkflow(wf);
  // second pass idempotent
  const before = JSON.stringify(wf);
  wf = patchWorkflow(wf);
  const after = JSON.stringify(wf);

  fs.writeFileSync(BOT_PATH, JSON.stringify(wf, null, 2) + '\n');

  const construir = (wf.nodes || []).find((n) => n.name === 'Construir Prompt');
  const promptLen = construir?.parameters?.jsCode?.length || 0;

  const report = {
    ok: true,
    idempotent: before === after,
    hasHumanize: (wf.nodes || []).some((n) =>
      n.parameters?.jsCode?.includes('function humanizeReply'),
    ),
    hasComoEscribis: !!construir?.parameters?.jsCode?.includes('CÓMO ESCRIBÍS') ||
      !!construir?.parameters?.jsCode?.includes('COMO ESCRIBIS') ||
      !!construir?.parameters?.jsCode?.includes('Sos parte del equipo'),
    hasTyping: (wf.nodes || []).some((n) => n.name === 'Mostrar escribiendo'),
    hasStart: (wf.nodes || []).some((n) => n.name === 'IF Es Start'),
    hasPartir: (wf.nodes || []).some((n) => n.name === 'Partir Respuesta'),
    promptJsCodeLen: promptLen,
    telegramParseMode: (wf.nodes || []).find((n) => n.name === 'Telegram Responder')?.parameters
      ?.additionalFields?.parse_mode || null,
  };

  if (args.has('--deploy')) {
    await deploy(wf);
    report.deployed = PROD;
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
