#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const http = require('http');
const { loadEnv, apiKey, request } = require('../lib/n8n-http-helper');

async function cleanup(key) {
  const list = await request('GET', '/api/v1/workflows?limit=80', key);
  for (const w of list.json?.data || []) {
    if (String(w.name || '').startsWith('MVP-F1-')) {
      try {
        await request('POST', `/api/v1/workflows/${w.id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${w.id}`, key);
    }
  }
}

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
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve(b));
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
  await cleanup(key);
  const live = await request('GET', '/api/v1/workflows/8JoSfkcn3pE1f0av', key);
  const sync = live.json.nodes.find((n) => n.name === 'Sync Leads_Bot');
  const det = live.json.nodes.find((n) => n.name === 'Detectar Error Escritura · Sync Leads_Bot');
  const pathWh = 'mvp-f1-broken-mini';

  const syncNode = JSON.parse(JSON.stringify(sync));
  syncNode.parameters.documentId = {
    __rl: true,
    value: 'INVALID_DOC_ID_F1_TEST_MVP',
    mode: 'id',
  };
  const vals = syncNode.parameters.columns.value;
  for (const k of Object.keys(vals)) {
    vals[k] = `={{ $json.${k} || "" }}`;
  }
  syncNode.position = [440, 0];

  let code = det.parameters.jsCode.replace(
    'const due = !st.lastSentAt || now - Number(st.lastSentAt) >= SHEETS_WRITE_ALERT_MS;',
    'const distinct = new Set((st.pending || []).map((p) => p.chat_id));\nconst due = distinct.size >= 3;',
  );

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
      // Mismo nombre que usa el detect como fallback de chat_id
      // (Sync con continueRegularOutput solo emite { error }).
      name: 'Set Variables',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 0],
      parameters: {
        jsCode: `const b = $json.body || $json;
const chat = String(b.chat_id || '');
return [{
  json: {
    chat_id: chat,
    canal_origen: 'telegram',
    dedupe_key: 'telegram:' + chat,
    estado_seguimiento: 'ninguno',
    last_message: 'x',
    lead_name: 't',
    nombre: 't',
    presupuesto: '1',
    source: 'telegram',
    status: 'abierto',
    temperature: 'frio',
    tipo_operacion: 'compra',
    ultima_actualizacion: new Date().toISOString(),
    zona: 'x',
    lead_completo: 'si',
    propiedad_seguimiento: '',
    bot_paused: 'no',
    handoff: 'no',
    senales_json: '{}',
  },
}];`,
      },
    },
    syncNode,
    {
      id: det.id,
      name: det.name,
      type: det.type,
      typeVersion: det.typeVersion,
      position: [660, 0],
      parameters: { jsCode: code },
    },
  ];

  const connections = {
    Webhook: { main: [[{ node: 'Set Variables', type: 'main', index: 0 }]] },
    'Set Variables': { main: [[{ node: 'Sync Leads_Bot', type: 'main', index: 0 }]] },
    'Sync Leads_Bot': { main: [[{ node: det.name, type: 'main', index: 0 }]] },
  };

  const created = await request('POST', '/api/v1/workflows', key, {
    name: 'MVP-F1-broken-mini',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  });
  if (created.status >= 400) throw new Error(created.raw.slice(0, 400));
  const wfId = created.json.id;
  await request('POST', `/api/v1/workflows/${wfId}/activate`, key);

  for (const id of [893000001, 893000002, 893000003]) {
    await post(pathWh, { chat_id: id });
    await new Promise((r) => setTimeout(r, 1200));
  }

  const listEx = await request(
    'GET',
    `/api/v1/executions?workflowId=${wfId}&limit=5&includeData=true`,
    key,
  );
  let flushes = 0;
  let sample = '';
  for (const row of listEx.json?.data || []) {
    const full = await request('GET', `/api/v1/executions/${row.id}?includeData=true`, key);
    const run = full.json?.data?.resultData?.runData || {};
    const syncOut = run['Sync Leads_Bot']?.[0]?.data?.main?.[0]?.[0]?.json;
    const detOut = run[det.name]?.[0]?.data?.main?.[0]?.[0]?.json;
    console.log(
      JSON.stringify({
        id: row.id,
        syncError: syncOut?.error || run['Sync Leads_Bot']?.[0]?.error || null,
        syncKeys: Object.keys(syncOut || {}),
        alertar: detOut?.alertar_escritura_sheets,
        writeOk: detOut?._write_sheets_ok,
        err: detOut?._write_sheets_error,
        text: (detOut?.escritura_alerta_texto || '').slice(0, 120),
      }),
    );
    if (detOut?.alertar_escritura_sheets) {
      flushes += 1;
      sample = detOut.escritura_alerta_texto || '';
    }
  }

  const chats = [893000001, 893000002, 893000003].filter((c) =>
    String(sample).includes(String(c)),
  );
  console.log(JSON.stringify({ flushes, chats, sample: String(sample).slice(0, 500), ok: flushes === 1 && chats.length === 3 }, null, 2));

  await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
  await request('DELETE', `/api/v1/workflows/${wfId}`, key);
  if (!(flushes === 1 && chats.length === 3)) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
