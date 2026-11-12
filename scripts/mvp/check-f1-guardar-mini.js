#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const http = require('http');
const { loadEnv, apiKey, request, sheetsCred, httpSteps } = require('../lib/n8n-http-helper');
const { IDS } = require('../patch-mvp-f1-planillas');

function post(pathWh, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: '/webhook/' + pathWh,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

async function main() {
  loadEnv();
  const key = apiKey();
  const live = await request('GET', '/api/v1/workflows/8JoSfkcn3pE1f0av', key);
  const guardar = live.json.nodes.find((n) => n.name === 'Guardar Lead');
  const det = live.json.nodes.find((n) => n.name === 'Detectar Error Escritura · Guardar Lead');
  const pathWh = 'mvp-f1-guardar-mini';

  const list = await request('GET', '/api/v1/workflows?limit=80', key);
  for (const w of list.json?.data || []) {
    if (String(w.name || '').startsWith('MVP-F1-guardar')) {
      try {
        await request('POST', `/api/v1/workflows/${w.id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${w.id}`, key);
    }
  }

  const g = JSON.parse(JSON.stringify(guardar));
  g.position = [440, 0];
  const vals = g.parameters.columns.value;
  for (const k of Object.keys(vals)) vals[k] = `={{ $json.${k} || "" }}`;

  const nodes = [
    {
      id: 'wh',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: crypto.randomUUID(),
      parameters: {
        httpMethod: 'POST',
        path: pathWh,
        responseMode: 'lastNode',
        options: {},
      },
    },
    {
      id: 'prep',
      name: 'Prep',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 0],
      parameters: {
        jsCode: `const b = $json.body || $json;
return [{
  json: {
    chat_id: String(b.chat_id),
    fecha: new Date().toISOString(),
    nombre: String(b.nombre || 'Lead Completo F1'),
    presupuesto: '95000 USD',
    resumen: 'Lead completo de prueba F1',
    temperatura: 'caliente',
    tipo_operacion: 'compra',
    zona: 'Godoy Cruz',
  },
}];`,
      },
    },
    g,
    {
      id: det.id,
      name: det.name,
      type: det.type,
      typeVersion: 2,
      position: [660, 0],
      parameters: { jsCode: det.parameters.jsCode },
    },
  ];
  const connections = {
    Webhook: { main: [[{ node: 'Prep', type: 'main', index: 0 }]] },
    Prep: { main: [[{ node: 'Guardar Lead', type: 'main', index: 0 }]] },
    'Guardar Lead': { main: [[{ node: det.name, type: 'main', index: 0 }]] },
  };

  const created = await request('POST', '/api/v1/workflows', key, {
    name: 'MVP-F1-guardar-mini',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  });
  if (created.status >= 400) throw new Error(created.raw.slice(0, 300));
  const wfId = created.json.id;
  await request('POST', `/api/v1/workflows/${wfId}/activate`, key);

  const chats = [893000001, 893000002, 893000003];
  for (const id of chats) {
    await post(pathWh, { chat_id: id, nombre: 'Lead ' + id });
    await new Promise((r) => setTimeout(r, 800));
  }

  const { cred } = await sheetsCred(key);
  const out = await httpSteps(
    key,
    cred,
    [
      {
        name: 'LC',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}/values/${encodeURIComponent('Leads_Completos')}`,
      },
    ],
    '_TMP lc',
  );
  const header = out.LC?.values?.[0] || [];
  const idx = header.indexOf('chat_id');
  const found = chats.filter((c) =>
    (out.LC?.values || []).slice(1).some((r) => String(r[idx]) === String(c)),
  );
  console.log(JSON.stringify({ found, sheet: g.parameters.sheetName, ok: found.length === 3 }, null, 2));

  await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
  await request('DELETE', `/api/v1/workflows/${wfId}`, key);
  if (found.length !== 3) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
