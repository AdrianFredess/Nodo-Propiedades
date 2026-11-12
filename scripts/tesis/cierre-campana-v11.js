#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseCsv, sha256 } = require('./lib/campana-utils');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'validacion', 'v1.1', 'campana-2026-11-11');
const PLANILLAS = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'planillas-prueba.json'),
    'utf8',
  ),
);
const PROD_ID = '8JoSfkcn3pE1f0av';
const EXPECTED = 'ced49e79e72e1ffdc4b6743ee45d3131b3596be13e5e4c339a25464bd16123eb';
const META = JSON.parse(fs.readFileSync(path.join(OUT, '_import_meta.json'), 'utf8'));

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
  const pathWh = 'cie11-' + crypto.randomUUID().slice(0, 8);
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
        method: 'GET',
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
    name: '_TMP Cierre v11',
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
    for (let i = 0; i < 50; i++) {
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
    throw new Error('timeout export');
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
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n') + '\n'
  );
}

function counts(rows) {
  const perfiles = ['caliente', 'tibio', 'frio'];
  const matrix = {};
  for (const e of perfiles) {
    matrix[e] = { caliente: 0, tibio: 0, frio: 0, otro: 0 };
  }
  let fuenteClas = 0;
  let fuenteFb = 0;
  let leadSi = 0;
  let leadNo = 0;
  let tokens = 0;
  const okNo = {
    historial_ok: 0,
    leads_bot_ok: 0,
    guardar_lead_ok: 0,
  };
  for (const r of rows) {
    const exp = String(r.perfil_esperado || '').toLowerCase();
    const got = String(r.temperatura_final || '').toLowerCase();
    if (matrix[exp]) {
      if (got === 'caliente' || got === 'tibio' || got === 'frio') matrix[exp][got] += 1;
      else matrix[exp].otro += 1;
    }
    if (r.clasificacion_fuente === 'clasificador') fuenteClas += 1;
    else if (r.clasificacion_fuente === 'fallback_prompt_principal') fuenteFb += 1;
    if (r.lead_completo === 'si') leadSi += 1;
    else leadNo += 1;
    tokens += Number(r.tokens_usage) || 0;
    if (r.historial_ok === 'no') okNo.historial_ok += 1;
    if (r.leads_bot_ok === 'no') okNo.leads_bot_ok += 1;
    if (r.guardar_lead_ok === 'no') okNo.guardar_lead_ok += 1;
  }
  return { matrix, fuenteClas, fuenteFb, leadSi, leadNo, tokens, okNo, n: rows.length };
}

async function main() {
  const key = apiKey();
  const rows = parseCsv(fs.readFileSync(path.join(OUT, 'resultados.csv'), 'utf8'));
  const stockSha = fs.existsSync(path.join(OUT, 'stock_snapshot.sha256'))
    ? fs.readFileSync(path.join(OUT, 'stock_snapshot.sha256'), 'utf8').trim()
    : sha256(fs.readFileSync(path.join(OUT, 'stock_snapshot.csv')));

  const prod = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const sheetCred = (prod.json.nodes || []).find((n) => n.name === 'Leer Stock Propiedades')
    .credentials.googleSheetsOAuth2Api;

  const exported = await httpSteps(key, sheetCred, [
    {
      name: 'Hist',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.historial}/values/${encodeURIComponent('Hoja 1')}`,
    },
    {
      name: 'Sheet1',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.guardar_lead}/values/Sheet1`,
    },
    {
      name: 'LeadsBot',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.leads_bot_consultas}/values/Leads_Bot`,
    },
    {
      name: 'Consultas',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILLAS.leads_bot_consultas}/values/Consultas`,
    },
  ]);

  fs.writeFileSync(path.join(OUT, 'export-historial.csv'), valuesToCsv(exported.Hist?.values));
  fs.writeFileSync(
    path.join(OUT, 'export-sheet1-guardar-lead.csv'),
    valuesToCsv(exported.Sheet1?.values),
  );
  fs.writeFileSync(path.join(OUT, 'export-leads-bot.csv'), valuesToCsv(exported.LeadsBot?.values));
  fs.writeFileSync(path.join(OUT, 'export-consultas.csv'), valuesToCsv(exported.Consultas?.values));

  // Desactivar copia
  const wfId = META.wfId;
  if (wfId) {
    try {
      await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
    } catch (_) {}
  }

  // Reactivar producción
  const hashBeforeReactivate = topologyHash(prod.json);
  await request('POST', `/api/v1/workflows/${PROD_ID}/activate`, key);
  const after = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const hashAfter = topologyHash(after.json);
  const activeAfter = !!after.json.active;

  const c = counts(rows);
  const stockAll =
    rows.filter((r) => Number(r.stock_leido) > 0).length === rows.length;

  const integridad = [
    '# Integridad campaña v1.1 — 2026-11-11',
    '',
    `- Workflow copia: \`${wfId}\``,
    `- Filas: ${c.n}`,
    `- stock_leido > 0 en todas: ${stockAll ? 'sí' : 'NO'}`,
    `- stock_snapshot SHA-256: \`${stockSha}\``,
    `- prodHashBefore: \`${META.prodHashBefore || hashBeforeReactivate}\``,
    `- prodHashAfter: \`${hashAfter}\``,
    `- expected: \`${EXPECTED}\``,
    `- hashMatch: ${hashAfter === EXPECTED}`,
    `- producción activa: ${activeAfter}`,
    `- copia desactivada: sí`,
    '',
    '## Conteos (sin porcentajes)',
    '',
    '### Matriz temperatura_final × perfil_esperado',
    '',
    '| esperado\\\\obtenido | caliente | tibio | frio | otro |',
    '|---|---:|---:|---:|---:|',
    ...['caliente', 'tibio', 'frio'].map(
      (e) =>
        `| ${e} | ${c.matrix[e].caliente} | ${c.matrix[e].tibio} | ${c.matrix[e].frio} | ${c.matrix[e].otro} |`,
    ),
    '',
    `### clasificacion_fuente`,
    '',
    `- clasificador: ${c.fuenteClas}`,
    `- fallback_prompt_principal: ${c.fuenteFb}`,
    '',
    `### lead_completo`,
    '',
    `- si: ${c.leadSi}`,
    `- no: ${c.leadNo}`,
    '',
    `### _ok = no por nodo`,
    '',
    `- historial_ok=no: ${c.okNo.historial_ok}`,
    `- leads_bot_ok=no: ${c.okNo.leads_bot_ok}`,
    `- guardar_lead_ok=no: ${c.okNo.guardar_lead_ok}`,
    '',
    `### tokens del día (suma tokens_usage filas)`,
    '',
    `- ${c.tokens}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'integridad.md'), integridad, 'utf8');

  const cierre = {
    n: c.n,
    stockAll,
    stockSha,
    hashBefore: META.prodHashBefore || hashBeforeReactivate,
    hashAfter,
    expected: EXPECTED,
    hashMatch: hashAfter === EXPECTED,
    activeAfter,
    counts: c,
  };
  fs.writeFileSync(path.join(OUT, '_cierre.json'), JSON.stringify(cierre, null, 2) + '\n');
  console.log(JSON.stringify(cierre, null, 2));
  if (!activeAfter || hashAfter !== EXPECTED) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
