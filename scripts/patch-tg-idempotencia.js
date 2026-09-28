/**
 * Descarta updates de Telegram ya vistos (static data).
 * node scripts/patch-tg-idempotencia.js [--live]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const FILE = path.join(__dirname, '..', 'workflows', 'Bot Telegram Inmobiliaria.json');
const CODE = fs.readFileSync(path.join(__dirname, 'snippets', 'tg-idempotencia.js'), 'utf8');
const TESIS = 'pAoeaGKRj49HvgJq';
const PROD = '8JoSfkcn3pE1f0av';
const NODE = 'Idempotencia update_id';

function aplicar(wf) {
  if (!wf.nodes.some((n) => n.name === NODE)) {
    wf.nodes.push({
      id: 'tg-idempotencia-update',
      name: NODE,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 480],
      parameters: { jsCode: CODE },
    });
  } else {
    const n = wf.nodes.find((x) => x.name === NODE);
    n.parameters.jsCode = CODE;
  }
  const prev = wf.connections['Telegram Trigger'];
  const next = prev && prev.main && prev.main[0] && prev.main[0][0] && prev.main[0][0].node;
  if (next !== NODE) {
    wf.connections['Telegram Trigger'] = { main: [[{ node: NODE, type: 'main', index: 0 }]] };
    wf.connections[NODE] = {
      main: [next ? [{ node: next, type: 'main', index: 0 }] : []],
    };
  }
  return wf;
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
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
        timeout: 120000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 200)));
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

(async () => {
  const raw = fs.readFileSync(FILE, 'utf8');
  const wf = JSON.parse(raw);
  const nextName =
    wf.connections['Telegram Trigger'] &&
    wf.connections['Telegram Trigger'].main[0][0].node;
  aplicar(wf);
  let out = raw;
  if (!raw.includes(NODE)) {
    out = JSON.stringify(wf, null, 2);
  } else {
    const node = wf.nodes.find((n) => n.name === NODE);
    out = raw.replace(JSON.stringify(node.parameters.jsCode), JSON.stringify(CODE));
  }
  fs.writeFileSync(FILE, out);
  console.log('json', nextName, '->', NODE);
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  const live = await request('GET', '/api/v1/workflows/' + PROD, key);
  if (live.id === TESIS) throw new Error('tesis');
  aplicar(live);
  await request('PUT', '/api/v1/workflows/' + PROD, key, {
    name: live.name,
    nodes: live.nodes,
    connections: live.connections,
    settings: { executionOrder: (live.settings && live.settings.executionOrder) || 'v1' },
  });
  console.log('live', PROD);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
