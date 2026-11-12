#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const http = require('http');
const { loadEnv, apiKey, request, sheetsCred, httpSteps } = require('../lib/n8n-http-helper');
const { IDS } = require('../patch-mvp-f1-planillas');

const PROD_ID = '8JoSfkcn3pE1f0av';
const WH = 'mvp-f1-smoke-one';
const DISABLE = new Set([
  'Telegram Responder',
  'Telegram Enviar Foto',
  'Telegram Alerta Owner',
  'Email Lead Caliente',
  'Emit Panel Realtime',
  'Emit Lead Updated',
  'Telegram Alerta Owner RL',
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: '/webhook/' + path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 180000,
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
  const live = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const src = JSON.parse(JSON.stringify(live.json));
  const trigger = src.nodes.find((n) => n.name === 'Telegram Trigger');

  // limpia copias
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  for (const w of list.json?.data || []) {
    if (String(w.name || '').startsWith('MVP-F1-')) {
      try {
        await request('POST', `/api/v1/workflows/${w.id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${w.id}`, key);
    }
  }

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
        path: WH,
        responseMode: 'onReceived',
        options: {},
      },
    },
    {
      id: 'mvp-norm',
      name: 'Normalizar Update Telegram',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [trigger.position[0] + 200, trigger.position[1]],
      parameters: {
        jsCode: `const raw = $json || {};
const body = raw.body && typeof raw.body === 'object' ? raw.body : raw;
const update = body.message ? body : { message: body };
return [{ json: update }];`,
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
        "let trigger = {};\ntry { trigger = $('Telegram Trigger').first().json; } catch (e) {\n  try { trigger = $('Normalizar Update Telegram').first().json; } catch (e2) { trigger = $input.first().json; }\n}",
      );
    }
  }
  delete src.connections['Telegram Trigger'];
  // Trigger path real: Idempotencia → Set Variables
  src.connections.Webhook = {
    main: [[{ node: 'Normalizar Update Telegram', type: 'main', index: 0 }]],
  };
  src.connections['Normalizar Update Telegram'] = {
    main: [[{ node: 'Idempotencia update_id', type: 'main', index: 0 }]],
  };
  src.name = 'MVP-F1-smoke-one';
  delete src.id;
  delete src.active;
  delete src.versionId;
  delete src.meta;
  delete src.tags;
  delete src.pinData;
  src.settings = { executionOrder: 'v1' };

  const created = await request('POST', '/api/v1/workflows', key, {
    name: src.name,
    nodes: src.nodes,
    connections: src.connections,
    settings: src.settings,
  });
  if (created.status >= 400) throw new Error(created.raw.slice(0, 400));
  const wfId = created.json.id;
  await request('POST', `/api/v1/workflows/${wfId}/activate`, key);

  const chatId = 893000001;
  const text =
    'Hola, soy Ana Test F1, necesito comprar depto 2 amb en Godoy Cruz esta semana, presupuesto 90000 dolares';
  const after = new Date().toISOString();
  const status = await post(WH, {
    update_id: Date.now(),
    message: {
      message_id: 1,
      chat: { id: chatId },
      from: { first_name: 'Ana' },
      text,
    },
  });
  console.log('webhook status', status);

  let exec = null;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const listEx = await request(
      'GET',
      `/api/v1/executions?workflowId=${wfId}&limit=5&includeData=true`,
      key,
    );
    for (const row of listEx.json?.data || []) {
      if (row.startedAt && row.startedAt < after) continue;
      if (row.status !== 'success' && row.status !== 'error' && row.status !== 'waiting') continue;
      const full = await request('GET', `/api/v1/executions/${row.id}?includeData=true`, key);
      const run = full.json?.data?.resultData?.runData || {};
      const setv = run['Set Variables']?.[0]?.data?.main?.[0]?.[0]?.json || {};
      if (String(setv.chat_id) === String(chatId)) {
        exec = full.json;
        break;
      }
    }
    if (exec && exec.status !== 'waiting' && exec.status !== 'running') break;
    process.stdout.write('.');
  }
  console.log('');
  if (!exec) throw new Error('no exec');

  const run = exec.data?.resultData?.runData || {};
  console.log(
    JSON.stringify(
      {
        execId: exec.id,
        status: exec.status,
        nodes: Object.keys(run),
        setv: run['Set Variables']?.[0]?.data?.main?.[0]?.[0]?.json,
        parse: {
          chat_id: run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json?.chat_id,
          lead_completo: run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json?.lead_completo,
          temperatura: run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json?.temperatura,
        },
        writers: ['Guardar Lead', 'Actualizar Historial', 'Sync Leads_Bot', 'Registrar Consulta Telegram'].map(
          (n) => ({
            n,
            ran: !!run[n],
            err: run[n]?.[0]?.error || run[n]?.[0]?.data?.main?.[0]?.[0]?.json?.error || null,
            detect: run[`Detectar Error Escritura · ${n}`]?.[0]?.data?.main?.[0]?.[0]?.json?._write_sheets_ok,
          }),
        ),
        topError: exec.data?.resultData?.error || null,
      },
      null,
      2,
    ),
  );

  const { cred } = await sheetsCred(key);
  const sheets = await httpSteps(
    key,
    cred,
    [
      {
        name: 'LC',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}/values/${encodeURIComponent('Leads_Completos')}`,
      },
      {
        name: 'H',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.historial}/values/${encodeURIComponent('Hoja 1')}`,
      },
      {
        name: 'LB',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Leads_Bot`,
      },
      {
        name: 'C',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Consultas`,
      },
    ],
    '_TMP smoke sheets',
  );
  const has = (vals, id) => {
    const h = vals?.[0] || [];
    const i = h.indexOf('chat_id');
    if (i < 0) return false;
    return (vals || []).slice(1).some((r) => String(r[i]) === String(id));
  };
  console.log(
    JSON.stringify(
      {
        sheets: {
          Leads_Completos: has(sheets.LC?.values, chatId),
          historial: has(sheets.H?.values, chatId),
          Leads_Bot: has(sheets.LB?.values, chatId),
          Consultas: has(sheets.C?.values, chatId),
        },
      },
      null,
      2,
    ),
  );

  // keep workflow for inspection? delete
  await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
  await request('DELETE', `/api/v1/workflows/${wfId}`, key);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
