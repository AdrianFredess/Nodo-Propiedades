#!/usr/bin/env node
'use strict';

/**
 * Campaña v1.1 — mismos 30 del guion, columnas extra de clasificador.
 * Flags: --smoke | --run | --resume
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const {
  parseCsv,
  rowsToCsv,
  parseGroqRetry,
  createTokenGovernor,
  rowFromExecution,
  emptyResultRow,
  CSV_COLUMNS,
  nodeExecTimeMs,
  nodeMainItems,
} = require('./lib/campana-utils');

const ROOT = path.join(__dirname, '..', '..');
const GUION = path.join(ROOT, 'docs', 'validacion', 'guion_conversaciones_perfil.csv');
const WEBHOOK_PATH = '/webhook/tesis-v11-campana';

const CSV_COLUMNS_V11 = [
  ...CSV_COLUMNS,
  'temperatura_final',
  'temperatura_prompt_principal',
  'temperatura_clasificador_cruda',
  'clasificacion_fuente',
  'clasificacion_error',
  't_clasificador_ms',
  'tokens_clasificador',
  't_hasta_respuesta_ms',
];

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] == null || process.env[m[1]] === '') process.env[m[1]] = v;
  }
  if (!process.env.N8N_API_KEY) {
    try {
      const { execFileSync } = require('child_process');
      const code = [
        'import sqlite3',
        'c=sqlite3.connect(r"file:C:/Users/adrian/.n8n/database.sqlite?mode=ro", uri=True)',
        'row=c.execute("SELECT apiKey FROM user_api_keys WHERE label=?", ("n8n",)).fetchone()',
        'print(row[0] if row else "")',
      ].join('; ');
      const k = execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
      if (k) process.env.N8N_API_KEY = k;
    } catch (_) {}
  }
}

function parseArgs(argv) {
  return {
    smoke: argv.includes('--smoke'),
    run: argv.includes('--run'),
    resume: argv.includes('--resume'),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function outDirForToday() {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(ROOT, 'docs', 'validacion', 'v1.1', `campana-${d}`);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function requestJson(baseUrl, method, urlPath, apiKey, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, baseUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          'X-N8N-API-KEY': apiKey,
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
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function postWebhook(baseUrl, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(WEBHOOK_PATH, baseUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 180000,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function emptyV11Row(base = {}) {
  const row = {};
  for (const c of CSV_COLUMNS_V11) row[c] = '';
  return { ...row, ...base };
}

function rowFromExecutionV11({ guion, chatId, intento, exec }) {
  const base = rowFromExecution({ guion, chatId, intento, exec });
  const run = exec?.data?.resultData?.runData || {};
  const parsear = nodeMainItems(run, 'Parsear Respuesta')[0]?.json || {};
  const baseParse = nodeMainItems(run, 'Parsear Respuesta Base')[0]?.json || {};
  const started = exec.startedAt ? Date.parse(exec.startedAt) : NaN;
  const baseNode = run['Parsear Respuesta Base']?.[0];
  let t_hasta = '';
  if (baseNode && Number.isFinite(started)) {
    const end = Number(baseNode.startTime) + Number(baseNode.executionTime || 0);
    if (Number.isFinite(end)) t_hasta = String(end - started);
  }

  const tokensClas =
    parsear.tokens_clasificador != null && parsear.tokens_clasificador !== ''
      ? String(parsear.tokens_clasificador)
      : '';
  const tokensMain = Number(base.tokens_usage) || 0;
  const tokensClasN = Number(tokensClas) || 0;

  const row = emptyV11Row({
    ...base,
    temperatura_estado_actual:
      parsear.temperatura || base.temperatura_estado_actual || baseParse.temperatura || '',
    temperatura_final: String(parsear.temperatura || ''),
    temperatura_prompt_principal: String(
      parsear.temperatura_prompt_principal != null
        ? parsear.temperatura_prompt_principal
        : baseParse.temperatura || '',
    ),
    temperatura_clasificador_cruda: String(parsear.temperatura_clasificador_cruda || ''),
    clasificacion_fuente: String(parsear.clasificacion_fuente || ''),
    clasificacion_error: String(parsear.clasificacion_error || ''),
    t_clasificador_ms: nodeExecTimeMs(run, 'HTTP Groq Clasificador'),
    tokens_clasificador: tokensClas,
    t_hasta_respuesta_ms: t_hasta,
    tokens_usage: String(tokensMain + tokensClasN || base.tokens_usage || ''),
  });
  delete row._leadObj;
  return row;
}

async function waitExecution(api, wfId, chatId, text, afterIso) {
  const probed = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const list = await api(
      'GET',
      `/api/v1/executions?workflowId=${wfId}&limit=20&includeData=false`,
    );
    for (const row of list.json?.data || []) {
      const id = String(row.id);
      if (probed.has(id)) continue;
      if (afterIso && row.startedAt && row.startedAt < afterIso) continue;
      if (row.status !== 'success' && row.status !== 'error') continue;
      probed.add(id);
      const full = await api('GET', `/api/v1/executions/${id}?includeData=true`);
      const exec = full.json;
      const run = exec?.data?.resultData?.runData || {};
      // Esperar a que el clasificador haya corrido (Parsear Respuesta nuevo)
      if (!run['Parsear Respuesta'] && !run['Parsear Respuesta Base']) continue;
      const setv = run['Set Variables']?.[0]?.data?.main?.[0]?.[0]?.json || {};
      const parsear =
        run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json ||
        run['Parsear Respuesta Base']?.[0]?.data?.main?.[0]?.[0]?.json ||
        {};
      const cid = String(parsear.chat_id || setv.chat_id || '');
      const got = String(parsear.texto_usuario || setv.texto_usuario || '');
      if (cid === String(chatId) && got === text) return exec;
    }
    await sleep(2000);
  }
  return null;
}

function loadState(dir) {
  const p = path.join(dir, 'estado-corrida.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveState(dir, state) {
  fs.writeFileSync(path.join(dir, 'estado-corrida.json'), JSON.stringify(state, null, 2) + '\n');
}

function flattenCell(v) {
  return String(v ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function writeOutputs(dir, rows) {
  ensureDir(dir);
  const flatRows = rows.map((r) => {
    const o = { ...r };
    for (const k of CSV_COLUMNS_V11) {
      if (o[k] != null) o[k] = flattenCell(o[k]);
    }
    return o;
  });
  fs.writeFileSync(path.join(dir, 'resultados.csv'), rowsToCsv(flatRows, CSV_COLUMNS_V11), 'utf8');
  const md = ['# Transcripción — campaña v1.1', ''];
  for (const r of rows) {
    md.push(
      `## ${r.id} · esperado ${r.perfil_esperado} · final ${r.temperatura_final || '—'} · fuente ${r.clasificacion_fuente || '—'}`,
    );
    md.push('');
    md.push(`- chat_id: ${r.chat_id}`);
    md.push(`- exec_id: ${r.exec_id}`);
    md.push(`- prompt_principal: ${r.temperatura_prompt_principal || '—'}`);
    md.push(`- clasificador_cruda: ${r.temperatura_clasificador_cruda || '—'}`);
    md.push(`- lead_completo: ${r.lead_completo}`);
    md.push(`- t_hasta_respuesta_ms: ${r.t_hasta_respuesta_ms}`);
    md.push(`- notas: ${r.notas || '—'}`);
    md.push('');
    md.push(`**Cliente:** ${r.mensaje_usuario}`);
    md.push('');
    md.push(`**Bot:** ${r.respuesta_completa || '(sin texto)'}`);
    md.push('');
  }
  fs.writeFileSync(path.join(dir, 'transcripcion.md'), md.join('\n'), 'utf8');
}

function detectGroq429(exec) {
  const run = exec?.data?.resultData?.runData || {};
  for (const name of ['HTTP Groq', 'HTTP Groq Clasificador']) {
    const items = run[name]?.[0]?.data?.main?.[0] || [];
    for (const it of items) {
      const j = it.json || {};
      const err = j.error || j.message || '';
      const blob = typeof err === 'string' ? err : JSON.stringify(j);
      if (/429/.test(blob) || /rate limit/i.test(blob) || j.status === 429) {
        return parseGroqRetry(blob);
      }
    }
  }
  const top = exec?.data?.resultData?.error;
  if (top) {
    const blob = JSON.stringify(top);
    if (/429|rate limit/i.test(blob)) return parseGroqRetry(blob);
  }
  return null;
}

async function runLive(flags) {
  loadEnv();
  const baseUrl = process.env.N8N_BASE_URL || 'http://127.0.0.1:5678';
  const apiKey = process.env.N8N_API_KEY;
  const wfId = process.env.WORKFLOW_ID;
  if (!apiKey) throw new Error('Falta N8N_API_KEY');
  if (!wfId) throw new Error('Falta WORKFLOW_ID');

  const api = (method, p, body) => requestJson(baseUrl, method, p, apiKey, body);
  const dir = ensureDir(outDirForToday());
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'));
  // ~5200 principal + ~1000 clasificador
  const governor = createTokenGovernor({
    minGapMs: 75000,
    tpmBudget: 7500,
    tpdBudget: 190000,
    estTokens: 6200,
  });

  let state = flags.resume ? loadState(dir) : null;
  if (!state) {
    state = {
      nextIndex: 0,
      nextRetryChat: 892100001,
      dayTokens: 0,
      rows: [],
      startedAt: new Date().toISOString(),
    };
  } else {
    governor.setDayUsed(state.dayTokens || 0);
  }

  const cases = flags.smoke
    ? [
        {
          id: 'SMOKE',
          perfil_esperado: 'n/a',
          mensaje_usuario: 'Hola, smoke campaña v1.1, busco depto en Godoy Cruz',
        },
      ]
    : guion;

  const startIndex = flags.smoke ? 0 : state.nextIndex || 0;

  for (let i = startIndex; i < cases.length; i++) {
    const c = cases[i];
    const baseChat = flags.smoke ? 892999999 : 892000001 + i;
    let intento = 1;
    let chatId = baseChat;
    let done = false;
    let lastRow = null;

    while (!done && intento <= 3) {
      const ready = await governor.waitUntilReady(sleep, 6200);
      if (!ready.ok && ready.kind === 'tpd') {
        state.nextIndex = i;
        state.dayTokens = governor.snapshot().dayUsed;
        saveState(dir, state);
        writeOutputs(dir, state.rows);
        console.error('STOP 429 diario (TPD). Retomá con --resume. dayUsed=', ready.dayUsed);
        process.exit(2);
      }

      const after = new Date().toISOString();
      const wh = await postWebhook(baseUrl, {
        message: {
          chat: { id: chatId },
          from: { first_name: 'CampanaV11' },
          text: c.mensaje_usuario,
        },
      });
      const exec = await waitExecution(api, wfId, chatId, c.mensaje_usuario, after);
      if (!exec) {
        lastRow = emptyV11Row({
          id: c.id,
          perfil_esperado: c.perfil_esperado,
          mensaje_usuario: c.mensaje_usuario,
          chat_id: String(chatId),
          intento: String(intento),
          notas: `timeout webhook_status=${wh}`,
        });
        intento += 1;
        chatId = state.nextRetryChat++;
        continue;
      }

      const rl = detectGroq429(exec);
      if (rl && rl.kind === 'tpd') {
        state.nextIndex = i;
        state.dayTokens = governor.snapshot().dayUsed;
        saveState(dir, state);
        writeOutputs(dir, state.rows);
        console.error('STOP 429 diario. Usá --resume.');
        process.exit(2);
      }
      if (rl && rl.kind === 'tpm') {
        const waitMs = (rl.waitMs || 60000) + 5000;
        console.log(`429 TPM: espero ${waitMs}ms e intento ${intento + 1}`);
        await sleep(waitMs);
        intento += 1;
        chatId = state.nextRetryChat++;
        continue;
      }

      lastRow = rowFromExecutionV11({ guion: c, chatId, intento, exec });
      const tokens = Number(lastRow.tokens_usage) || 6200;
      governor.record(tokens);
      done = true;
    }

    if (!done) {
      lastRow = lastRow || emptyV11Row({ id: c.id });
      lastRow.notas = (lastRow.notas ? lastRow.notas + ' | ' : '') + 'fallo_max_intentos';
      lastRow.id = c.id;
      lastRow.perfil_esperado = c.perfil_esperado;
      lastRow.mensaje_usuario = c.mensaje_usuario;
    }

    if (!flags.smoke) {
      state.rows.push(lastRow);
      state.nextIndex = i + 1;
      state.dayTokens = governor.snapshot().dayUsed;
      saveState(dir, state);
      writeOutputs(dir, state.rows);
    } else {
      writeOutputs(dir, [lastRow]);
      fs.writeFileSync(path.join(dir, 'smoke-row.json'), JSON.stringify(lastRow, null, 2));
    }

    console.log(
      c.id,
      'final',
      lastRow.temperatura_final || '—',
      'fuente',
      lastRow.clasificacion_fuente || '—',
      'stock',
      lastRow.stock_leido,
      'exec',
      lastRow.exec_id,
      lastRow.notas || '',
    );
  }

  console.log('DONE', dir);
  console.log('governor', JSON.stringify(governor.snapshot()));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const n = [flags.smoke, flags.run, flags.resume].filter(Boolean).length;
  if (n === 0) {
    console.error('Usá --smoke | --run | --resume');
    process.exit(1);
  }
  if (flags.resume) flags.run = true;
  await runLive(flags);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { CSV_COLUMNS_V11, rowFromExecutionV11 };
