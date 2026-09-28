/**
 * Los webhooks del panel exigen X-Panel-Token. Sin token, o con uno distinto, responden 401.
 * node scripts/patch-panel-auth.js [--live]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const CODE = fs.readFileSync(path.join(__dirname, 'snippets', 'panel-auth.js'), 'utf8');
const ROOT = path.join(__dirname, '..');
const TESIS = 'pAoeaGKRj49HvgJq';
const EMITTERS = [
  'workflows/Bot Telegram Inmobiliaria.json',
  'workflows/SIMPLE-02 WhatsApp Bot.json',
  'workflows/SIMPLE-03 Messenger Bot.json',
  'workflows/SIMPLE-04 Seguimiento Automatico.json',
];

function headerEnArchivo(raw) {
  return raw.replace(
    /("url": "http:\/\/127\.0\.0\.1:5678\/webhook\/panel-realtime-emit",\r?\n)(\s*)"sendBody":/g,
    '$1$2"sendHeaders": true,\n$2"headerParameters": {\n$2  "parameters": [\n$2    { "name": "X-Panel-Token", "value": "={{ $env.PANEL_API_TOKEN }}" }\n$2  ]\n$2},\n$2"sendBody":',
  );
}

const PANELS = [
  'workflows/PANEL-01 API Leads.json',
  'workflows/PANEL-02 Envio Masivo Telegram.json',
  'workflows/PANEL-03 Stock Update.json',
  'workflows/PANEL-04 Realtime Emit.json',
  'workflows/PANEL-05 Acciones Lead.json',
  'workflows/PANEL-06 Panel Assistant.json',
];

function asegurarAuth(wf) {
  const hooks = (wf.nodes || []).filter((n) => n.type === 'n8n-nodes-base.webhook');
  for (const wh of hooks) {
    wh.parameters = wh.parameters || {};
    wh.parameters.responseMode = 'responseNode';
  }
  const check = (wf.nodes || []).find((n) => n.name === 'Check Panel Auth');
  if (check) {
    check.parameters.jsCode = CODE;
    return 'codigo';
  }
  const wh = hooks[0];
  if (!wh) return 'sin webhook';
  const prev = wf.connections[wh.name];
  const next = prev && prev.main && prev.main[0] && prev.main[0][0] && prev.main[0][0].node;
  if (!next || next === 'Check Panel Auth') return 'sin siguiente';
  wf.nodes.push(
    {
      id: 'panel-auth-check',
      name: 'Check Panel Auth',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 300],
      parameters: { jsCode: CODE },
    },
    {
      id: 'panel-auth-if',
      name: 'IF Panel Auth OK',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [500, 300],
      parameters: {
        conditions: {
          combinator: 'and',
          options: { version: 2, typeValidation: 'strict', caseSensitive: true, leftValue: '' },
          conditions: [
            {
              id: 'auth-ok',
              leftValue: '={{ $json._authOk }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: 'panel-auth-fail',
      name: 'Responder Auth Fail',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [500, 480],
      parameters: {
        respondWith: 'json',
        responseBody: "={{ JSON.stringify({ ok: false, error: 'unauthorized' }) }}",
        options: { responseCode: 401 },
      },
    },
  );
  wf.connections[wh.name] = { main: [[{ node: 'Check Panel Auth', type: 'main', index: 0 }]] };
  wf.connections['Check Panel Auth'] = {
    main: [[{ node: 'IF Panel Auth OK', type: 'main', index: 0 }]],
  };
  wf.connections['IF Panel Auth OK'] = {
    main: [
      [{ node: next, type: 'main', index: 0 }],
      [{ node: 'Responder Auth Fail', type: 'main', index: 0 }],
    ],
  };
  return 'nuevo ' + wh.name + ' -> ' + next;
}

function asegurarHeader(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    const url = node.parameters && node.parameters.url;
    if (!url || !String(url).includes('panel-realtime-emit')) continue;
    node.parameters.sendHeaders = true;
    const hp = node.parameters.headerParameters || { parameters: [] };
    hp.parameters = hp.parameters || [];
    if (!hp.parameters.some((h) => String(h.name).toLowerCase() === 'x-panel-token')) {
      hp.parameters.push({ name: 'X-Panel-Token', value: '={{ $env.PANEL_API_TOKEN }}' });
      n += 1;
    }
    node.parameters.headerParameters = hp;
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
    settings: { executionOrder: s.executionOrder || 'v1' },
  };
}

(async () => {
  for (const rel of PANELS) {
    const file = path.join(ROOT, rel);
    const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
    const auth = asegurarAuth(wf);
    const headers = asegurarHeader(wf);
    fs.writeFileSync(file, JSON.stringify(wf, null, 2) + '\n');
    console.log('json', rel, auth, 'headers', headers);
  }
  for (const rel of EMITTERS) {
    const file = path.join(ROOT, rel);
    const raw = fs.readFileSync(file, 'utf8');
    const next = headerEnArchivo(raw);
    if (next !== raw) {
      fs.writeFileSync(file, next);
      console.log('header', rel);
    }
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  for (const row of list.data || []) {
    if (row.id === TESIS || /CHECK|TESIS/i.test(row.name)) continue;
    const esPanel = /^PANEL-0/.test(row.name);
    const emite = /Telegram|WhatsApp|Messenger|Seguimiento|PANEL-05/i.test(row.name);
    if (!esPanel && !emite) continue;
    const wf = await request('GET', '/api/v1/workflows/' + row.id, key);
    const auth = esPanel ? asegurarAuth(wf) : 'no';
    const headers = asegurarHeader(wf);
    if (auth === 'no' && !headers) continue;
    await request('PUT', '/api/v1/workflows/' + row.id, key, putBody(wf));
    console.log('live', row.id, row.name, auth, headers);
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
