/**
 * V2b: el precio de una ficha identificada sale del stock, no del modelo.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HELPER = fs
  .readFileSync(path.join(__dirname, 'snippets', 'precio-desde-stock.js'), 'utf8')
  .replace(/\r\n/g, '\n')
  .trim();

const TG_OLD = `if (promptData.sheets_error) {
  respuestaBot = 'Dame un rato que chequeo disponibilidad y te confirmo';
  propiedadesMostrar = [];
  mensajesExtra = [];
  mensajeCierre = '';
}`;

const TG_NEW = `if (promptData.sheets_error) {
  respuestaBot = 'Dame un rato que chequeo disponibilidad y te confirmo';
  propiedadesMostrar = [];
  mensajesExtra = [];
  mensajeCierre = '';
} else if (typeof precioPedidoDesdeStock === 'function') {
  let stockRowsPrecio = [];
  try {
    stockRowsPrecio = JSON.parse(promptData.stock_rows_json || '[]');
  } catch (ePrecio) {
    stockRowsPrecio = [];
  }
  const pedidoPrecio = precioPedidoDesdeStock(textoUsuario, stockRowsPrecio);
  if (pedidoPrecio && pedidoPrecio.texto) {
    respuestaBot = pedidoPrecio.texto;
    if (pedidoPrecio.id && propiedadesMostrar.indexOf(pedidoPrecio.id) < 0) {
      propiedadesMostrar.unshift(pedidoPrecio.id);
    }
  }
}`;

const WA_OLD = `if (prep.sheets_error) {
  respuesta = 'Dame un rato que chequeo disponibilidad y te confirmo';
  propiedadesMostrar = [];
  mensajesExtra = [];
  mensajeCierre = '';
}`;

const WA_NEW = WA_OLD.replace(
  '}',
  `} else if (typeof precioPedidoDesdeStock === 'function') {
  let stockRowsPrecio = [];
  try {
    stockRowsPrecio = JSON.parse(prep.stock_rows_json || '[]');
  } catch (ePrecio) {
    stockRowsPrecio = [];
  }
  const pedidoPrecio = precioPedidoDesdeStock(prep.mensaje, stockRowsPrecio);
  if (pedidoPrecio && pedidoPrecio.texto) {
    respuesta = pedidoPrecio.texto;
    if (pedidoPrecio.id && propiedadesMostrar.indexOf(pedidoPrecio.id) < 0) {
      propiedadesMostrar.unshift(pedidoPrecio.id);
    }
  }
}`,
);

function stockField(varName) {
  return `sheets_recuperacion: sheetsRecuperacion,
      stock_rows_json: JSON.stringify(
        (${varName} || []).map((r) => ({
          id: r.id || r.ID || r.codigo || '',
          precio: r.precio || r.Precio || '',
          direccion: r.direccion || r.Direccion || r.titulo || '',
        })),
      ),`;
}

function patchCode(code, kind) {
  let out = code.replace(/\r\n/g, '\n');
  if ((kind === 'tg-parse' || kind === 'wa-parse') && !out.includes('function precioPedidoDesdeStock')) {
    out = HELPER + '\n' + out;
  }
  if (kind === 'tg-parse' && out.includes(TG_OLD) && !out.includes('pedidoPrecio')) out = out.replace(TG_OLD, TG_NEW);
  if (kind === 'wa-parse' && out.includes(WA_OLD) && !out.includes('pedidoPrecio')) out = out.replace(WA_OLD, WA_NEW);
  if (kind === 'tg-prompt' && !out.includes('stock_rows_json')) {
    out = out.replace('sheets_recuperacion: sheetsRecuperacion,', stockField('stockItems'));
  }
  if (kind === 'wa-prompt' && !out.includes('stock_rows_json')) {
    out = out.replace('sheets_recuperacion: sheetsRecuperacion,', stockField('stockItemsEarly'));
  }
  return out;
}

function kindOf(node) {
  if (node.name === 'Construir Prompt') return 'tg-prompt';
  if (node.name === 'Parsear Respuesta') return 'tg-parse';
  if (node.name === 'Code - Armar Prompt') return 'wa-prompt';
  if (node.name === 'Code - Procesar IA') return 'wa-parse';
  return '';
}

function patchWorkflow(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    const kind = kindOf(node);
    const code = node.parameters && node.parameters.jsCode;
    if (!kind || typeof code !== 'string') continue;
    const next = patchCode(code, kind);
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
  for (const file of ['Bot Telegram Inmobiliaria.json', 'SIMPLE-02 WhatsApp Bot.json']) {
    const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8'));
    const n = patchWorkflow(wf);
    writeSurgical(file, wf);
    console.log('json', file, n);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  for (const id of ['8JoSfkcn3pE1f0av', 'npq6sC6YLaUBpHac']) {
    const live = await request('GET', '/api/v1/workflows/' + id, key);
    const n = patchWorkflow(live);
    await request('PUT', '/api/v1/workflows/' + id, key, putBody(live));
    console.log('live', id, n);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
