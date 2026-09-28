/**
 * Corre el guion de 30 contra la copia TESIS-3f132c3 (webhook, sin Telegram Trigger).
 * node scripts/run-validacion-flujo-3f132c3.js
 * SMOKE=1 corre solo el primer caso.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'validacion');
const GUION = path.join(OUT, 'guion_conversaciones_perfil.csv');
const WF_ID = 'pAoeaGKRj49HvgJq';
const WH = '/webhook/tesis-3f132c3-clasificacion';
const WRITE_NODES = [
  'Guardar Lead',
  'Actualizar Historial',
  'Sync Leads_Bot',
  'Registrar Consulta Telegram',
  'Telegram Responder',
  'Email Lead Caliente',
  'Telegram Alerta Owner',
  'Emit Panel Realtime',
  'Emit Lead Updated',
];

function apiKey() {
  const code = [
    'import sqlite3',
    'c=sqlite3.connect(r"file:C:/Users/adrian/.n8n/database.sqlite?mode=ro", uri=True)',
    'row=c.execute("SELECT apiKey FROM user_api_keys WHERE label=?", ("n8n",)).fetchone()',
    'print(row[0] if row else "")',
  ].join('; ');
  return execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
}
const KEY = apiKey();

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: {
          'X-N8N-API-KEY': KEY,
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
          try {
            resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null, raw: buf });
          } catch (e) {
            resolve({ status: res.statusCode, raw: buf });
          }
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function postWh(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: WH,
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

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = split(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] || '';
    });
    return row;
  });
}
function split(line) {
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
function pick(run, name) {
  const arr = run[name];
  if (!arr?.[0]?.data?.main?.[0]?.[0]) return null;
  return arr[0].data.main[0][0].json || null;
}
function groqText(json) {
  if (!json) return '';
  const msg = json.choices?.[0]?.message;
  if (msg) return String(msg.content || msg.reasoning || '');
  return '';
}

async function waitMatch(text, chatId, afterIso) {
  const t0 = Date.now();
  const probed = new Set();
  while (Date.now() - t0 < 180000) {
    const list = await request(
      'GET',
      '/api/v1/executions?workflowId=' + WF_ID + '&limit=15&includeData=false',
    );
    for (const row of list.json?.data || []) {
      const id = String(row.id);
      if (probed.has(id)) continue;
      if (afterIso && row.startedAt && row.startedAt < afterIso) continue;
      if (row.status !== 'success' && row.status !== 'error') continue;
      probed.add(id);
      const full = await request('GET', '/api/v1/executions/' + id + '?includeData=true');
      const run = full.json?.data?.resultData?.runData || {};
      const parsear = pick(run, 'Parsear Respuesta');
      const setv = pick(run, 'Set Variables');
      const got = String(parsear?.texto_usuario || setv?.texto_usuario || '');
      const cid = String(parsear?.chat_id || setv?.chat_id || '');
      if (got === text && cid === String(chatId)) {
        let raw = groqText(pick(run, 'HTTP Groq'));
        const est = raw.match(/###ESTADO_ACTUAL:(frio|tibio|caliente)###/i);
        const lead = raw.match(/###LEAD_COMPLETO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_LEAD###/);
        let leadTemp = '';
        if (lead) {
          try {
            leadTemp = String(JSON.parse(lead[1]).temperatura || '').toLowerCase();
          } catch (_) {}
        }
        const stock = run['Leer Stock Propiedades']?.[0]?.data?.main?.[0];
        const writes = WRITE_NODES.filter((n) => Array.isArray(run[n]) && run[n].length);
        return {
          execId: id,
          status: full.json?.status || row.status,
          startedAt: full.json?.startedAt || row.startedAt,
          temperatura: String(parsear?.temperatura || '').toLowerCase(),
          leadCompleto: parsear?.lead_completo ? 'si' : 'no',
          respuesta: String(parsear?.respuesta_bot || ''),
          estado: est ? est[1].toLowerCase() : '',
          leadTemp,
          stockCount: Array.isArray(stock) ? stock.length : 0,
          writes,
          error: full.json?.data?.resultData?.error?.message || '',
        };
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function main() {
  await request('POST', '/api/v1/workflows/' + WF_ID + '/activate');
  const cases = parseCsv(fs.readFileSync(GUION, 'utf8'));
  const limit = process.env.SMOKE === '1' ? 1 : cases.length;
  const rows = [];
  let stockCount = 0;
  const writesSeen = new Set();
  for (let i = 0; i < limit; i++) {
    const c = cases[i];
    const chatId = 890000001 + i;
    const after = new Date().toISOString();
    const t0 = Date.now();
    const wh = await postWh({
      message: {
        chat: { id: chatId },
        from: { first_name: 'Caso' },
        text: c.mensaje_usuario,
      },
    });
    const m = await waitMatch(c.mensaje_usuario, chatId, after);
    const ms = Date.now() - t0;
    if (!m) {
      console.log(c.id, 'TIMEOUT', wh);
      rows.push({
        id: c.id,
        perfil_esperado: c.perfil_esperado,
        mensaje_usuario: c.mensaje_usuario,
        estado_actual_modelo: '',
        lead_completo: 'no',
        lead_block_temperatura: '',
        temperatura_final: 'ERROR',
        coincide: 'no',
        exec_id: '',
        tiempo_ms: ms,
        respuesta_preview: '',
        respuesta_completa: '',
        timestamp_utc: after,
        workflow_copia_id: WF_ID,
        notas: 'timeout webhook ' + wh,
      });
      continue;
    }
    if (m.stockCount) stockCount = m.stockCount;
    m.writes.forEach((w) => writesSeen.add(w));
    const temp = m.temperatura || '(vacio)';
    rows.push({
      id: c.id,
      perfil_esperado: c.perfil_esperado,
      mensaje_usuario: c.mensaje_usuario,
      estado_actual_modelo: m.estado,
      lead_completo: m.leadCompleto,
      lead_block_temperatura: m.leadTemp,
      temperatura_final: temp,
      coincide: temp === c.perfil_esperado ? 'si' : 'no',
      exec_id: m.execId,
      tiempo_ms: ms,
      respuesta_preview: m.respuesta.replace(/\s+/g, ' ').slice(0, 240),
      respuesta_completa: m.respuesta,
      timestamp_utc: m.startedAt,
      workflow_copia_id: WF_ID,
      notas: m.status + (m.error ? ' ' + m.error : ''),
    });
    console.log(c.id, temp, rows[rows.length - 1].coincide, m.execId, m.writes.join('|') || 'sin-writes');
  }

  if (process.env.SMOKE === '1') {
    console.log('SMOKE_DONE', JSON.stringify(rows[0], null, 2).slice(0, 800));
    console.log('STOCK', stockCount, 'WRITES', [...writesSeen].join(','));
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fields = [
    'id',
    'perfil_esperado',
    'mensaje_usuario',
    'estado_actual_modelo',
    'lead_completo',
    'lead_block_temperatura',
    'temperatura_final',
    'coincide',
    'exec_id',
    'tiempo_ms',
    'respuesta_preview',
    'timestamp_utc',
    'workflow_copia_id',
  ];
  const csvPath = path.join(OUT, 'resultados_clasificacion_flujo3f132c3_' + stamp + '.csv');
  const mdPath = path.join(OUT, 'transcripcion_flujo3f132c3_' + stamp + '.md');
  const lines = [fields.join(',')];
  for (const r of rows) lines.push(fields.map((f) => csvEscape(r[f])).join(','));
  fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');
  const md = ['# Transcripción — flujo 3f132c3 (copia ' + WF_ID + ')', ''];
  for (const r of rows) {
    md.push('## ' + r.id + ' esperado ' + r.perfil_esperado + ' final ' + r.temperatura_final);
    md.push('');
    md.push('- exec_id: ' + r.exec_id);
    md.push('- estado_actual_modelo: ' + (r.estado_actual_modelo || '—'));
    md.push('- lead_block_temperatura: ' + (r.lead_block_temperatura || '—'));
    md.push('- lead_completo: ' + r.lead_completo);
    md.push('- coincide: ' + r.coincide);
    md.push('');
    md.push('**Cliente:** ' + r.mensaje_usuario);
    md.push('');
    md.push('**Bot:** ' + (r.respuesta_completa || '(sin texto)'));
    md.push('');
  }
  fs.writeFileSync(mdPath, md.join('\n'), 'utf8');
  fs.writeFileSync(
    path.join(OUT, '_flujo3f132c3_meta.json'),
    JSON.stringify({ stamp, stockCount, writes: [...writesSeen], n: rows.length, csvPath, mdPath }, null, 2),
  );
  console.log('OUT', csvPath);
  console.log('coincide', rows.filter((r) => r.coincide === 'si').length, '/', rows.length);
  console.log('STOCK', stockCount, 'WRITES', [...writesSeen].join(',') || 'ninguno');
  await request('POST', '/api/v1/workflows/' + WF_ID + '/deactivate');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
