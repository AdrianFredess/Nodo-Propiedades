/**
 * Copia mínima con el mismo nodo de firma. No dispara el bot de producción.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const CODE = fs.readFileSync(path.join(__dirname, 'snippets', 'validar-firma-meta.js'), 'utf8');
const OUT = path.join(__dirname, '..', 'docs', 'validacion', 'p3-firma-meta-2026-09-28.md');
const HOOK = 'p3-firma-check';

function secret() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = raw.match(/^META_APP_SECRET=(.*)$/m);
  if (!m || !String(m[1]).trim()) throw new Error('Falta META_APP_SECRET en .env');
  return String(m[1]).trim().replace(/^["']|["']$/g, '');
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

function request(method, urlPath, key, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: Object.assign(
          { 'X-N8N-API-KEY': key || '' },
          data
            ? { 'Content-Type': 'application/json', 'Content-Length': data.length }
            : {},
          headers || {},
        ),
        timeout: 60000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function api(method, urlPath, key, obj) {
  return request(method, urlPath, key, obj ? JSON.stringify(obj) : null).then((r) => {
    if (r.status >= 400) throw new Error(method + ' ' + urlPath + ' ' + r.status + ' ' + r.body);
    return r.body ? JSON.parse(r.body) : null;
  });
}

(async () => {
  const key = apiKey();
  const sec = secret();
  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'check' }] });
  const good = 'sha256=' + crypto.createHmac('sha256', sec).update(payload).digest('hex');
  const wf = {
    name: 'CHECK P3 firma meta',
    nodes: [
      {
        id: 'wh',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: HOOK,
        parameters: { httpMethod: 'POST', path: HOOK, responseMode: 'responseNode', options: { rawBody: true } },
      },
      {
        id: 'val',
        name: 'Validar Firma Meta',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [200, 0],
        parameters: { jsCode: CODE },
      },
      {
        id: 'if',
        name: 'IF Firma',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [400, 0],
        parameters: {
          conditions: {
            combinator: 'and',
            conditions: [
              {
                id: 'f',
                leftValue: '={{ Boolean($json.firma_ok) }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'equals' },
              },
            ],
            options: { version: 2, typeValidation: 'loose' },
          },
        },
      },
      {
        id: 'ok',
        name: 'Respond 200',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [600, -80],
        parameters: { respondWith: 'json', responseBody: '={{ { ok: true } }}', options: { responseCode: 200 } },
      },
      {
        id: 'bad',
        name: 'Respond 401',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [600, 80],
        parameters: { respondWith: 'json', responseBody: '={{ { ok: false } }}', options: { responseCode: 401 } },
      },
      {
        id: 'groq',
        name: 'HTTP Groq',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [800, -80],
        parameters: { jsCode: 'return [{ json: { groq: true } }];' },
      },
    ],
    connections: {
      Webhook: { main: [[{ node: 'Validar Firma Meta', type: 'main', index: 0 }]] },
      'Validar Firma Meta': { main: [[{ node: 'IF Firma', type: 'main', index: 0 }]] },
      'IF Firma': {
        main: [
          [{ node: 'Respond 200', type: 'main', index: 0 }],
          [{ node: 'Respond 401', type: 'main', index: 0 }],
        ],
      },
      'Respond 200': { main: [[{ node: 'HTTP Groq', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };
  const list = await api('GET', '/api/v1/workflows?limit=100', key);
  const old = (list.data || []).find((w) => w.name === wf.name);
  if (old) await api('DELETE', '/api/v1/workflows/' + old.id, key);
  const created = await api('POST', '/api/v1/workflows', key, wf);
  await api('POST', '/api/v1/workflows/' + created.id + '/activate', key);

  const badRes = await request('POST', '/webhook/' + HOOK, '', payload, {
    'x-hub-signature-256': 'sha256=' + '0'.repeat(64),
  });
  const goodRes = await request('POST', '/webhook/' + HOOK, '', payload, {
    'x-hub-signature-256': good,
  });
  await new Promise((r) => setTimeout(r, 1500));
  const execs = await api('GET', '/api/v1/executions?workflowId=' + created.id + '&limit=5', key);
  const details = [];
  for (const row of execs.data || []) {
    const full = await api('GET', '/api/v1/executions/' + row.id + '?includeData=true', key);
    const run = (full.data && full.data.resultData && full.data.resultData.runData) || {};
    details.push(row.id + ' groq=' + Boolean(run['HTTP Groq']) + ' firma=' + Boolean(run['Validar Firma Meta']));
  }
  await api('POST', '/api/v1/workflows/' + created.id + '/deactivate', key);
  const md = [
    '# P3 — Firma HMAC Meta',
    '',
    '- Workflow de prueba `' + created.id + '`, mismo código que `Validar Firma Meta` en SIMPLE-02 y SIMPLE-03.',
    '- POST con firma inválida: HTTP **' + badRes.status + '**.',
    '- POST con firma válida: HTTP **' + goodRes.status + '**.',
    '- Ejecuciones: ' + details.join(' ; '),
    '',
  ].join('\n');
  fs.writeFileSync(OUT, md);
  console.log(md);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
