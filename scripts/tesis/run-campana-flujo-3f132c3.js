#!/usr/bin/env node
'use strict';

/**
 * Corre la campaña de 30 contra la copia TESIS-3f132c3.
 *
 * Flags: --smoke | --run | --resume | --dry-run
 * Env: N8N_BASE_URL, N8N_API_KEY, WORKFLOW_ID (desde .env)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const {
  CSV_COLUMNS,
  parseCsv,
  rowsToCsv,
  parseGroqRetry,
  createTokenGovernor,
  rowFromExecution,
  emptyResultRow,
  compareLeadFields,
  normalizeSpace,
} = require('./lib/campana-utils');

const ROOT = path.join(__dirname, '..', '..');
const GUION = path.join(ROOT, 'docs', 'validacion', 'guion_conversaciones_perfil.csv');
const FIXTURES = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'fixtures');
const DEFAULT_OUT_DIR = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3-OUT');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
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
    dryRun: argv.includes('--dry-run'),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function outDirForToday() {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(ROOT, 'docs', 'validacion', `campana-flujo-3f132c3-${d}`);
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
    const u = new URL('/webhook/tesis-3f132c3-campana', baseUrl);
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

async function waitExecution(api, wfId, chatId, text, afterIso) {
  const probed = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
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
      const setv = run['Set Variables']?.[0]?.data?.main?.[0]?.[0]?.json || {};
      const parsear = run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json || {};
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

function writeOutputs(dir, rows) {
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'resultados.csv'), rowsToCsv(rows), 'utf8');
  const md = ['# Transcripción — campaña 3f132c3', ''];
  for (const r of rows) {
    md.push(`## ${r.id} · esperado ${r.perfil_esperado} · estado ${r.temperatura_estado_actual || '—'}`);
    md.push('');
    md.push(`- chat_id: ${r.chat_id}`);
    md.push(`- exec_id: ${r.exec_id}`);
    md.push(`- lead_completo: ${r.lead_completo}`);
    md.push(`- es_rescate: ${r.es_rescate}`);
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
  const items = run['HTTP Groq']?.[0]?.data?.main?.[0] || [];
  for (const it of items) {
    const j = it.json || {};
    const err = j.error || j.message || '';
    const blob = typeof err === 'string' ? err : JSON.stringify(j);
    if (/429/.test(blob) || /rate limit/i.test(blob) || j.status === 429) {
      return parseGroqRetry(blob);
    }
  }
  const top = exec?.data?.resultData?.error;
  if (top) {
    const blob = JSON.stringify(top);
    if (/429|rate limit/i.test(blob)) return parseGroqRetry(blob);
  }
  return null;
}

async function runDry(dir) {
  ensureDir(dir);
  const fixtures = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'executions.json'), 'utf8'));
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'));
  const rows = [];
  for (let i = 0; i < Math.min(guion.length, fixtures.length); i++) {
    const row = rowFromExecution({
      guion: guion[i],
      chatId: 891000001 + i,
      intento: 1,
      exec: fixtures[i],
    });
    delete row._leadObj;
    rows.push(row);
  }
  // Rellenar hasta 30 columnas presentes aunque falten fixtures
  while (rows.length < 1) {
    rows.push(emptyResultRow({ id: 'DRY', notas: 'sin fixtures' }));
  }
  writeOutputs(dir, rows);
  console.log('DRY-RUN OK', path.join(dir, 'resultados.csv'), 'filas', rows.length);
  console.log('columnas', CSV_COLUMNS.join(','));
}

async function runLive(flags) {
  loadEnv();
  const baseUrl = process.env.N8N_BASE_URL || 'http://127.0.0.1:5678';
  const apiKey = process.env.N8N_API_KEY;
  const wfId = process.env.WORKFLOW_ID;
  if (!apiKey) throw new Error('Falta N8N_API_KEY en .env');
  if (!wfId) throw new Error('Falta WORKFLOW_ID en .env');

  const api = (method, p, body) => requestJson(baseUrl, method, p, apiKey, body);
  const dir = ensureDir(outDirForToday());
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'));
  const governor = createTokenGovernor({ minGapMs: 75000, tpmBudget: 7500, tpdBudget: 190000 });

  let state = flags.resume ? loadState(dir) : null;
  if (!state) {
    state = {
      nextIndex: 0,
      nextRetryChat: 891100001,
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
          mensaje_usuario: 'Hola, smoke campaña 3f132c3, busco depto en Godoy Cruz',
        },
      ]
    : guion;

  const startIndex = flags.smoke ? 0 : state.nextIndex || 0;

  for (let i = startIndex; i < cases.length; i++) {
    const c = cases[i];
    const baseChat = flags.smoke ? 891999999 : 891000001 + i;
    let intento = 1;
    let chatId = baseChat;
    let done = false;
    let lastRow = null;

    while (!done && intento <= 3) {
      const ready = await governor.waitUntilReady(sleep, 5200);
      if (!ready.ok && ready.kind === 'tpd') {
        state.nextIndex = i;
        state.dayTokens = governor.snapshot().dayUsed;
        saveState(dir, state);
        writeOutputs(dir, state.rows);
        console.error(
          'STOP 429 diario (TPD). Estado guardado. Retomá otro día con --resume. dayUsed=',
          ready.dayUsed,
        );
        process.exit(2);
      }

      const after = new Date().toISOString();
      const wh = await postWebhook(baseUrl, {
        message: {
          chat: { id: chatId },
          from: { first_name: 'CampanaTesis' },
          text: c.mensaje_usuario,
        },
      });
      const exec = await waitExecution(api, wfId, chatId, c.mensaje_usuario, after);
      if (!exec) {
        lastRow = emptyResultRow({
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
        console.error('STOP 429 diario detectado en ejecución. Estado guardado. Usá --resume.');
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

      const row = rowFromExecution({ guion: c, chatId, intento, exec });
      const tokens = Number(row.tokens_usage) || 5200;
      governor.record(tokens);
      delete row._leadObj;
      lastRow = row;
      done = true;
    }

    if (!done) {
      lastRow = lastRow || emptyResultRow({ id: c.id });
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
      lastRow.temperatura_estado_actual || '—',
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
  const n = [flags.smoke, flags.run, flags.resume, flags.dryRun].filter(Boolean).length;
  if (n === 0) {
    console.error('Usá --smoke | --run | --resume | --dry-run');
    process.exit(1);
  }
  if (flags.dryRun) {
    await runDry(path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'dry-run-out'));
    return;
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

module.exports = { parseArgs, detectGroq429, runDry };
