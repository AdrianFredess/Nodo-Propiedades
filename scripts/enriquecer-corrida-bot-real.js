/**
 * T1 — enriquece el CSV de la corrida 13661–13694 sin reejecutar.
 * node scripts/enriquecer-corrida-bot-real.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(
  ROOT,
  'docs',
  'validacion',
  'resultados_clasificacion_bot_real_2026-09-28T20-29-34-378Z.csv',
);
const WF = '8JoSfkcn3pE1f0av';

function apiKey() {
  const code = [
    'import sqlite3',
    'c=sqlite3.connect(r"file:C:/Users/adrian/.n8n/database.sqlite?mode=ro", uri=True)',
    'row=c.execute("SELECT apiKey FROM user_api_keys WHERE label=?", ("n8n",)).fetchone()',
    'print(row[0] if row else "")',
  ].join('; ');
  return execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
}

function api(urlPath, key) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method: 'GET',
        headers: { 'X-N8N-API-KEY': key },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(new Error(buf.slice(0, 300)));
          }
        });
      },
    );
    r.on('error', reject);
    r.end();
  });
}

function pick(run, name) {
  const arr = run[name];
  if (!arr?.[0]?.data?.main?.[0]?.[0]) return null;
  return arr[0].data.main[0][0].json || null;
}

function groqText(json) {
  if (!json) return '';
  if (typeof json === 'string') return json;
  const msg = json.choices?.[0]?.message;
  if (msg) return String(msg.content || msg.reasoning || '');
  if (json.text) return String(json.text);
  if (json.content) return String(json.content);
  if (json.body) return groqText(json.body);
  return '';
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length);
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

async function main() {
  const key = apiKey();
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const extra = [
    'estado_actual_modelo',
    'senales_modelo',
    'temperatura_motivo',
    'puede_clasificar',
    'lead_block_temperatura',
    'handoff',
    'solicitud_visita',
  ];
  for (const row of rows) {
    const full = await api(`/api/v1/executions/${row.exec_id}?includeData=true`, key);
    const run = full?.data?.resultData?.runData || {};
    const parsear = pick(run, 'Parsear Respuesta') || {};
    let raw = '';
    for (const name of Object.keys(run)) {
      if (/groq/i.test(name)) {
        const j = pick(run, name);
        const t = groqText(j);
        if (t.length > raw.length) raw = t;
      }
    }
    const est = raw.match(/###ESTADO_ACTUAL:(frio|tibio|caliente)###/i);
    const sen = raw.match(/###SENALES###\s*({[\s\S]*?})\s*###FIN_SENALES###/i);
    const lead = raw.match(/###LEAD_COMPLETO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_LEAD###/);
    let leadTemp = '';
    if (lead) {
      try {
        leadTemp = String(JSON.parse(lead[1]).temperatura || '').toLowerCase();
      } catch (_) {
        leadTemp = '';
      }
    }
    const motivo = String(parsear.temperatura_motivo || '');
    row.estado_actual_modelo = est ? est[1].toLowerCase() : '';
    row.senales_modelo = sen ? sen[1].replace(/\s+/g, ' ') : '';
    row.temperatura_motivo = motivo;
    row.puede_clasificar = motivo === 'temprano_sin_clasificar' ? 'false' : motivo ? 'true' : '';
    row.lead_block_temperatura = leadTemp;
    row.handoff = String(parsear.handoff || '');
    row.solicitud_visita = String(parsear.solicitud_visita || '');
    if (String(full?.workflowId || '') && full.workflowId !== WF) {
      row.notas = (row.notas || '') + ' | workflow distinto ' + full.workflowId;
    }
    console.log(
      row.id,
      'motivo=' + motivo,
      'estado=' + row.estado_actual_modelo,
      'lead=' + leadTemp,
      'visita=' + row.solicitud_visita,
      'handoff=' + row.handoff,
      'temp=' + parsear.temperatura,
    );
  }

  const fields = Object.keys(rows[0]);
  for (const f of extra) if (!fields.includes(f)) fields.push(f);
  const lines = [fields.join(',')];
  for (const r of rows) lines.push(fields.map((f) => csvEscape(r[f])).join(','));
  fs.writeFileSync(CSV, lines.join('\n') + '\n', 'utf8');

  const motivos = {};
  for (const r of rows) motivos[r.temperatura_motivo] = (motivos[r.temperatura_motivo] || 0) + 1;
  console.log('MOTIVOS', JSON.stringify(motivos));
  const cal02 = rows.find((r) => r.id === 'CAL-02');
  console.log(
    'CAL-02',
    JSON.stringify({
      motivo: cal02.temperatura_motivo,
      temp: cal02.clasificacion_obtenida,
      visita: cal02.solicitud_visita,
      handoff: cal02.handoff,
      estado: cal02.estado_actual_modelo,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
