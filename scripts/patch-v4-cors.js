/**
 * V4: CORS del panel usa PANEL_ORIGIN, no *.
 * node scripts/patch-v4-cors.js [--live]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ORIGIN = "={{ $env.PANEL_ORIGIN || 'http://localhost:5173' }}";
const ORIGIN_FIJO = 'http://localhost:5173';
const FILES = [
  'PANEL-01 API Leads.json',
  'PANEL-02 Envio Masivo Telegram.json',
  'PANEL-03 Stock Update.json',
  'PANEL-04 Realtime Emit.json',
  'PANEL-05 Acciones Lead.json',
  'PANEL-06 Panel Assistant.json',
];
const IDS = [
  'TfGR4Uhq2TnSBFLw',
  'ZhesATaZTLCLjscv',
  'XpgowGRcMck5vTNk',
  'BFMfcYsVAuZF0Vto',
  '2JCWQgcxk5t9tMEt',
  '2r1VShrbZAxha60T',
];

function ensureHeader(node) {
  const params = node.parameters || (node.parameters = {});
  const options = params.options || (params.options = {});
  const headers = options.responseHeaders || (options.responseHeaders = { entries: [] });
  if (!Array.isArray(headers.entries)) headers.entries = [];
  let row = headers.entries.find((e) => e && e.name === 'Access-Control-Allow-Origin');
  if (!row) {
    row = { name: 'Access-Control-Allow-Origin', value: ORIGIN };
    headers.entries.push(row);
    return true;
  }
  if (row.value === ORIGIN) return false;
  row.value = ORIGIN;
  return true;
}

function patchWorkflow(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    if (node.type === 'n8n-nodes-base.respondToWebhook') {
      if (ensureHeader(node)) n += 1;
    }
    if (node.type === 'n8n-nodes-base.webhook') {
      const pathName = String((node.parameters && node.parameters.path) || '');
      if (!pathName.startsWith('panel-') && pathName !== 'envio-masivo') continue;
      const options = (node.parameters.options = node.parameters.options || {});
      if (options.allowedOrigins !== ORIGIN_FIJO) {
        options.allowedOrigins = ORIGIN_FIJO;
        n += 1;
      }
    }
  }
  return n;
}

function writeFile(file) {
  const full = path.join(ROOT, 'workflows', file);
  const raw = fs.readFileSync(full, 'utf8');
  let next = raw.replace(
    /("name": "Access-Control-Allow-Origin",\r?\n\s*"value": )"\*"/g,
    '$1' + JSON.stringify(ORIGIN),
  );
  next = next.replace(
    /"options": \{\},\r?\n(\s*)"path": "(panel-[^"]+|envio-masivo)"/g,
    '"options": { "allowedOrigins": ' + JSON.stringify(ORIGIN) + ' },\n$1"path": "$2"',
  );
  next = next.replace(
    /"path": "(panel-[^"]+|envio-masivo)",(\r?\n\s*)"responseMode": "responseNode",(\r?\n\s*)"options": \{\}/g,
    '"path": "$1",$2"responseMode": "responseNode",$3"options": { "allowedOrigins": ' +
      JSON.stringify(ORIGIN_FIJO) +
      ' }',
  );
  next = next.replace(
    /"allowedOrigins": "=\{\{[\s\S]*?\}\}"/g,
    '"allowedOrigins": ' + JSON.stringify(ORIGIN_FIJO),
  );
  if (next !== raw) fs.writeFileSync(full, next);
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
  for (const file of FILES) {
    writeFile(file);
    console.log('json', file);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  for (const id of IDS) {
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
