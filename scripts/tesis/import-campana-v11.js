#!/usr/bin/env node
'use strict';

/**
 * Importa la copia TESIS-v1.1, verifica hashes + SYSTEM_MIN, snapshot de stock.
 * No pausa producción (eso es STOP manual en F4).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { EXPECTED_HASHES, sha256 } = require('./lib/campana-utils');
const { systemMinFromAnexo } = require('./lib/v11-shared');

const ROOT = path.join(__dirname, '..', '..');
const WF_PATH = path.join(ROOT, 'workflows', 'tesis', 'TESIS-v1.1-campana.json');
const OUT_DIR = path.join(
  ROOT,
  'docs',
  'validacion',
  'v1.1',
  `campana-${new Date().toISOString().slice(0, 10)}`,
);
const PROD_ID = '8JoSfkcn3pE1f0av';
const TEST_CRM = '1tjwpgB4V5kd_IsR3BY_bAFc4K5aTp0BdcYhC4fzVia8';
const CONSULTAS_HEADERS = [
  'consulta_id',
  'chat_id',
  'fecha',
  'fecha_local',
  'anio',
  'mes',
  'canal_origen',
  'nombre',
  'mensaje_cliente',
  'respuesta_bot',
  'intencion',
  'operacion',
  'zona',
  'presupuesto',
  'temperature',
  'lead_completo',
  'es_nueva_consulta',
];

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

function topologyHash(wf) {
  const nodes = (wf.nodes || [])
    .map((n) => ({
      name: n.name,
      type: n.type,
      disabled: !!n.disabled,
      params: n.parameters,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return sha256(JSON.stringify({ nodes, connections: wf.connections || {} }));
}

function hashesV11(wf) {
  const by = (name) => (wf.nodes || []).find((n) => n.name === name);
  return {
    construir_prompt: sha256(by('Construir Prompt')?.parameters?.jsCode),
    parsear_respuesta_base: sha256(by('Parsear Respuesta Base')?.parameters?.jsCode),
    http_groq_body: sha256(by('HTTP Groq')?.parameters?.jsonBody),
    system_min: (() => {
      const code = by('Preparar Clasificación')?.parameters?.jsCode || '';
      const m = code.match(/const SYSTEM_MIN = ("(?:\\.|[^"\\])*")/);
      if (!m) return '';
      return sha256(JSON.parse(m[1]));
    })(),
  };
}

async function httpSteps(key, cred, steps) {
  const pathWh = 'imp11-' + crypto.randomUUID().slice(0, 8);
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
    name: '_TMP Import Helper v11',
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
    throw new Error('timeout helper');
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${id}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${id}`, key);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const key = apiKey();
  const src = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  const expectedSm = sha256(systemMinFromAnexo());
  const baseHashes = hashesV11(src);
  if (baseHashes.construir_prompt !== EXPECTED_HASHES.construir_prompt) {
    throw new Error('construir hash mismatch');
  }
  if (baseHashes.parsear_respuesta_base !== EXPECTED_HASHES.parsear_respuesta) {
    throw new Error('parsear base hash mismatch');
  }
  if (baseHashes.http_groq_body !== EXPECTED_HASHES.http_groq_body) {
    throw new Error('groq body hash mismatch');
  }
  if (baseHashes.system_min !== expectedSm) {
    throw new Error(`SYSTEM_MIN hash ${baseHashes.system_min} != ${expectedSm}`);
  }
  const clas = (src.nodes || []).find((n) => n.name === 'HTTP Groq Clasificador');
  if (!clas || clas.disabled) throw new Error('HTTP Groq Clasificador debe estar habilitado');

  const prod = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const prodHashBefore = topologyHash(prod.json);
  const prodActiveBefore = !!prod.json.active;
  const stockNode = (prod.json.nodes || []).find((n) => n.name === 'Leer Stock Propiedades');
  const sheetCred = stockNode.credentials.googleSheetsOAuth2Api;

  await httpSteps(key, sheetCred, [
    {
      name: 'PutConsultas',
      method: 'PUT',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${TEST_CRM}/values/Consultas!A1:Q1?valueInputOption=RAW`,
      body: { values: [CONSULTAS_HEADERS] },
    },
  ]);

  for (const n of src.nodes) {
    if (n.credentials?.googleSheetsOAuth2Api) {
      n.credentials.googleSheetsOAuth2Api = {
        id: sheetCred.id,
        name: sheetCred.name || 'Cuenta de Google Sheets',
      };
    }
  }

  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  for (const w of list.json?.data || []) {
    if (String(w.name || '').startsWith('TESIS-v1.1 Campaña')) {
      try {
        await request('POST', `/api/v1/workflows/${w.id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${w.id}`, key);
    }
  }

  const payload = {
    name: src.name,
    nodes: src.nodes,
    connections: src.connections,
    settings: { executionOrder: (src.settings && src.settings.executionOrder) || 'v1' },
  };
  const created = await request('POST', '/api/v1/workflows', key, payload);
  if (created.status >= 400) throw new Error('import fail ' + created.raw.slice(0, 300));
  const wfId = created.json.id;
  const fetched = await request('GET', `/api/v1/workflows/${wfId}`, key);
  const copyHashes = hashesV11(fetched.json);
  if (copyHashes.system_min !== expectedSm) {
    throw new Error('SYSTEM_MIN en instancia no coincide');
  }
  if (copyHashes.parsear_respuesta_base !== EXPECTED_HASHES.parsear_respuesta) {
    throw new Error('Parsear Base hash en instancia no coincide');
  }

  const stockId = '1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU';
  const snap = await httpSteps(key, sheetCred, [
    {
      name: 'Stock',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${stockId}/values/Hoja%201`,
    },
  ]);
  const values = snap.Stock?.values || [];
  const stockCsv =
    values.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') +
    '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'stock_snapshot.csv'), stockCsv);
  const stockSha = sha256(stockCsv);
  fs.writeFileSync(path.join(OUT_DIR, 'stock_snapshot.sha256'), stockSha + '\n');

  await request('POST', `/api/v1/workflows/${wfId}/activate`, key);

  const envPath = path.join(ROOT, '.env');
  let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (!/^N8N_BASE_URL=/m.test(envText)) envText += `\nN8N_BASE_URL=http://127.0.0.1:5678\n`;
  if (/^WORKFLOW_ID=/m.test(envText)) {
    envText = envText.replace(/^WORKFLOW_ID=.*$/m, `WORKFLOW_ID=${wfId}`);
  } else {
    envText += `WORKFLOW_ID=${wfId}\n`;
  }
  fs.writeFileSync(envPath, envText);

  const meta = {
    wfId,
    copyHashes,
    expectedSm,
    prodHashBefore,
    prodActiveBefore,
    stockRows: Math.max(0, values.length - 1),
    stockSha,
    outDir: OUT_DIR,
    note: 'Producción NO pausada por este script — requiere OK de Adrián',
  };
  fs.writeFileSync(path.join(OUT_DIR, '_import_meta.json'), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
