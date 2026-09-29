/**
 * C11: el prompt que va a Groq usa stock filtrado, historial corto y reglas cortas.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SNIP = fs.readFileSync(path.join(__dirname, 'snippets', 'intent-classifier.js'), 'utf8').replace(/\r\n/g, '\n');
const START = 'function icFiltrarStockParaPrompt';
const END = 'function icTextoSoloUsuarios';
const sa = SNIP.indexOf(START);
const sb = SNIP.indexOf(END);
if (sa < 0 || sb < 0) throw new Error('span del clasificador');
const BLOCK = SNIP.slice(sa, sb);

function patchCode(code) {
  let out = code.replace(/\r\n/g, '\n');
  const a = out.indexOf(START);
  const b = out.indexOf(END, a + 1);
  if (a < 0 || b < 0) return out;
  out = out.slice(0, a) + BLOCK + out.slice(b);

  if (out.includes('formatearAprendizajeSheets(rows, 6)')) {
    out = out.replace('formatearAprendizajeSheets(rows, 6)', 'formatearAprendizajeSheets(rows, 2)');
  }
  if (out.includes('seleccionarEjemplosGlobales(msgActual, analisis, 3,')) {
    out = out.replace(
      'seleccionarEjemplosGlobales(msgActual, analisis, 3,',
      'seleccionarEjemplosGlobales(msgActual, analisis, 1,',
    );
  }

  const descOld = "const desc = pick(row, ['descripcion', 'Descripcion', 'detalle']);";
  const descNew = "const desc = pick(row, ['descripcion', 'Descripcion', 'detalle']).slice(0, 80);";
  if (out.includes(descOld)) out = out.replace(descOld, descNew);
  const descWa = "const desc = pick(r, ['descripcion', 'Descripcion', 'detalle']);";
  const descWaNew = "const desc = pick(r, ['descripcion', 'Descripcion', 'detalle']).slice(0, 80);";
  if (out.includes(descWa)) out = out.replace(descWa, descWaNew);

  if (out.includes('icFiltrarStockParaPrompt') && !out.includes('operacion: operacionDetectada')) {
    out = out.replace(
      'budgetUsd: presupuestoUsd,\n        tipo:',
      'budgetUsd: presupuestoUsd,\n        operacion: operacionDetectada,\n        tipo:',
    );
    out = out.replace(
      'budgetUsd: presupuestoUsd,\r\n        tipo:',
      'budgetUsd: presupuestoUsd,\n        operacion: operacionDetectada,\n        tipo:',
    );
  }

  const sysOld = "const sysMsg = sanitizarMensajeGroq({ role: 'system', content: systemPrompt });";
  const sysNew = `const histPrompt =
  typeof icHistorialParaPrompt === 'function'
    ? icHistorialParaPrompt(historialJson)
    : { mensajes: icSanitizarHistorialPrompt(historialJson, 8), resumen: '' };
const sistemaBase =
  systemPrompt + (histPrompt.resumen ? '\\n' + histPrompt.resumen : '');
const sysMsg = sanitizarMensajeGroq({
  role: 'system',
  content:
    typeof compactarPromptMatias === 'function'
      ? compactarPromptMatias(sistemaBase)
      : sistemaBase,
});`;
  if (out.includes(sysOld)) out = out.replace(sysOld, sysNew);

  const histOld = `const historialLimpio = icSanitizarHistorialPrompt(
  historialJson,
  typeof IC_HISTORIAL_PROMPT_MAX === 'number' ? IC_HISTORIAL_PROMPT_MAX : 8,
);
for (const msg of historialLimpio) {`;
  if (out.includes(histOld)) out = out.replace(histOld, 'for (const msg of histPrompt.mensajes) {');

  if (out.includes('HISTORIAL COMPLETO (role+content, leé todo; no recortes mentalmente):')) {
    out = out.replace(
      'HISTORIAL COMPLETO (role+content, leé todo; no recortes mentalmente):',
      'HISTORIAL (ultimos 8 turnos; lo anterior va en una linea):',
    );
  }
  if (out.includes('prompt_groq: prompt,') && !out.includes('compactarPromptMatias(prompt)')) {
    out = out.replace(
      'prompt_groq: prompt,',
      'prompt_groq:\n        typeof compactarPromptMatias === \'function\' ? compactarPromptMatias(prompt) : prompt,',
    );
  }
  return out;
}

function assertWired(wf) {
  for (const node of wf.nodes || []) {
    const code = node.parameters && node.parameters.jsCode;
    if (typeof code !== 'string') continue;
    if (node.name === 'Construir Prompt' && !code.includes('compactarPromptMatias(sistemaBase)')) {
      throw new Error('Telegram quedo sin compactar el prompt');
    }
    if (
      node.name === 'Code - Armar Prompt' &&
      code.includes('prompt_groq') &&
      !code.includes('compactarPromptMatias(prompt)')
    ) {
      throw new Error('WhatsApp quedo sin compactar el prompt');
    }
  }
}

function patchWorkflow(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    const code = node.parameters && node.parameters.jsCode;
    if (typeof code !== 'string' || code.indexOf(START) < 0) continue;
    const next = patchCode(code);
    if (!next.includes('function compactarPromptMatias')) {
      throw new Error(node.name + ' quedo sin compactar');
    }
    if (next !== code.replace(/\r\n/g, '\n')) n += 1;
    node.parameters.jsCode = next;
  }
  return n;
}

function writeSurgical(file, wf) {
  const full = path.join(ROOT, 'workflows', file);
  let raw = fs.readFileSync(full, 'utf8');
  const prev = JSON.parse(raw);
  for (let i = 0; i < prev.nodes.length; i++) {
    const before = prev.nodes[i].parameters && prev.nodes[i].parameters.jsCode;
    const after = wf.nodes[i].parameters && wf.nodes[i].parameters.jsCode;
    if (typeof before !== 'string' || before === after) continue;
    const from = JSON.stringify(before);
    const to = JSON.stringify(after);
    if (!raw.includes(from)) throw new Error('No pude ubicar ' + prev.nodes[i].name);
    raw = raw.replace(from, to);
  }
  fs.writeFileSync(full, raw);
}

function apiKey() {
  const code = [
    'import sqlite3',
    'c=sqlite3.connect(r"file:C:/Users/adrian/.n8n/database.sqlite?mode=ro", uri=True)',
    'row=c.execute("SELECT apiKey FROM user_api_keys WHERE label=?", ("n8n",)).fetchone()',
    'print(row[0] if row else "")',
  ].join('; ');
  return execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
}

function request(method, urlPath, key, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: {
          'X-N8N-API-KEY': key,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 300)));
            return;
          }
          resolve(buf ? JSON.parse(buf) : null);
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function putBody(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: s.executionOrder || 'v1', ...(s.timezone ? { timezone: s.timezone } : {}) },
    staticData: wf.staticData || undefined,
  };
}

async function main() {
  const files = ['Bot Telegram Inmobiliaria.json', 'SIMPLE-02 WhatsApp Bot.json'];
  for (const file of files) {
    const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8'));
    const n = patchWorkflow(wf);
    assertWired(wf);
    for (const node of wf.nodes) {
      const code = node.parameters && node.parameters.jsCode;
      if (typeof code !== 'string' || code.indexOf('function compactarPromptMatias') < 0) continue;
      try {
        new Function(code);
      } catch (e) {
        throw new Error(node.name + ' no parsea: ' + e.message);
      }
    }
    writeSurgical(file, wf);
    console.log('json', file, n);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  for (const id of ['8JoSfkcn3pE1f0av', 'npq6sC6YLaUBpHac']) {
    const live = await request('GET', '/api/v1/workflows/' + id, key);
    const n = patchWorkflow(live);
    assertWired(live);
    for (const node of live.nodes || []) {
      const code = node.parameters && node.parameters.jsCode;
      if (typeof code !== 'string' || code.indexOf('function compactarPromptMatias') < 0) continue;
      new Function(code);
    }
    await request('PUT', '/api/v1/workflows/' + id, key, putBody(live));
    console.log('live', id, n);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
