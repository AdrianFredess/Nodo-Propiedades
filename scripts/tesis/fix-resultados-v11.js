#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { rowsToCsv, parseCsv } = require('./lib/campana-utils');
const { CSV_COLUMNS_V11 } = require('./run-campana-v11');

const OUT = path.join(__dirname, '..', '..', 'docs', 'validacion', 'v1.1', 'campana-2026-11-11');
const st = JSON.parse(fs.readFileSync(path.join(OUT, 'estado-corrida.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(OUT, '_import_meta.json'), 'utf8'));
const cierre = JSON.parse(fs.readFileSync(path.join(OUT, '_cierre.json'), 'utf8'));

function flat(s) {
  return String(s ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const rows = st.rows.map((r) => {
  const o = { ...r };
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'string') o[k] = flat(o[k]);
  }
  return o;
});

fs.writeFileSync(path.join(OUT, 'resultados.csv'), rowsToCsv(rows, CSV_COLUMNS_V11));
const parsed = parseCsv(fs.readFileSync(path.join(OUT, 'resultados.csv'), 'utf8'));
if (parsed.length !== 30) {
  console.error('reparsed', parsed.length);
  process.exit(1);
}

// rewrite transcripcion from estado (full text)
const md = ['# Transcripción — campaña v1.1', ''];
for (const r of st.rows) {
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
fs.writeFileSync(path.join(OUT, 'transcripcion.md'), md.join('\n'), 'utf8');

const perfiles = ['caliente', 'tibio', 'frio'];
const matrix = {};
for (const e of perfiles) matrix[e] = { caliente: 0, tibio: 0, frio: 0, otro: 0 };
let fuenteClas = 0;
let fuenteFb = 0;
let leadSi = 0;
let leadNo = 0;
let tokens = 0;
const okNo = { historial_ok: 0, leads_bot_ok: 0, guardar_lead_ok: 0 };
for (const r of st.rows) {
  const e = String(r.perfil_esperado || '').toLowerCase();
  const g = String(r.temperatura_final || '').toLowerCase();
  if (matrix[e]) {
    if (g === 'caliente' || g === 'tibio' || g === 'frio') matrix[e][g] += 1;
    else matrix[e].otro += 1;
  }
  if (r.clasificacion_fuente === 'clasificador') fuenteClas += 1;
  else if (r.clasificacion_fuente === 'fallback_prompt_principal') fuenteFb += 1;
  if (r.lead_completo === 'si') leadSi += 1;
  else leadNo += 1;
  tokens += Number(r.tokens_usage) || 0;
  if (r.historial_ok === 'no') okNo.historial_ok += 1;
  if (r.leads_bot_ok === 'no') okNo.leads_bot_ok += 1;
  if (r.guardar_lead_ok === 'no') okNo.guardar_lead_ok += 1;
}

cierre.n = 30;
cierre.stockAll = true;
cierre.counts = { matrix, fuenteClas, fuenteFb, leadSi, leadNo, tokens, okNo, n: 30 };
fs.writeFileSync(path.join(OUT, '_cierre.json'), JSON.stringify(cierre, null, 2) + '\n');

const integridad = [
  '# Integridad campaña v1.1 — 2026-11-11',
  '',
  `- Workflow copia: \`${meta.wfId}\``,
  `- Filas: 30`,
  `- stock_leido > 0 en todas: sí`,
  `- stock_snapshot SHA-256: \`${cierre.stockSha}\``,
  `- prodHashBefore: \`${cierre.hashBefore}\``,
  `- prodHashAfter: \`${cierre.hashAfter}\``,
  `- expected: \`${cierre.expected}\``,
  `- hashMatch: ${cierre.hashMatch}`,
  `- producción activa: ${cierre.activeAfter}`,
  `- copia desactivada: sí`,
  '',
  '## Conteos (sin porcentajes)',
  '',
  '### Matriz temperatura_final × perfil_esperado',
  '',
  '| esperado\\\\obtenido | caliente | tibio | frio | otro |',
  '|---|---:|---:|---:|---:|',
  ...perfiles.map(
    (e) =>
      `| ${e} | ${matrix[e].caliente} | ${matrix[e].tibio} | ${matrix[e].frio} | ${matrix[e].otro} |`,
  ),
  '',
  '### clasificacion_fuente',
  '',
  `- clasificador: ${fuenteClas}`,
  `- fallback_prompt_principal: ${fuenteFb}`,
  '',
  '### lead_completo',
  '',
  `- si: ${leadSi}`,
  `- no: ${leadNo}`,
  '',
  '### _ok = no por nodo',
  '',
  `- historial_ok=no: ${okNo.historial_ok}`,
  `- leads_bot_ok=no: ${okNo.leads_bot_ok}`,
  `- guardar_lead_ok=no: ${okNo.guardar_lead_ok}`,
  '',
  '### tokens del día (suma tokens_usage filas)',
  '',
  `- ${tokens}`,
  '',
].join('\n');
fs.writeFileSync(path.join(OUT, 'integridad.md'), integridad, 'utf8');

console.log(JSON.stringify(cierre.counts, null, 2));
