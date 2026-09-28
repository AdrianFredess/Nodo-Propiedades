/**
 * C3: el cliente no recibe el razonamiento interno de Groq.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FN = fs
  .readFileSync(path.join(__dirname, 'snippets', 'sin-razonamiento.js'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\nif \(typeof module[\s\S]*$/, '\n')
  .trim();

const TG_OLD = `let respuestaCompleta =
  (msgGroq.content && String(msgGroq.content).trim()) ||
  String(msgGroq.reasoning || msgGroq.reasoning_content || '').trim();`;

const TG_NEW = `let respuestaCompleta = textoVisibleGroq(msgGroq);`;

const PANEL_OLD = `let raw =
  (msg.content && String(msg.content).trim()) ||
  String(msg.reasoning || msg.reasoning_content || '').trim();`;

const PANEL_NEW = `let raw = textoVisibleGroq(msg);`;

function patchCode(code) {
  let out = code.replace(/\r\n/g, '\n');
  if (out.includes(TG_OLD)) out = out.replace(TG_OLD, TG_NEW);
  if (out.includes(PANEL_OLD)) out = out.replace(PANEL_OLD, PANEL_NEW);
  if (out.includes('textoVisibleGroq(') && !out.includes('function textoVisibleGroq')) {
    out = FN + '\n' + out;
  }
  return out;
}

function patchWorkflow(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    const code = node.parameters && node.parameters.jsCode;
    if (typeof code !== 'string') continue;
    const next = patchCode(code);
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
  const files = ['Bot Telegram Inmobiliaria.json', 'PANEL-06 Panel Assistant.json'];
  for (const file of files) {
    const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8'));
    const n = patchWorkflow(wf);
    writeSurgical(file, wf);
    console.log('json', file, n);
    for (const node of wf.nodes) {
      const code = node.parameters && node.parameters.jsCode;
      if (typeof code !== 'string' || !code.includes('textoVisibleGroq')) continue;
      try {
        new Function(code);
      } catch (e) {
        throw new Error(node.name + ' no parsea: ' + e.message);
      }
    }
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  for (const id of ['8JoSfkcn3pE1f0av', '2r1VShrbZAxha60T']) {
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
