#!/usr/bin/env node
'use strict';

/**
 * Lectura temporal de stock (F1.2). Crea un workflow de 1 nodo, lo ejecuta y lo borra.
 * No imprime secretos.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const STOCK_ID = '1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU';

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] == null || process.env[m[1]] === '') process.env[m[1]] = v;
  }
}

function apiKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  // Preferir label estable "n8n" (la key "MCP Server API Key" a veces queda 401).
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
        timeout: 120000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (_) {
            json = { raw: buf.slice(0, 400) };
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

async function main() {
  loadEnv();
  const key = apiKey();
  if (!key) {
    console.error('NO_API_KEY');
    process.exit(2);
  }

  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  if (list.status >= 400) {
    console.error('LIST_FAIL', list.status);
    process.exit(2);
  }
  const prod = (list.json?.data || []).find((w) => w.id === '8JoSfkcn3pE1f0av');
  let cred = null;
  if (prod) {
    const full = await request('GET', '/api/v1/workflows/' + prod.id, key);
    const stockNode = (full.json?.nodes || []).find((n) => n.name === 'Leer Stock Propiedades');
    cred = stockNode?.credentials?.googleSheetsOAuth2Api;
  }
  if (!cred?.id) {
    console.error('NO_SHEETS_CREDENTIAL_ON_PROD');
    process.exit(2);
  }

  const pathWh = 'tesis-probe-stock-' + Date.now();
  const wf = {
    name: '_TMP Probe Stock Tesis',
    nodes: [
      {
        id: 'wh',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: require('crypto').randomUUID(),
        parameters: {
          httpMethod: 'GET',
          path: pathWh,
          responseMode: 'onReceived',
          options: {},
        },
      },
      {
        id: 'stock',
        name: 'Leer Stock Propiedades',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.5,
        position: [280, 0],
        credentials: { googleSheetsOAuth2Api: { id: cred.id, name: cred.name } },
        parameters: {
          operation: 'read',
          documentId: { __rl: true, mode: 'id', value: STOCK_ID },
          sheetName: { __rl: true, mode: 'name', value: 'Hoja 1' },
          options: {},
        },
        onError: 'continueRegularOutput',
      },
    ],
    connections: {
      Webhook: { main: [[{ node: 'Leer Stock Propiedades', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };

  const created = await request('POST', '/api/v1/workflows', key, wf);
  if (created.status >= 400) {
    console.error('CREATE_FAIL', created.status, String(created.raw).slice(0, 200));
    process.exit(2);
  }
  const id = created.json.id;
  try {
    await request('POST', `/api/v1/workflows/${id}/activate`, key);
    const after = new Date().toISOString();
    await new Promise((resolve, reject) => {
      const r = http.request(
        {
          hostname: '127.0.0.1',
          port: 5678,
          path: '/webhook/' + pathWh,
          method: 'GET',
          timeout: 60000,
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      r.on('error', reject);
      r.end();
    });

    let items = [];
    let errMsg = '';
    for (let i = 0; i < 40; i++) {
      const listEx = await request(
        'GET',
        `/api/v1/executions?workflowId=${id}&limit=3&includeData=true`,
        key,
      );
      const ex = (listEx.json?.data || []).find(
        (e) =>
          (!after || (e.startedAt && e.startedAt >= after.slice(0, 19))) &&
          (e.status === 'success' || e.status === 'error'),
      );
      if (ex) {
        const main =
          ex.data?.resultData?.runData?.['Leer Stock Propiedades']?.[0]?.data?.main?.[0] || [];
        items = main.map((x) => x.json || {});
        errMsg = ex.data?.resultData?.error?.message || '';
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    let rows = 0;
    let sampleErr = '';
    for (const j of items) {
      if (j.error) {
        sampleErr =
          typeof j.error === 'string' ? j.error : j.error.message || JSON.stringify(j.error);
        continue;
      }
      const keys = Object.keys(j);
      if (keys.length === 1 && keys[0] === 'error') continue;
      rows += 1;
    }

    console.log(
      JSON.stringify({
        ok: rows > 0,
        rows,
        sampleErr: sampleErr || errMsg || null,
        credentialName: cred.name || null,
      }),
    );
    process.exit(rows > 0 ? 0 : 1);
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${id}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${id}`, key);
  }
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(2);
});
