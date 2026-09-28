/**
 * Reemplaza clasificarDerivacionHumano en los bots de producción.
 * No toca la copia de tesis.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const SNIP = fs.readFileSync(path.join(__dirname, 'snippets', 'intent-classifier.js'), 'utf8');
const TESIS = 'pAoeaGKRj49HvgJq';
const FILES = [
  'workflows/Bot Telegram Inmobiliaria.json',
  'workflows/SIMPLE-02 WhatsApp Bot.json',
  'workflows/SIMPLE-03 Messenger Bot.json',
];

function extraer(src) {
  const start = src.indexOf('function clasificarDerivacionHumano');
  if (start < 0) return '';
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

const nueva = extraer(SNIP);
if (!nueva) throw new Error('no encontre la funcion nueva');

function aplicarCodigo(code) {
  const vieja = extraer(code);
  if (!vieja || vieja === nueva) return code;
  return code.replace(vieja, nueva);
}

function aplicarWf(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    const code = node.parameters && node.parameters.jsCode;
    if (!code || !code.includes('function clasificarDerivacionHumano')) continue;
    const next = aplicarCodigo(code);
    if (next !== code) {
      node.parameters.jsCode = next;
      n++;
    }
  }
  return n;
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
  for (const rel of FILES) {
    const file = path.join(__dirname, '..', rel);
    let raw = fs.readFileSync(file, 'utf8');
    const wf = JSON.parse(raw);
    let n = 0;
    for (const node of wf.nodes || []) {
      const code = node.parameters && node.parameters.jsCode;
      if (!code || !code.includes('function clasificarDerivacionHumano')) continue;
      const next = aplicarCodigo(code);
      if (next === code) continue;
      const from = JSON.stringify(code);
      const to = JSON.stringify(next);
      if (!raw.includes(from)) throw new Error('no pude ubicar el codigo en ' + rel + ' ' + node.name);
      raw = raw.replace(from, to);
      n++;
    }
    fs.writeFileSync(file, raw);
    console.log('json', rel, n);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  for (const row of list.data || []) {
    if (row.id === TESIS) continue;
    if (!/telegram|whatsapp|messenger/i.test(row.name)) continue;
    if (/CHECK|TESIS/i.test(row.name)) continue;
    const wf = await request('GET', '/api/v1/workflows/' + row.id, key);
    const n = aplicarWf(wf);
    if (!n) continue;
    await request('PUT', '/api/v1/workflows/' + row.id, key, {
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: { executionOrder: (wf.settings && wf.settings.executionOrder) || 'v1' },
    });
    console.log('live', row.id, row.name, n);
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
