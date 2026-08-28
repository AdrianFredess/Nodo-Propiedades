/**
 * Parches cuidadosos (capa 1–3):
 * 1) Auth suave X-Panel-Token en PANEL-01/02/03 (solo si PANEL_API_TOKEN está en env n8n)
 * 2) Emit realtime en SIMPLE-02
 * 3) Dual-write historial_json + criterios TIB + fallback IA vacío en SIMPLE-02
 * 4) Fallback Groq en Bot Telegram (Parsear Respuesta)
 *
 * Uso: node scripts/patch-mejoras-seguro.js
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
  throw new Error('Sin N8N_API_KEY en mcp.json');
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
        path: url.pathname + url.search,
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

const AUTH_CODE = `const root = $input.first().json;
const headers = root.headers || {};
const norm = {};
for (const [k, v] of Object.entries(headers)) {
  norm[String(k).toLowerCase()] = v;
}
const authHeader = String(norm.authorization || '');
const bearer = authHeader.toLowerCase().startsWith('bearer ')
  ? authHeader.slice(7).trim()
  : '';
const got = String(norm['x-panel-token'] || bearer || '').trim();
let expected = '';
try {
  expected = String(($env && $env.PANEL_API_TOKEN) || '').trim();
} catch (e) {
  expected = '';
}
const authOk = !expected || got === expected;
return [{ json: { ...root, _authOk: authOk } }];`;

function ifAuthParams() {
  return {
    conditions: {
      combinator: 'and',
      options: {
        caseSensitive: true,
        leftValue: '',
        typeValidation: 'strict',
        version: 2,
      },
      conditions: [
        {
          id: 'auth-ok',
          leftValue: '={{ $json._authOk }}',
          rightValue: true,
          operator: {
            type: 'boolean',
            operation: 'true',
            singleValue: true,
          },
        },
      ],
    },
    options: {},
  };
}

function respond401() {
  return {
    respondWith: 'json',
    responseBody:
      "={{ JSON.stringify({ ok: false, error: 'unauthorized' }) }}",
    options: {
      responseCode: 401,
      responseHeaders: {
        entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }],
      },
    },
  };
}

async function getWorkflow(id) {
  return request('GET', `/api/v1/workflows/${id}`);
}

async function putWorkflow(wf) {
  const s = wf.settings || {};
  const body = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: s.executionOrder || 'v1',
      ...(s.timezone ? { timezone: s.timezone } : {}),
      ...(s.saveDataErrorExecution
        ? { saveDataErrorExecution: s.saveDataErrorExecution }
        : {}),
      ...(s.saveDataSuccessExecution
        ? { saveDataSuccessExecution: s.saveDataSuccessExecution }
        : {}),
      ...(s.saveManualExecutions != null
        ? { saveManualExecutions: s.saveManualExecutions }
        : {}),
      ...(s.callerPolicy ? { callerPolicy: s.callerPolicy } : {}),
    },
  };
  return request('PUT', `/api/v1/workflows/${wf.id}`, body);
}

function hasNode(wf, name) {
  return wf.nodes.some((n) => n.name === name);
}

function patchPanelAuth(wf, webhookName, nextNodeName, prefix) {
  if (hasNode(wf, 'Check Panel Auth')) {
    console.log(`  skip auth (${wf.name}): ya tiene Check Panel Auth`);
    return false;
  }

  const check = {
    id: `${prefix}-auth-check`,
    name: 'Check Panel Auth',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [280, 300],
    parameters: { jsCode: AUTH_CODE },
  };
  const iff = {
    id: `${prefix}-auth-if`,
    name: 'IF Panel Auth OK',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [500, 300],
    parameters: ifAuthParams(),
  };
  const fail = {
    id: `${prefix}-auth-fail`,
    name: 'Responder Auth Fail',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [500, 480],
    parameters: respond401(),
  };

  wf.nodes.push(check, iff, fail);

  // rewire: Webhook -> Check -> IF -> next | fail
  const wh = wf.connections[webhookName];
  if (!wh || !wh.main || !wh.main[0]) {
    throw new Error(`Sin conexión desde ${webhookName}`);
  }
  wf.connections[webhookName] = {
    main: [[{ node: 'Check Panel Auth', type: 'main', index: 0 }]],
  };
  wf.connections['Check Panel Auth'] = {
    main: [[{ node: 'IF Panel Auth OK', type: 'main', index: 0 }]],
  };
  wf.connections['IF Panel Auth OK'] = {
    main: [
      [{ node: nextNodeName, type: 'main', index: 0 }],
      [{ node: 'Responder Auth Fail', type: 'main', index: 0 }],
    ],
  };
  return true;
}

function patchSimple02Emit(wf) {
  if (hasNode(wf, 'Emit Panel Realtime')) {
    console.log('  skip emit: ya existe');
    return false;
  }
  const emit = {
    id: 's02-emit-panel',
    name: 'Emit Panel Realtime',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [2620, 60],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://127.0.0.1:5678/webhook/panel-realtime-emit',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String($('Code - Procesar IA').first().json.chat_id || ''), mensajeCliente: String($('Code - Procesar IA').first().json.mensaje || ''), respuestaBot: String($('Code - Procesar IA').first().json.respuesta_wa || ''), temperatura: String($('Code - Procesar IA').first().json.temperatura || ''), source: 'whatsapp' } }) }}`,
      options: {
        timeout: 3000,
        response: { response: { neverError: true } },
      },
    },
  };
  const emitLead = {
    id: 's02-emit-lead',
    name: 'Emit Lead Updated',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [2860, 60],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://127.0.0.1:5678/webhook/panel-realtime-emit',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ type: 'lead.updated', payload: { chatId: String($('Code - Procesar IA').first().json.chat_id || ''), temperatura: String($('Code - Procesar IA').first().json.temperatura || ''), source: 'whatsapp' } }) }}`,
      options: {
        timeout: 3000,
        response: { response: { neverError: true } },
      },
    },
  };
  wf.nodes.push(emit, emitLead);

  const from = wf.connections['Google Sheets - Actualizar Temperatura'];
  if (!from) throw new Error('Sin conexión Actualizar Temperatura');
  from.main[0].push(
    { node: 'Emit Panel Realtime', type: 'main', index: 0 },
  );
  wf.connections['Emit Panel Realtime'] = {
    main: [[{ node: 'Emit Lead Updated', type: 'main', index: 0 }]],
  };
  return true;
}

const TIB_BLOCK = `
TEMPERATURA (obligatorio, sin sobrecalentar):
- frio: saludo, curiosidad general, sin zona/presupuesto/urgencia, o chat no inmobiliario reconvertido.
- tibio: pide info concreta (zona, precio, ver opciones) pero sin urgencia de compra/visita inmediata.
- caliente: SOLO si hay urgencia clara (comprar/alquilar ya, visita esta semana, presupuesto definido + pide contacto/asesor) O pide explicitamente hablar con humano para cerrar.
No marques caliente solo por decir "precio" o "info". Preferí tibio ante duda.
`;

function patchSimple02PromptAndHist(wf) {
  const armar = wf.nodes.find((n) => n.name === 'Code - Armar Prompt');
  const proc = wf.nodes.find((n) => n.name === 'Code - Procesar IA');
  const upd = wf.nodes.find(
    (n) => n.name === 'Google Sheets - Actualizar Temperatura',
  );
  if (!armar || !proc || !upd) throw new Error('Nodos SIMPLE-02 faltantes');

  let code = armar.parameters.jsCode;
  if (!code.includes('TEMPERATURA (obligatorio')) {
    // Prefer historial_json if present
    code = code.replace(
      'const historialPrev = String(row.historial || \'\').trim();',
      `let historialPrev = '';
try {
  const hj = row.historial_json;
  if (typeof hj === 'string' && hj.trim().startsWith('[')) {
    const arr = JSON.parse(hj);
    if (Array.isArray(arr)) {
      historialPrev = arr
        .map((m) => {
          const role = String((m && m.role) || '').toLowerCase();
          const content = String((m && (m.content || m.mensaje || '')) || '').trim();
          if (!content) return '';
          if (role === 'assistant' || role === 'bot') return 'Bot: ' + content;
          return 'Cliente: ' + content;
        })
        .filter(Boolean)
        .join('\\n');
    }
  }
} catch (e) { historialPrev = ''; }
if (!historialPrev) historialPrev = String(row.historial || '').trim();`,
    );
    code = code.replace(
      'REGLAS:\n- Lee el HISTORIAL',
      `REGLAS:\n${TIB_BLOCK.trim()}\n- Lee el HISTORIAL`,
    );
    armar.parameters.jsCode = code;
  }

  let pcode = proc.parameters.jsCode;
  if (!pcode.includes('historial_json')) {
    pcode = pcode.replace(
      'let historial = prev ? prev + \'\\n\' + lineCliente + \'\\n\' + lineBot : lineCliente + \'\\n\' + lineBot;\nconst lines = historial.split(\'\\n\').filter(Boolean);\nif (lines.length > 24) historial = lines.slice(-24).join(\'\\n\');',
      `let historial = prev ? prev + '\\n' + lineCliente + '\\n' + lineBot : lineCliente + '\\n' + lineBot;
const lines = historial.split('\\n').filter(Boolean);
if (lines.length > 24) historial = lines.slice(-24).join('\\n');

let historialArr = [];
try {
  const rawHj = prep.historial_json_prev;
  if (typeof rawHj === 'string' && rawHj.trim()) historialArr = JSON.parse(rawHj);
  else if (Array.isArray(rawHj)) historialArr = rawHj;
} catch (e) { historialArr = []; }
if (!Array.isArray(historialArr)) historialArr = [];
const ts = now.toISOString();
historialArr.push({ role: 'user', content: String(prep.mensaje || '').trim(), ts });
historialArr.push({ role: 'assistant', content: String(respuesta || '').trim(), ts });
if (historialArr.length > 60) historialArr = historialArr.slice(historialArr.length - 60);
const historial_json = JSON.stringify(historialArr);`,
    );
    // Fix: `now` is declared after historial block currently - need to move or use Date
    // In current code `now` is AFTER historial. So use new Date() in ts.
    pcode = pcode.replace(
      'const ts = now.toISOString();',
      'const ts = new Date().toISOString();',
    );
    pcode = pcode.replace(
      'historial,\n    status:',
      'historial,\n    historial_json,\n    status:',
    );
    // empty IA text fallback (Basic LLM may return empty)
    pcode = pcode.replace(
      "let respuesta = 'Hola, gracias por escribir a Nodo Propiedades. Para orientarte mejor: buscas alquilar o comprar, y en que zona?';",
      `let respuesta = 'Hola, gracias por escribir a Nodo Propiedades. Para orientarte mejor: buscas alquilar o comprar, y en que zona?';
const iaVacia = !textoIA;
if (iaVacia) {
  // fallback seguro si Groq/LLM no devolvió texto
}`,
    );
    proc.parameters.jsCode = pcode;
  }

  // also pass historial_json_prev from armar
  let acode = armar.parameters.jsCode;
  if (!acode.includes('historial_json_prev')) {
    acode = acode.replace(
      'historial_prev: historialPrev,',
      `historial_prev: historialPrev,
      historial_json_prev: String(row.historial_json || '').trim(),`,
    );
    armar.parameters.jsCode = acode;
  }

  const cols = upd.parameters.columns && upd.parameters.columns.value;
  if (cols && cols.historial_json === undefined) {
    cols.historial_json = '={{ $json.historial_json }}';
  }
  return true;
}

function patchBotTelegramGroqFallback(wf) {
  const parse = wf.nodes.find((n) => n.name === 'Parsear Respuesta');
  if (!parse) throw new Error('Parsear Respuesta no encontrado');
  let code = parse.parameters.jsCode;
  if (code.includes('groq_fallback')) {
    console.log('  skip groq fallback: ya aplicado');
    return false;
  }
  code = code.replace(
    'const groqData = $input.first().json;\nconst promptData = $(\'Construir Prompt\').first().json;\n\nconst msgGroq = groqData.choices[0].message || {};\nconst respuestaCompleta = (msgGroq.content && String(msgGroq.content).trim()) || String(msgGroq.reasoning || msgGroq.reasoning_content || \'\').trim();',
    `const groqData = $input.first().json;
const promptData = $('Construir Prompt').first().json;

const choices = Array.isArray(groqData.choices) ? groqData.choices : [];
const msgGroq = (choices[0] && choices[0].message) || {};
let respuestaCompleta = (msgGroq.content && String(msgGroq.content).trim()) || String(msgGroq.reasoning || msgGroq.reasoning_content || '').trim();
const groq_fallback = !respuestaCompleta;
if (groq_fallback) {
  respuestaCompleta = 'Disculpá, tuve un problema técnico momentáneo. ¿Me repetís tu consulta sobre propiedades en Mendoza (zona y si buscás alquilar o comprar)?';
}`,
  );
  parse.parameters.jsCode = code;

  // HTTP Groq onError continue
  const httpGroq = wf.nodes.find((n) => n.name === 'HTTP Groq');
  if (httpGroq && !httpGroq.onError) {
    httpGroq.onError = 'continueRegularOutput';
  }
  return true;
}

function patchBotTelegramPromptTib(wf) {
  const construir = wf.nodes.find((n) => n.name === 'Construir Prompt');
  if (!construir) return false;
  let code = construir.parameters.jsCode;
  if (code.includes('TEMPERATURA (obligatorio')) {
    console.log('  skip TIB TG: ya aplicado');
    return false;
  }
  // Insert near ESTADO_ACTUAL instructions if present, else append before return
  const tip = `
TEMPERATURA / ###ESTADO_ACTUAL###:
- frio: saludo o consulta vaga sin zona/presupuesto/urgencia.
- tibio: pide info (precio, zona, ver opciones) sin urgencia de cierre.
- caliente: urgencia real (comprar/alquilar ya, visita esta semana, pide asesor) — no uses caliente solo por "precio" o "info". Ante duda: tibio.
`;
  if (code.includes('###ESTADO_ACTUAL###')) {
    code = code.replace(
      '###ESTADO_ACTUAL###',
      `###ESTADO_ACTUAL###\n${tip}`,
    );
  } else {
    code = code.replace(
      'return [',
      `// ${tip}\nreturn [`,
    );
  }
  construir.parameters.jsCode = code;
  return true;
}

async function main() {
  const targets = [
    {
      id: 'TfGR4Uhq2TnSBFLw',
      label: 'PANEL-01',
      fn: (wf) =>
        patchPanelAuth(wf, 'Webhook Leads', 'Payload Cache Gate', 'p01'),
    },
    {
      id: 'ZhesATaZTLCLjscv',
      label: 'PANEL-02',
      fn: (wf) =>
        patchPanelAuth(wf, 'Webhook Envio Masivo', 'Preparar Destinos', 'p02'),
    },
    {
      id: 'XpgowGRcMck5vTNk',
      label: 'PANEL-03',
      fn: (wf) =>
        patchPanelAuth(wf, 'Webhook Stock Update', 'Preparar Patch', 'p03'),
    },
    {
      id: 'npq6sC6YLaUBpHac',
      label: 'SIMPLE-02',
      fn: (wf) => {
        const a = patchSimple02Emit(wf);
        const b = patchSimple02PromptAndHist(wf);
        return a || b;
      },
    },
    {
      id: '8JoSfkcn3pE1f0av',
      label: 'Bot Telegram',
      fn: (wf) => {
        const a = patchBotTelegramGroqFallback(wf);
        const b = patchBotTelegramPromptTib(wf);
        return a || b;
      },
    },
  ];

  for (const t of targets) {
    console.log(`→ ${t.label}`);
    const wf = await getWorkflow(t.id);
    const changed = t.fn(wf);
    if (changed) {
      await putWorkflow(wf);
      console.log(`  OK actualizado`);
    } else {
      console.log(`  sin cambios netos`);
    }
  }
  console.log('Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
