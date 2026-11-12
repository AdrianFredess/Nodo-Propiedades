#!/usr/bin/env node
'use strict';

/**
 * Check Fase 1:
 * A) 3 mensajes lead completo → filas en 4 hojas, writers sin error.
 * B) documentId roto en Sync Leads_Bot → 1 flush de alerta con 3 chat_ids.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const {
  ROOT,
  loadEnv,
  apiKey,
  request,
  sheetsCred,
  httpSteps,
} = require('../lib/n8n-http-helper');
const { IDS } = require('../patch-mvp-f1-planillas');

const PROD_ID = '8JoSfkcn3pE1f0av';
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
    chat_id: 893000001,
    text: 'Hola, soy Ana Perez Test F1. Quiero COMPRAR un departamento de 2 ambientes en Godoy Cruz esta misma semana. Presupuesto hasta 95000 dolares. Mis datos estan completos: nombre Ana Perez, zona Godoy Cruz, presupuesto 95000 USD, operacion compra. Confirmame opciones.',
  },
  {
    chat_id: 893000002,
    text: 'Soy Bruno Lopez Test F1. Necesito COMPRAR un PH en Maipu YA. Presupuesto 110000 USD listos. Nombre Bruno Lopez, zona Maipu, operacion compra, presupuesto 110000 USD. Decisime que hay.',
  },
  {
    chat_id: 893000003,
    text: 'Soy Carla Ruiz Test F1. Busco COMPRAR casa en Chacras este mes. Presupuesto 150000 dolares. Nombre Carla Ruiz, zona Chacras de Coria, operacion compra, presupuesto 150000 USD. Mandame opciones.',
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function postWebhook(pathWh, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: '/webhook/' + pathWh,
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

function patchTranscribir(n) {
  if (n.name === 'Transcribir Audio TG' && n.parameters?.jsCode) {
    n.parameters.jsCode = n.parameters.jsCode.replace(
      "const trigger = $('Telegram Trigger').first().json;",
      "let trigger = {};\ntry { trigger = $('Telegram Trigger').first().json; } catch (e) {\n  try { trigger = $('Normalizar Update Telegram').first().json; } catch (e2) { trigger = $input.first().json; }\n}",
    );
  }
}

async function cleanupCopies(key) {
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  for (const w of list.json?.data || []) {
    if (String(w.name || '').startsWith('MVP-F1-')) {
      try {
        await request('POST', `/api/v1/workflows/${w.id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${w.id}`, key);
    }
  }
}

async function createCopy(key, { pathWh, name, broken = false, flushAt3 = false }) {
  const live = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const src = JSON.parse(JSON.stringify(live.json));
  const trigger = src.nodes.find((n) => n.name === 'Telegram Trigger');
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
      id: 'mvp-f1-norm-' + pathWh,
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
    patchTranscribir(n);
    // Check A: forzar rama Guardar Lead → Leads_Completos
    if (!broken && n.name === 'Parsear Respuesta' && n.parameters?.jsCode) {
      n.parameters.jsCode = n.parameters.jsCode.replace(
        /lead_completo:\s*[^,\n]+/,
        'lead_completo: true /* MVP-F1 force */',
      );
    }
    if (!broken && n.name === 'IF Lead Completo') {
      try {
        const cond = n.parameters?.conditions?.conditions?.[0];
        if (cond) {
          cond.leftValue = '={{ true }}';
          cond.rightValue = true;
          cond.operator = { type: 'boolean', operation: 'equals' };
        }
      } catch (_) {}
    }
    if (broken && n.name === 'Sync Leads_Bot') {
      n.parameters.documentId = {
        __rl: true,
        value: 'INVALID_DOC_ID_F1_TEST_MVP',
        mode: 'id',
      };
    }
    if (flushAt3 && String(n.name).startsWith('Detectar Error Escritura') && n.parameters?.jsCode) {
      // Todos los Detect comparten staticData: si alguno queda con due horario,
      // flushea al 1.er error y vacía pending. Forzar umbral distinct>=3 en todos.
      n.parameters.jsCode = n.parameters.jsCode.replace(
        'const due = !st.lastSentAt || now - Number(st.lastSentAt) >= SHEETS_WRITE_ALERT_MS;',
        `const distinct = new Set((st.pending || []).map((p) => p.chat_id));
const due = distinct.size >= 3;`,
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
  src.name = name;
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
  return wfId;
}

async function waitDone(key, wfId, chatId, text, afterIso) {
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const list = await request(
      'GET',
      `/api/v1/executions?workflowId=${wfId}&limit=10&includeData=true`,
      key,
    );
    for (const row of list.json?.data || []) {
      if (row.startedAt && row.startedAt < afterIso) continue;
      if (row.status === 'running' || row.status === 'waiting') continue;
      const run = row.data?.resultData?.runData || {};
      // list includeData sometimes shallow — refetch
      const full = await request('GET', `/api/v1/executions/${row.id}?includeData=true`, key);
      const run2 = full.json?.data?.resultData?.runData || {};
      const setv = run2['Set Variables']?.[0]?.data?.main?.[0]?.[0]?.json || {};
      const parse = run2['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json || {};
      if (String(setv.chat_id) === String(chatId) && String(setv.texto_usuario) === text) {
        if (run2['Parsear Respuesta'] || full.json.status === 'error') return full.json;
      }
      void run;
      void parse;
    }
    await sleep(2500);
  }
  return null;
}

function hasChat(values, chatId) {
  const h = values?.[0] || [];
  const i = h.indexOf('chat_id');
  if (i < 0) return false;
  return (values || []).slice(1).some((r) => String(r[i]) === String(chatId));
}

async function verifySheets(key, cred, chatId) {
  const out = await httpSteps(
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
    '_TMP verify f1',
  );
  return {
    Leads_Completos: hasChat(out.LC?.values, chatId),
    historial: hasChat(out.H?.values, chatId),
    Leads_Bot: hasChat(out.LB?.values, chatId),
    Consultas: hasChat(out.C?.values, chatId),
  };
}

function writerOk(run, name) {
  if (!run[name]) return { ran: false, err: 'no_corrio' };
  const item = run[name]?.[0]?.data?.main?.[0]?.[0]?.json || {};
  if (item.error) return { ran: true, err: JSON.stringify(item.error).slice(0, 180) };
  if (run[name]?.[0]?.error) return { ran: true, err: String(run[name][0].error.message || '').slice(0, 180) };
  const det = run[`Detectar Error Escritura · ${name}`]?.[0]?.data?.main?.[0]?.[0]?.json;
  if (det && det._write_sheets_ok === false) return { ran: true, err: det._write_sheets_error };
  return { ran: true, err: '' };
}

async function checkHappy(key, cred) {
  await cleanupCopies(key);
  const pathWh = 'mvp-f1-check-ok';
  const wfId = await createCopy(key, { pathWh, name: 'MVP-F1-check-ok' });
  const rows = [];
  try {
    for (const m of MSGS) {
      const after = new Date().toISOString();
      await postWebhook(pathWh, {
        update_id: Date.now() + m.chat_id,
        message: {
          message_id: 1,
          chat: { id: m.chat_id },
          from: { first_name: 'F1' },
          text: m.text,
        },
      });
      const exec = await waitDone(key, wfId, m.chat_id, m.text, after);
      if (!exec) {
        rows.push({ chat_id: m.chat_id, ok: false, error: 'timeout' });
        continue;
      }
      const run = exec.data?.resultData?.runData || {};
      const parse = run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json || {};
      const w = {
        historial: writerOk(run, 'Actualizar Historial'),
        sync: writerOk(run, 'Sync Leads_Bot'),
        consulta: writerOk(run, 'Registrar Consulta Telegram'),
        guardar: writerOk(run, 'Guardar Lead'),
      };
      const sheets = await verifySheets(key, cred, m.chat_id);
      const needGuardar = Boolean(parse.lead_completo);
      const ok =
        !w.historial.err &&
        !w.sync.err &&
        !w.consulta.err &&
        sheets.historial &&
        sheets.Leads_Bot &&
        sheets.Consultas &&
        (!needGuardar || (w.guardar.ran && !w.guardar.err && sheets.Leads_Completos));
      rows.push({
        chat_id: m.chat_id,
        exec_id: exec.id,
        lead_completo: parse.lead_completo,
        temperatura: parse.temperatura,
        writers: w,
        sheets,
        ok,
      });
      await sleep(20000);
    }
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${wfId}`, key);
  }
  return rows;
}

async function checkBroken(key) {
  await cleanupCopies(key);
  const pathWh = 'mvp-f1-check-broken';
  const wfId = await createCopy(key, {
    pathWh,
    name: 'MVP-F1-check-broken',
    broken: true,
    flushAt3: true,
  });
  let flushCount = 0;
  let flushText = '';
  try {
    for (const m of MSGS) {
      const after = new Date().toISOString();
      await postWebhook(pathWh, {
        update_id: Date.now() + m.chat_id,
        message: {
          message_id: 1,
          chat: { id: m.chat_id },
          from: { first_name: 'F1b' },
          text: m.text,
        },
      });
      const exec = await waitDone(key, wfId, m.chat_id, m.text, after);
      if (!exec) throw new Error('timeout broken ' + m.chat_id);
      const run = exec.data?.resultData?.runData || {};
      const det =
        run['Detectar Error Escritura · Sync Leads_Bot']?.[0]?.data?.main?.[0]?.[0]?.json;
      if (det?.alertar_escritura_sheets) {
        flushCount += 1;
        flushText = String(det.escritura_alerta_texto || '');
      }
      await sleep(15000);
    }
    const chats = MSGS.filter((m) => flushText.includes(String(m.chat_id))).map((m) =>
      String(m.chat_id),
    );
    return {
      alertFlushes: flushCount,
      chatsInAlerts: chats,
      ok: flushCount === 1 && chats.length === 3,
      sample: flushText.slice(0, 600),
    };
  } finally {
    try {
      await request('POST', `/api/v1/workflows/${wfId}/deactivate`, key);
    } catch (_) {}
    await request('DELETE', `/api/v1/workflows/${wfId}`, key);
  }
}

async function main() {
  loadEnv();
  const key = apiKey();
  const only = String(process.env.CHECK_ONLY || '').toLowerCase(); // a|b|''
  const { cred } = await sheetsCred(key, PROD_ID);
  let happy = [];
  let broken = { ok: true, alertFlushes: 0, chatsInAlerts: [], sample: '', skipped: true };
  if (only !== 'b') {
    console.log('=== Check A ===');
    happy = await checkHappy(key, cred);
    console.log(JSON.stringify(happy, null, 2));
  } else {
    console.log('=== Check A skipped (CHECK_ONLY=b) ===');
    happy = [{ ok: true }, { ok: true }, { ok: true }];
  }
  if (only !== 'a') {
    console.log('=== Check B ===');
    broken = await checkBroken(key);
    console.log(JSON.stringify(broken, null, 2));
  } else {
    console.log('=== Check B skipped (CHECK_ONLY=a) ===');
  }
  const out = {
    happyOk: happy.length === 3 && happy.every((r) => r.ok),
    brokenOk: broken.ok,
    happy,
    broken,
  };
  fs.mkdirSync(path.join(ROOT, 'docs', 'ops'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'docs', 'ops', `check-f1-writes-${new Date().toISOString().slice(0, 10)}.json`),
    JSON.stringify(out, null, 2),
  );
  if (!out.happyOk || !out.brokenOk) {
    console.error('F1 CHECK FAIL');
    process.exit(2);
  }
  console.log('F1 CHECK OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
