/**
 * 30 mensajes del guion contra el bot Telegram real (n8n), un chat_id por caso.
 * No usa SYSTEM_MIN / Groq directo.
 *
 * node scripts/run-validacion-30-bot-real.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'validacion');
const GUION = path.join(OUT_DIR, 'guion_conversaciones_perfil.csv');
const WF_ID = '8JoSfkcn3pE1f0av';
const SECRET = `${WF_ID}_a1b2c3d4-0001-0001-0001-000000000001`;
const WH_PATH = '/webhook/f0e1d2c3-b4a5-9687-8765-inmobiliaria01/webhook';

function loadApiKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  const { execFileSync } = require('child_process');
  const code = [
    'import sqlite3',
    'c=sqlite3.connect(r"file:C:/Users/adrian/.n8n/database.sqlite?mode=ro", uri=True)',
    'row=c.execute("SELECT apiKey FROM user_api_keys WHERE label=?", ("n8n",)).fetchone()',
    'print(row[0] if row else "")',
  ].join('; ');
  const key = execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
  if (!key) throw new Error('Sin N8N_API_KEY');
  return key;
}
const API_KEY = loadApiKey();

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] || '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function api(urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method: 'GET',
        headers: { 'X-N8N-API-KEY': API_KEY },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(buf ? JSON.parse(buf) : null);
          } catch (e) {
            reject(new Error('JSON ' + urlPath + ' ' + buf.slice(0, 200)));
          }
        });
      },
    );
    r.on('error', reject);
    r.end();
  });
}

function postWebhook(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: WH_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-Telegram-Bot-Api-Secret-Token': SECRET,
        },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, raw: buf }));
      },
    );
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

function pick(run, name) {
  const arr = run[name];
  if (!arr?.[0]?.data?.main?.[0]?.[0]) return null;
  return arr[0].data.main[0][0].json || null;
}

async function waitMatch(expectedText, chatId, afterIso, timeoutMs = 180000) {
  const t0 = Date.now();
  const probed = new Set();
  while (Date.now() - t0 < timeoutMs) {
    const list = await api(`/api/v1/executions?workflowId=${WF_ID}&limit=20&includeData=false`);
    for (const row of list?.data || []) {
      const id = String(row.id);
      if (probed.has(id)) continue;
      if (afterIso && row.startedAt && row.startedAt < afterIso) continue;
      if (row.status !== 'success' && row.status !== 'error') continue;
      probed.add(id);
      const full = await api(`/api/v1/executions/${row.id}?includeData=true`);
      const run = full?.data?.resultData?.runData || {};
      const parsear = pick(run, 'Parsear Respuesta');
      const setv = pick(run, 'Set Variables');
      const texto = String(parsear?.texto_usuario || setv?.texto_usuario || '');
      const cid = String(parsear?.chat_id || setv?.chat_id || '');
      if (texto === expectedText && cid === String(chatId)) {
        const tg = pick(run, 'Telegram Responder');
        return {
          execId: id,
          status: full?.status || row.status,
          startedAt: full?.startedAt || row.startedAt,
          stoppedAt: full?.stoppedAt || row.stoppedAt,
          temperatura: String(parsear?.temperatura || ''),
          respuesta: String(tg?.result?.text || parsear?.respuesta_bot || ''),
          leadCompleto: Boolean(parsear?.nombre || parsear?.lead_completo),
          parseOk: Boolean(parsear),
        };
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

async function main() {
  const cases = parseCsv(fs.readFileSync(GUION, 'utf8'));
  console.log('casos', cases.length);
  try {
    await new Promise((resolve, reject) => {
      const r = http.request(
        {
          hostname: '127.0.0.1',
          port: 5678,
          path: `/api/v1/workflows/${WF_ID}/activate`,
          method: 'POST',
          headers: { 'X-N8N-API-KEY': API_KEY },
        },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      r.on('error', reject);
      r.end();
    });
  } catch (_) {}

  const rows = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const chatId = 880000001 + i;
    const afterIso = new Date().toISOString();
    const t0 = Date.now();
    const payload = {
      update_id: Date.now() % 1e9,
      message: {
        message_id: 1000 + i,
        from: {
          id: chatId,
          is_bot: false,
          first_name: 'Caso',
          last_name: c.id,
          username: 'caso_' + c.id.toLowerCase(),
        },
        chat: { id: chatId, type: 'private', first_name: 'Caso', last_name: c.id },
        date: Math.floor(Date.now() / 1000),
        text: c.mensaje_usuario,
      },
    };
    console.log('→', c.id, chatId);
    let whStatus = 0;
    try {
      const wh = await postWebhook(payload);
      whStatus = wh.status;
    } catch (e) {
      rows.push(failRow(c, chatId, e.message));
      continue;
    }
    const matched = await waitMatch(c.mensaje_usuario, chatId, afterIso);
    const ms = Date.now() - t0;
    if (!matched) {
      rows.push(failRow(c, chatId, 'sin_match_exec', ms, whStatus));
      console.log('  TIMEOUT');
    } else {
      const temp = String(matched.temperatura || '').toLowerCase().trim();
      const coincide = temp === String(c.perfil_esperado).toLowerCase() ? 'si' : 'no';
      rows.push({
        id: c.id,
        perfil_esperado: c.perfil_esperado,
        mensaje_usuario: c.mensaje_usuario,
        clasificacion_obtenida: temp || '(vacio)',
        coincide,
        json_parseo_ok: matched.parseOk ? 'si' : 'no',
        lead_completo: matched.leadCompleto ? 'si' : 'no',
        tiempo_ms: ms,
        respuesta_preview: matched.respuesta.replace(/\s+/g, ' ').slice(0, 240),
        respuesta_completa: matched.respuesta,
        timestamp_utc: matched.startedAt || afterIso,
        modo_ejecucion: 'n8n_telegram_webhook_bot_real',
        exec_id: matched.execId,
        chat_id: chatId,
        webhook_status: whStatus,
        notas: 'chat aislado; workflow ' + WF_ID + '; status ' + matched.status,
      });
      console.log('  ', temp, coincide, 'exec', matched.execId, ms + 'ms');
    }
    fs.writeFileSync(
      path.join(OUT_DIR, 'resultados_clasificacion_bot_real_parcial.csv'),
      toCsv(rows),
      'utf8',
    );
    await new Promise((r) => setTimeout(r, 4000));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(OUT_DIR, `resultados_clasificacion_bot_real_${stamp}.csv`);
  const mdPath = path.join(OUT_DIR, `transcripcion_30_bot_real_${stamp}.md`);
  fs.writeFileSync(csvPath, toCsv(rows), 'utf8');
  fs.writeFileSync(mdPath, toMd(rows), 'utf8');
  const ok = rows.filter((r) => r.coincide === 'si').length;
  console.log('OUT', csvPath);
  console.log('coincide', ok, '/', rows.length);
}

function failRow(c, chatId, note, ms, wh) {
  return {
    id: c.id,
    perfil_esperado: c.perfil_esperado,
    mensaje_usuario: c.mensaje_usuario,
    clasificacion_obtenida: 'ERROR',
    coincide: 'no',
    json_parseo_ok: 'no',
    lead_completo: 'no',
    tiempo_ms: ms || '',
    respuesta_preview: '',
    respuesta_completa: '',
    timestamp_utc: new Date().toISOString(),
    modo_ejecucion: 'n8n_telegram_webhook_bot_real',
    exec_id: '',
    chat_id: chatId,
    webhook_status: wh || '',
    notas: note,
  };
}

function toCsv(rows) {
  const fields = [
    'id',
    'perfil_esperado',
    'mensaje_usuario',
    'clasificacion_obtenida',
    'coincide',
    'json_parseo_ok',
    'lead_completo',
    'tiempo_ms',
    'respuesta_preview',
    'timestamp_utc',
    'modo_ejecucion',
    'exec_id',
    'chat_id',
    'notas',
  ];
  const lines = [fields.join(',')];
  for (const r of rows) lines.push(fields.map((f) => csvEscape(r[f])).join(','));
  return lines.join('\n') + '\n';
}

function toMd(rows) {
  const lines = [
    '# Transcripción — 30 mensajes contra bot Telegram real',
    '',
    `- Fecha: ${new Date().toISOString()}`,
    `- workflow: ${WF_ID}`,
    `- modo: webhook n8n (un chat_id aislado por caso; no Groq directo / no SYSTEM_MIN)`,
    '',
  ];
  for (const r of rows) {
    lines.push(`## ${r.id} — esperado \`${r.perfil_esperado}\` — obtenido \`${r.clasificacion_obtenida}\` — coincide ${r.coincide}`);
    lines.push('');
    lines.push(`- exec_id: ${r.exec_id || '—'}`);
    lines.push(`- chat_id: ${r.chat_id}`);
    lines.push(`- tiempo_ms: ${r.tiempo_ms}`);
    lines.push(`- notas: ${r.notas}`);
    lines.push('');
    lines.push(`**Cliente:** ${r.mensaje_usuario}`);
    lines.push('');
    lines.push(`**Bot:** ${r.respuesta_completa || r.respuesta_preview || '(sin texto)'}`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
