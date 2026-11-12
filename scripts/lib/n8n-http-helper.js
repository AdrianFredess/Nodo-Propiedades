'use strict';

const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] == null || process.env[m[1]] === '') process.env[m[1]] = v;
  }
}

function apiKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  const code =
    "import sqlite3\n" +
    "c=sqlite3.connect(r'file:C:/Users/adrian/.n8n/database.sqlite?mode=ro', uri=True)\n" +
    "row=c.execute(\"SELECT apiKey FROM user_api_keys WHERE label='n8n'\").fetchone()\n" +
    "print(row[0] if row else '')\n";
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
          let json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (_) {
            json = { raw: buf.slice(0, 800) };
          }
          resolve({ status: res.statusCode, json, raw: buf });
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function sheetsCred(key, prodId = '8JoSfkcn3pE1f0av') {
  const prod = await request('GET', `/api/v1/workflows/${prodId}`, key);
  const stock = (prod.json.nodes || []).find((n) => n.name === 'Leer Stock Propiedades');
  if (!stock?.credentials?.googleSheetsOAuth2Api) {
    throw new Error('no se encontró credencial Sheets en producción');
  }
  return {
    cred: stock.credentials.googleSheetsOAuth2Api,
    workflow: prod.json,
  };
}

/**
 * Ejecuta una cadena de HTTP Request autenticados con Sheets OAuth vía workflow temporal.
 */
async function httpSteps(key, cred, steps, namePrefix = '_TMP Sheets') {
  const pathWh = 'hlp-' + crypto.randomUUID().slice(0, 8);
  const nodes = [
    {
      id: 'wh',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: crypto.randomUUID(),
      parameters: {
        httpMethod: 'GET',
        path: pathWh,
        responseMode: 'lastNode',
        options: {},
      },
    },
  ];
  const connections = {};
  let prev = 'Webhook';
  let x = 240;
  for (const s of steps) {
    const params = {
      method: s.method || 'GET',
      url: s.url,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: {},
    };
    if (s.body !== undefined) {
      params.sendBody = true;
      params.specifyBody = 'json';
      params.jsonBody = typeof s.body === 'string' ? s.body : JSON.stringify(s.body);
    }
    nodes.push({
      id: s.name,
      name: s.name,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [x, 0],
      credentials: { googleSheetsOAuth2Api: { id: cred.id, name: cred.name } },
      parameters: params,
      onError: 'continueRegularOutput',
    });
    connections[prev] = { main: [[{ node: s.name, type: 'main', index: 0 }]] };
    prev = s.name;
    x += 220;
  }
  const created = await request('POST', '/api/v1/workflows', key, {
    name: `${namePrefix} ${pathWh}`,
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  });
  if (created.status >= 400) throw new Error('create helper fail ' + created.raw.slice(0, 300));
  const id = created.json.id;
  try {
    await request('POST', `/api/v1/workflows/${id}/activate`, key);
    await new Promise((resolve, reject) => {
      const r = http.request(
        {
          hostname: '127.0.0.1',
          port: 5678,
          path: '/webhook/' + pathWh,
          method: 'GET',
          timeout: 180000,
        },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      r.on('error', reject);
      r.end();
    });
    for (let i = 0; i < 60; i++) {
      const listEx = await request(
        'GET',
        `/api/v1/executions?workflowId=${id}&limit=2&includeData=true`,
        key,
      );
      const ex = (listEx.json?.data || [])[0];
      if (ex && (ex.status === 'success' || ex.status === 'error')) {
        const out = {};
        for (const s of steps) {
          out[s.name] = ex.data?.resultData?.runData?.[s.name]?.[0]?.data?.main?.[0]?.[0]?.json;
        }
        out._execStatus = ex.status;
        return out;
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error('timeout helper');
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${id}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${id}`, key);
  }
}

function valuesToCsv(values) {
  return (
    (values || [])
      .map((row) =>
        (row || []).map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
      )
      .join('\n') + '\n'
  );
}

module.exports = {
  ROOT,
  loadEnv,
  apiKey,
  request,
  sheetsCred,
  httpSteps,
  valuesToCsv,
};
