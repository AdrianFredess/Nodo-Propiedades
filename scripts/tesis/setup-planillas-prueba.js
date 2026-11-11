#!/usr/bin/env node
'use strict';

/**
 * Prepara planillas de prueba solo con Sheets API (Drive copy no disponible).
 * - historial: usa copia existente de conversaciones
 * - guardar_lead: en copia leads_bot crea Sheet1 + headers del tag
 * - leads_bot_consultas: crea spreadsheet nuevo con tabs Leads_Bot/Consultas
 *   y los encabezados leídos de la planilla real de prod (1a84OL3Y…)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT_JSON = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'planillas-prueba.json');
const OUT_NOTE = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'desvio-planillas.md');

const EXISTING = {
  historial: '17OcN_WHHrAchUAfTxLTrjsB-cpz8nB1H2p6eeVvS_XM',
  guardar_lead: '1LzSwmJYnrQ5Rc1SpCpY19rLe86LVDfnv2mM1w1aPBiY',
};
const PROD_CRM = '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ';
const GUARDAR_HEADERS = [
  'chat_id',
  'fecha',
  'nombre',
  'presupuesto',
  'resumen',
  'temperatura',
  'tipo_operacion',
  'zona',
];

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

async function getCred(key) {
  const full = await request('GET', '/api/v1/workflows/8JoSfkcn3pE1f0av', key);
  const stockNode = (full.json.nodes || []).find((n) => n.name === 'Leer Stock Propiedades');
  return stockNode.credentials.googleSheetsOAuth2Api;
}

async function runHttpWorkflow(key, cred, steps) {
  const pathWh = 'setup2-' + crypto.randomUUID().slice(0, 8);
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
  steps.forEach((s, idx) => {
    const name = s.name || 'Step' + idx;
    const params = {
      method: s.method,
      url: s.url,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: {},
    };
    if (s.body !== undefined) {
      params.sendBody = true;
      params.specifyBody = 'json';
      params.jsonBody = JSON.stringify(s.body);
    }
    nodes.push({
      id: name,
      name,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [x, 0],
      credentials: { googleSheetsOAuth2Api: { id: cred.id, name: cred.name } },
      parameters: params,
      onError: 'continueRegularOutput',
    });
    connections[prev] = { main: [[{ node: name, type: 'main', index: 0 }]] };
    prev = name;
    x += 220;
  });

  const created = await request('POST', '/api/v1/workflows', key, {
    name: '_TMP Setup Planillas2',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  });
  if (created.status >= 400) throw new Error('create ' + created.status + ' ' + created.raw.slice(0, 200));
  const id = created.json.id;
  try {
    await request('POST', `/api/v1/workflows/${id}/activate`, key);
    await new Promise((resolve, reject) => {
      const r = http.request(
        { hostname: '127.0.0.1', port: 5678, path: '/webhook/' + pathWh, method: 'GET', timeout: 180000 },
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
        `/api/v1/executions?workflowId=${id}&limit=3&includeData=true`,
        key,
      );
      const ex = (listEx.json?.data || [])[0];
      if (ex && (ex.status === 'success' || ex.status === 'error')) {
        const out = {};
        for (const s of steps) {
          const item = ex.data?.resultData?.runData?.[s.name]?.[0]?.data?.main?.[0]?.[0]?.json;
          out[s.name] = item || { error: ex.data?.resultData?.error?.message || 'empty' };
        }
        return out;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('timeout');
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${id}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${id}`, key);
  }
}

function firstRow(valuesObj) {
  if (Array.isArray(valuesObj)) return valuesObj;
  if (valuesObj?.values?.[0]) return valuesObj.values[0];
  return [];
}

async function main() {
  const key = apiKey();
  const cred = await getCred(key);

  // Leer headers reales del CRM de producción
  const hdr = await runHttpWorkflow(key, cred, [
    {
      name: 'HdrLeads',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PROD_CRM}/values/Leads_Bot!1:1`,
    },
    {
      name: 'HdrConsultas',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${PROD_CRM}/values/Consultas!1:1`,
    },
    {
      name: 'MetaGuardar',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${EXISTING.guardar_lead}?fields=sheets.properties(title,sheetId)`,
    },
  ]);

  const leadsHeaders = firstRow(hdr.HdrLeads);
  const consultasHeaders = firstRow(hdr.HdrConsultas);
  if (!leadsHeaders.length || !consultasHeaders.length) {
    console.error(JSON.stringify(hdr, null, 2));
    throw new Error('No pude leer encabezados Leads_Bot/Consultas de prod');
  }

  const tabs = (hdr.MetaGuardar?.sheets || []).map((s) => s.properties?.title);
  const hasSheet1 = tabs.includes('Sheet1');

  const steps2 = [];
  if (!hasSheet1) {
    steps2.push({
      name: 'AddSheet1',
      method: 'POST',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${EXISTING.guardar_lead}:batchUpdate`,
      body: { requests: [{ addSheet: { properties: { title: 'Sheet1' } } }] },
    });
  }
  steps2.push({
    name: 'HeadersSheet1',
    method: 'PUT',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${EXISTING.guardar_lead}/values/Sheet1!A1:H1?valueInputOption=RAW`,
    body: { values: [GUARDAR_HEADERS] },
  });
  steps2.push({
    name: 'ClearHist',
    method: 'POST',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${EXISTING.historial}/values/Hoja%201!A2:ZZ:clear`,
    body: {},
  });
  steps2.push({
    name: 'CreateCrm',
    method: 'POST',
    url: 'https://sheets.googleapis.com/v4/spreadsheets',
    body: {
      properties: { title: 'TESIS-prueba Leads_Bot Consultas' },
      sheets: [{ properties: { title: 'Leads_Bot' } }, { properties: { title: 'Consultas' } }],
    },
  });

  const prep = await runHttpWorkflow(key, cred, steps2);
  const crmId = prep.CreateCrm?.spreadsheetId;
  if (!crmId) {
    console.error(JSON.stringify(prep, null, 2));
    throw new Error('No se creó spreadsheet CRM');
  }

  const fill = await runHttpWorkflow(key, cred, [
    {
      name: 'PutLeadsHdr',
      method: 'PUT',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${crmId}/values/Leads_Bot!1:1?valueInputOption=RAW`,
      body: { values: [leadsHeaders] },
    },
    {
      name: 'PutConsultasHdr',
      method: 'PUT',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${crmId}/values/Consultas!1:1?valueInputOption=RAW`,
      body: { values: [consultasHeaders] },
    },
  ]);

  const planillas = {
    historial: EXISTING.historial,
    guardar_lead: EXISTING.guardar_lead,
    leads_bot_consultas: crmId,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(planillas, null, 2) + '\n');

  fs.writeFileSync(
    OUT_NOTE,
    [
      '# Desvío planillas — campaña 3f132c3',
      '',
      '## Problema',
      '- Tag: Guardar Lead → `18eZ…` / `Sheet1` + `chat_id`.',
      '- Realidad Drive: ese archivo no tiene `Sheet1` (solo `Hoja 1` vacía).',
      '- Prompt: CRM `1-0IBpa…`. Producción actual: `1a84OL3Y…` con tabs `Leads_Bot` y `Consultas`.',
      '- Drive API deshabilitada en el proyecto Google → no se pudo “Hacer una copia” por API.',
      '',
      '## Solución aplicada (pedido de Adrián: solucionar todo)',
      `- historial: copia ya hecha por Adrián \`${EXISTING.historial}\` + clear A2:ZZ.`,
      `- guardar_lead: copia \`${EXISTING.guardar_lead}\` + creación de \`Sheet1\` con columnas del tag.`,
      `- leads_bot_consultas: spreadsheet nuevo \`${crmId}\` con headers de prod \`Leads_Bot\`/\`Consultas\`.`,
      '',
      '## Headers CRM (prod)',
      `- Leads_Bot: ${leadsHeaders.join(' | ')}`,
      `- Consultas: ${consultasHeaders.join(' | ')}`,
      '',
      '```json',
      JSON.stringify(planillas, null, 2),
      '```',
      '',
    ].join('\n'),
  );

  console.log(JSON.stringify({ planillas, hasSheet1Before: hasSheet1, fill, leadsHeaders, consultasHeaders }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
