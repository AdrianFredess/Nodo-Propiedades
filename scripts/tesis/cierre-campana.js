#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseCsv, sha256 } = require('./lib/campana-utils');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3-2026-11-11');
const PLANILLAS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'planillas-prueba.json'), 'utf8'),
);
const PROD_ID = '8JoSfkcn3pE1f0av';
const META = JSON.parse(fs.readFileSync(path.join(OUT, '_import_meta.json'), 'utf8'));

function apiKey() {
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
            json = { raw: buf.slice(0, 500) };
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

function topologyHash(wf) {
  const nodes = (wf.nodes || [])
    .map((n) => ({ name: n.name, type: n.type, disabled: !!n.disabled, params: n.parameters }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return sha256(JSON.stringify({ nodes, connections: wf.connections || {} }));
}

async function httpSteps(key, cred, steps) {
  const pathWh = 'cie-' + crypto.randomUUID().slice(0, 8);
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
    nodes.push({
      id: s.name,
      name: s.name,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [x, 0],
      credentials: { googleSheetsOAuth2Api: { id: cred.id, name: cred.name } },
      parameters: {
        method: s.method,
        url: s.url,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        options: {},
      },
      onError: 'continueRegularOutput',
    });
    connections[prev] = { main: [[{ node: s.name, type: 'main', index: 0 }]] };
    prev = s.name;
    x += 220;
  }
  const created = await request('POST', '/api/v1/workflows', key, {
    name: '_TMP Cierre',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  });
  const id = created.json.id;
  try {
    await request('POST', `/api/v1/workflows/${id}/activate`, key);
    await new Promise((resolve, reject) => {
      const r = http.request(
        { hostname: '127.0.0.1', port: 5678, path: '/webhook/' + pathWh, method: 'GET', timeout: 120000 },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      r.on('error', reject);
      r.end();
    });
    for (let i = 0; i < 40; i++) {
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
        return out;
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error('timeout');
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
      .map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n') + '\n'
  );
}

async function main() {
  const key = apiKey();
  const prod0 = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const sheetCred = (prod0.json.nodes || []).find((n) => n.name === 'Leer Stock Propiedades')
    .credentials.googleSheetsOAuth2Api;

  const exports = await httpSteps(key, sheetCred, [
    {
      name: 'Hist',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.historial}/values/Hoja%201`,
    },
    {
      name: 'Sheet1',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.guardar_lead}/values/Sheet1`,
    },
    {
      name: 'LeadsBot',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.leads_bot_consultas}/values/Leads_Bot`,
    },
    {
      name: 'Consultas',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.leads_bot_consultas}/values/Consultas`,
    },
  ]);

  fs.writeFileSync(path.join(OUT, 'export-historial.csv'), valuesToCsv(exports.Hist?.values));
  fs.writeFileSync(path.join(OUT, 'export-sheet1-guardar-lead.csv'), valuesToCsv(exports.Sheet1?.values));
  fs.writeFileSync(path.join(OUT, 'export-leads-bot.csv'), valuesToCsv(exports.LeadsBot?.values));
  fs.writeFileSync(path.join(OUT, 'export-consultas.csv'), valuesToCsv(exports.Consultas?.values));

  // deactivate copy
  await request('POST', `/api/v1/workflows/${META.wfId}/deactivate`, key);

  // reactivate prod
  await request('POST', `/api/v1/workflows/${PROD_ID}/activate`, key);
  const prod1 = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const prodHashAfter = topologyHash(prod1.json);

  const rows = parseCsv(fs.readFileSync(path.join(OUT, 'resultados.csv'), 'utf8'));
  const counts = {
    total: rows.length,
    stock_ok: rows.filter((r) => Number(r.stock_leido) > 0).length,
    con_tag: rows.filter((r) => r.temperatura_estado_actual && r.temperatura_estado_actual !== 'sin_tag').length,
    sin_tag: rows.filter((r) => r.temperatura_estado_actual === 'sin_tag').length,
    lead_completo: rows.filter((r) => r.lead_completo === 'si').length,
    es_rescate: rows.filter((r) => r.es_rescate === 'si').length,
    historial_no: rows.filter((r) => r.historial_ok === 'no').length,
    leads_bot_no: rows.filter((r) => r.leads_bot_ok === 'no').length,
    guardar_lead_no: rows.filter((r) => r.guardar_lead_ok === 'no').length,
    intentos_extra: rows.filter((r) => Number(r.intento) > 1).length,
    fallos_notas: rows.filter((r) => r.notas && /fallo|error|timeout|429/i.test(r.notas)).length,
  };

  const byTemp = {};
  for (const r of rows) {
    const t = r.temperatura_estado_actual || '(vacio)';
    byTemp[t] = (byTemp[t] || 0) + 1;
  }

  const cierre = {
    prodHashBefore: META.prodHashBefore,
    prodHashAfter,
    prodHashSame: META.prodHashBefore === prodHashAfter,
    prodActiveAfter: !!prod1.json.active,
    exportRows: {
      historial: (exports.Hist?.values || []).length,
      sheet1: (exports.Sheet1?.values || []).length,
      leads_bot: (exports.LeadsBot?.values || []).length,
      consultas: (exports.Consultas?.values || []).length,
    },
    counts,
    byTemp,
  };
  fs.writeFileSync(path.join(OUT, '_cierre.json'), JSON.stringify(cierre, null, 2));
  console.log(JSON.stringify(cierre, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
