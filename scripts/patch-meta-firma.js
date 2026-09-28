/**
 * Firma HMAC de Meta delante del webhook POST de WhatsApp y Messenger.
 * node scripts/patch-meta-firma.js [--live]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(__dirname, 'snippets', 'validar-firma-meta.js'), 'utf8');

function respondNode(id, name, code) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [480, code === 401 ? 80 : 280],
    parameters: {
      respondWith: 'json',
      responseBody: code === 401 ? '={{ { ok: false } }}' : '={{ { ok: true } }}',
      options: { responseCode: code },
    },
  };
}

function patchWebhook(wf, webhookName) {
  const hook = wf.nodes.find((n) => n.name === webhookName);
  if (!hook) throw new Error('sin webhook ' + webhookName);
  hook.parameters.responseMode = 'responseNode';
  hook.parameters.options = Object.assign({}, hook.parameters.options || {}, { rawBody: true });
  const prefix = webhookName.replace(/\s+/g, '-');
  const validar = 'Validar Firma Meta ' + prefix;
  const iff = 'IF Firma Meta ' + prefix;
  const ok = 'Respond 200 ' + prefix;
  const bad = 'Respond 401 ' + prefix;
  if (!wf.nodes.some((n) => n.name === validar)) {
    wf.nodes.push({
      id: 'firma-' + prefix,
      name: validar,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 200],
      parameters: { jsCode: CODE },
    });
    wf.nodes.push({
      id: 'if-firma-' + prefix,
      name: iff,
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [480, 200],
      parameters: {
        conditions: {
          combinator: 'and',
          conditions: [
            {
              id: 'firma',
              leftValue: '={{ Boolean($json.firma_ok) }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'equals' },
            },
          ],
          options: { version: 2, typeValidation: 'loose' },
        },
      },
    });
    wf.nodes.push(respondNode('ok-' + prefix, ok, 200));
    wf.nodes.push(respondNode('bad-' + prefix, bad, 401));
  } else {
    const node = wf.nodes.find((n) => n.name === validar);
    node.parameters.jsCode = CODE;
  }
  const prev = wf.connections[webhookName];
  const next = prev && prev.main && prev.main[0] && prev.main[0][0] && prev.main[0][0].node;
  const already = next === validar;
  if (!already) {
    wf.connections[webhookName] = { main: [[{ node: validar, type: 'main', index: 0 }]] };
  }
  wf.connections[validar] = { main: [[{ node: iff, type: 'main', index: 0 }]] };
  const kept = wf.connections[ok] && wf.connections[ok].main && wf.connections[ok].main[0] && wf.connections[ok].main[0][0];
  const afterOk = kept ? wf.connections[ok].main[0] : next && next !== validar ? [{ node: next, type: 'main', index: 0 }] : [];
  wf.connections[ok] = { main: [afterOk] };
  wf.connections[iff] = {
    main: [
      [{ node: ok, type: 'main', index: 0 }],
      [{ node: bad, type: 'main', index: 0 }],
    ],
  };
  return wf;
}

function writeJson(file, wf) {
  fs.writeFileSync(path.join(ROOT, 'workflows', file), JSON.stringify(wf, null, 2) + '\n');
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
    settings: { executionOrder: s.executionOrder || 'v1' },
  };
}

async function main() {
  const jobs = [
    ['SIMPLE-02 WhatsApp Bot.json', 'Webhook WhatsApp', 'npq6sC6YLaUBpHac'],
    ['SIMPLE-03 Messenger Bot.json', 'Webhook Messenger', 'XhceE1kxNalCTMw4'],
  ];
  for (const [file, hook] of jobs) {
    const full = path.join(ROOT, 'workflows', file);
    if (!fs.existsSync(full)) {
      console.log('skip file', file);
      continue;
    }
    const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
    const name = wf.nodes.some((n) => n.name === hook)
      ? hook
      : (wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters && n.parameters.httpMethod === 'POST') || {}).name;
    if (!name) throw new Error('sin POST webhook en ' + file);
    patchWebhook(wf, name);
    writeJson(file, wf);
    console.log('json', file, name);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  for (const [, hook, id] of jobs) {
    const live = await request('GET', '/api/v1/workflows/' + id, key);
    const name = live.nodes.some((n) => n.name === hook)
      ? hook
      : (live.nodes.find((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters && n.parameters.httpMethod === 'POST') || {}).name;
    if (!name) throw new Error('sin POST en vivo ' + id);
    patchWebhook(live, name);
    await request('PUT', '/api/v1/workflows/' + id, key, putBody(live));
    console.log('live', id, name);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
