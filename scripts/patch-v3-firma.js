/**
 * V3: sin binary, la firma se rechaza. No re-serializa el body.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(__dirname, 'snippets', 'validar-firma-meta.js'), 'utf8').replace(/\r\n/g, '\n');

function patchWorkflow(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    const code = node.parameters && node.parameters.jsCode;
    if (typeof code !== 'string' || !code.includes('function rawBody')) continue;
    if (code.includes("fuente: 'ausente'")) continue;
    node.parameters.jsCode = CODE;
    n += 1;
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
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 240)));
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
  for (const file of ['SIMPLE-02 WhatsApp Bot.json', 'SIMPLE-03 Messenger Bot.json']) {
    const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8'));
    const n = patchWorkflow(wf);
    writeSurgical(file, wf);
    console.log('json', file, n);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  for (const id of ['npq6sC6YLaUBpHac', 'XhceE1kxNalCTMw4']) {
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
