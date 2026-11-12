#!/usr/bin/env node
'use strict';
/**
 * Confirma que Sync Leads_Bot en vivo apunta al CRM real y escribe una fila de prueba.
 * Usa chat_id 893000099 (demo) y la deja; DEMO_CHAT_IDS la limpia después.
 */
const { loadEnv, apiKey, request, sheetsCred, httpSteps } = require('../lib/n8n-http-helper');
const { IDS } = require('../patch-mvp-f1-planillas');
const crypto = require('crypto');
const http = require('http');

const PROD = '8JoSfkcn3pE1f0av';
const CHAT = '893000099';

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
  const live = await request('GET', `/api/v1/workflows/${PROD}`, key);
  const sync = live.json.nodes.find((n) => n.name === 'Sync Leads_Bot');
  const doc = sync.parameters.documentId?.value || sync.parameters.documentId;
  if (String(doc) !== IDS.crm) {
    throw new Error('documentId Sync incorrecto: ' + doc);
  }
  if (String(doc).includes('INVALID')) throw new Error('documentId sigue roto');

  // limpia minis viejos
  const list = await request('GET', '/api/v1/workflows?limit=80', key);
  for (const w of list.json?.data || []) {
    if (String(w.name || '').startsWith('MVP-F1-')) {
      try {
        await request('POST', `/api/v1/workflows/${w.id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${w.id}`, key);
    }
  }

  const pathWh = 'mvp-f1-verify-live';
  const g = JSON.parse(JSON.stringify(sync));
  g.position = [440, 0];
  const vals = g.parameters.columns.value;
  for (const k of Object.keys(vals)) vals[k] = `={{ $json.${k} || "" }}`;

  const created = await request('POST', '/api/v1/workflows', key, {
    name: 'MVP-F1-verify-live',
    nodes: [
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
          jsCode: `return [{ json: {
  chat_id: "${CHAT}",
  canal_origen: "telegram",
  dedupe_key: "telegram:${CHAT}",
  estado_seguimiento: "ninguno",
  last_message: "verify live write F1",
  lead_name: "Verify F1",
  nombre: "Verify F1",
  presupuesto: "1",
  source: "telegram",
  status: "abierto",
  temperature: "frio",
  tipo_operacion: "compra",
  ultima_actualizacion: new Date().toISOString(),
  zona: "Godoy Cruz",
  lead_completo: "no",
  propiedad_seguimiento: "",
  bot_paused: "no",
  handoff: "no",
  senales_json: "{}",
}}];`,
        },
      },
      g,
    ],
    connections: {
      Webhook: { main: [[{ node: 'Prep', type: 'main', index: 0 }]] },
      Prep: { main: [[{ node: 'Sync Leads_Bot', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  });
  if (created.status >= 400) throw new Error(created.raw.slice(0, 300));
  const wfId = created.json.id;
  await request('POST', `/api/v1/workflows/${wfId}/activate`, key);
  await post(pathWh, {});
  await new Promise((r) => setTimeout(r, 2500));

  const { cred } = await sheetsCred(key);
  const out = await httpSteps(
    key,
    cred,
    [
      {
        name: 'LB',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Leads_Bot`,
      },
    ],
    '_TMP verify',
  );
  const header = out.LB?.values?.[0] || [];
  const idx = header.indexOf('chat_id');
  const found = (out.LB?.values || []).slice(1).some((r) => String(r[idx]) === CHAT);
  console.log(JSON.stringify({ doc, sheet: sync.parameters.sheetName?.value, found, chat: CHAT }, null, 2));

  await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
  await request('DELETE', `/api/v1/workflows/${wfId}`, key);
  if (!found) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
