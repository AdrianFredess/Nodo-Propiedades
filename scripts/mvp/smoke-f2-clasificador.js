#!/usr/bin/env node
'use strict';

/**
 * Smoke Fase 2: 6 mensajes (CAL-03, CAL-09, TIB-12, TIB-15, FRI-21, hola).
 * Copia webhook del bot con efectos TG/email/emit deshabilitados.
 */
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv, apiKey, request, ROOT } = require('../lib/n8n-http-helper');

const PROD = '8JoSfkcn3pE1f0av';
const DISABLE = new Set([
  'Telegram Responder',
  'Telegram Enviar Foto',
  'Telegram Alerta Owner',
  'Email Lead Caliente',
  'Emit Panel Realtime',
  'Emit Lead Updated',
  'Telegram Alerta Owner RL',
  'Telegram Mensaje Cierre',
]);

const MSGS = [
  {
    id: 'CAL-03',
    expect: 'caliente',
    chat_id: 893000101,
    text: 'Soy Lucía, quiero comprar PH en Chacras hasta 220k, prioritario este mes, ¿qué tenés disponible hoy?',
  },
  {
    id: 'CAL-09',
    expect: 'caliente',
    chat_id: 893000109,
    text: 'Soy Flor, depto 2 dorm en Nueva Ciudad, compra hasta 110000, urgencia por alquiler que vence',
  },
  {
    id: 'TIB-12',
    expect: 'tibio',
    chat_id: 893000112,
    text: 'Buenas, me interesa ver opciones de casas en Luján pero sin apuro. Presupuesto más o menos 100-130k',
  },
  {
    id: 'TIB-15',
    expect: 'tibio',
    chat_id: 893000115,
    text: 'Estoy comparando alquiler vs compra de un local chico en Guaymallén, no tengo fecha firme',
  },
  {
    id: 'FRI-21',
    expect: 'frio',
    chat_id: 893000121,
    text: 'Hola, solo miraba el catálogo, no busco nada en particular',
  },
  { id: 'HOLA', expect: null, chat_id: 893000199, text: 'hola' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
        timeout: 300000,
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

async function cleanup(key) {
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  for (const w of list.json?.data || []) {
    if (String(w.name || '').startsWith('MVP-F2-')) {
      try {
        await request('POST', `/api/v1/workflows/${w.id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${w.id}`, key);
    }
  }
}

async function main() {
  loadEnv();
  const key = apiKey();
  await cleanup(key);
  const live = await request('GET', `/api/v1/workflows/${PROD}`, key);
  const src = JSON.parse(JSON.stringify(live.json));
  const trigger = src.nodes.find((n) => n.name === 'Telegram Trigger');
  const pathWh = 'mvp-f2-smoke-clasif';
  src.nodes = src.nodes.filter((n) => n.name !== 'Telegram Trigger');
  src.nodes.push(
    {
      id: trigger.id,
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: trigger.position,
      webhookId: crypto.randomUUID(),
      parameters: {
        httpMethod: 'POST',
        path: pathWh,
        responseMode: 'onReceived',
        options: {},
      },
    },
    {
      id: 'norm-f2',
      name: 'Normalizar Update Telegram',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [trigger.position[0] + 200, trigger.position[1]],
      parameters: {
        jsCode: `const raw=$json||{}; const body=raw.body&&typeof raw.body==='object'?raw.body:raw; return [{json: body.message?body:{message:body}}];`,
      },
    },
  );
  for (const n of src.nodes) {
    if (DISABLE.has(n.name) || String(n.name).startsWith('Telegram Alerta Escritura')) {
      n.disabled = true;
    }
    if (n.name === 'Transcribir Audio TG' && n.parameters?.jsCode) {
      n.parameters.jsCode = n.parameters.jsCode.replace(
        "const trigger = $('Telegram Trigger').first().json;",
        "let trigger={}; try{trigger=$('Telegram Trigger').first().json;}catch(e){try{trigger=$('Normalizar Update Telegram').first().json;}catch(e2){trigger=$input.first().json;}}",
      );
    }
  }
  delete src.connections['Telegram Trigger'];
  src.connections.Webhook = {
    main: [[{ node: 'Normalizar Update Telegram', type: 'main', index: 0 }]],
  };
  src.connections['Normalizar Update Telegram'] = {
    main: [[{ node: 'Idempotencia update_id', type: 'main', index: 0 }]],
  };
  delete src.id;
  delete src.active;
  delete src.versionId;
  delete src.meta;
  delete src.tags;
  delete src.pinData;
  src.settings = { executionOrder: 'v1' };
  src.name = 'MVP-F2-smoke-clasif';

  const created = await request('POST', '/api/v1/workflows', key, {
    name: src.name,
    nodes: src.nodes,
    connections: src.connections,
    settings: src.settings,
  });
  if (created.status >= 400) throw new Error(created.raw.slice(0, 400));
  const wfId = created.json.id;
  await request('POST', `/api/v1/workflows/${wfId}/activate`, key);

  const rows = [];
  try {
    for (const m of MSGS) {
      const after = new Date().toISOString();
      await post(pathWh, {
        update_id: Date.now() + m.chat_id,
        message: {
          message_id: 1,
          chat: { id: m.chat_id },
          from: { first_name: m.id },
          text: m.text,
        },
      });
      let got = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 240000) {
        const list = await request(
          'GET',
          `/api/v1/executions?workflowId=${wfId}&limit=8`,
          key,
        );
        for (const row of list.json?.data || []) {
          if (row.startedAt && row.startedAt < after) continue;
          if (row.status === 'running' || row.status === 'waiting') continue;
          const full = await request('GET', `/api/v1/executions/${row.id}?includeData=true`, key);
          const run = full.json?.data?.resultData?.runData || {};
          const setV = run['Set Variables']?.[0]?.data?.main?.[0]?.[0]?.json;
          if (String(setV?.chat_id || '') !== String(m.chat_id)) continue;
          const parse = run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json || {};
          const clasif = run['HTTP Groq Clasificador']?.[0];
          got = {
            id: m.id,
            expect: m.expect,
            chat_id: m.chat_id,
            exec: row.id,
            temperatura: parse.temperatura || '',
            fuente: parse.clasificacion_fuente || '',
            conversando: parse.pipeline_conversando,
            clasifRan: !!clasif,
            match: m.expect == null || String(parse.temperatura).toLowerCase() === m.expect,
          };
          break;
        }
        if (got) break;
        await sleep(3000);
      }
      rows.push(got || { id: m.id, error: 'timeout', match: false });
      await sleep(8000);
    }
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${wfId}`, key);
  }

  const outPath = path.join(
    ROOT,
    'docs',
    'ops',
    `smoke-f2-clasificador-${new Date().toISOString().slice(0, 10)}.json`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const ok = rows.length === 6 && rows.every((r) => r && r.match !== false && !r.error);
  fs.writeFileSync(outPath, JSON.stringify({ ok, rows }, null, 2));
  console.log(JSON.stringify({ ok, rows, outPath }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
