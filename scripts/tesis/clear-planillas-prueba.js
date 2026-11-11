#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const planillas = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'planillas-prueba.json'),
    'utf8',
  ),
);

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
  const key = apiKey();
  const prod = await request('GET', '/api/v1/workflows/8JoSfkcn3pE1f0av', key);
  const cred = (prod.json.nodes || []).find((n) => n.name === 'Leer Stock Propiedades')
    .credentials.googleSheetsOAuth2Api;

  const clears = [
    { id: planillas.historial, range: 'Hoja 1!A2:ZZ' },
    { id: planillas.guardar_lead, range: 'Sheet1!A2:ZZ' },
    { id: planillas.leads_bot_consultas, range: 'Leads_Bot!A2:ZZ' },
    { id: planillas.leads_bot_consultas, range: 'Consultas!A2:ZZ' },
  ];

  const pathWh = 'clr-' + crypto.randomUUID().slice(0, 8);
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
  clears.forEach((c, i) => {
    const name = 'C' + i;
    nodes.push({
      id: name,
      name,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [x, 0],
      credentials: { googleSheetsOAuth2Api: { id: cred.id, name: cred.name } },
      parameters: {
        method: 'POST',
        url:
          'https://sheets.googleapis.com/v4/spreadsheets/' +
          c.id +
          '/values/' +
          encodeURIComponent(c.range) +
          ':clear',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '{}',
        options: {},
      },
      onError: 'continueRegularOutput',
    });
    connections[prev] = { main: [[{ node: name, type: 'main', index: 0 }]] };
    prev = name;
    x += 220;
  });

  const created = await request('POST', '/api/v1/workflows', key, {
    name: '_TMP Clear Sheets v11',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  });
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
          timeout: 120000,
        },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      r.on('error', reject);
      r.end();
    });
    for (let i = 0; i < 40; i++) {
      const list = await request(
        'GET',
        `/api/v1/executions?workflowId=${id}&limit=2&includeData=true`,
        key,
      );
      const ex = (list.json?.data || [])[0];
      if (ex && (ex.status === 'success' || ex.status === 'error')) {
        const out = {};
        for (let j = 0; j < clears.length; j++) {
          out['C' + j] = ex.data?.resultData?.runData?.['C' + j]?.[0]?.data?.main?.[0]?.[0]?.json;
        }
        console.log(JSON.stringify({ ok: true, clears: out }, null, 2));
        return;
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error('timeout clear');
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${id}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${id}`, key);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
