#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  parseGroqRetry,
  rowFromExecution,
  extractEstadoActual,
  isRescate,
  CSV_COLUMNS,
  rowsToCsv,
  parseCsv,
} = require('./lib/campana-utils');
const { diffAllowed, loadTagWorkflow } = require('./build-copia-3f132c3');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'fixtures', 'executions.json');
const GUION = path.join(ROOT, 'docs', 'validacion', 'guion_conversaciones_perfil.csv');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    failed += 1;
    console.error('FAIL', name, e.message || e);
  }
}

check('parse try again in 1.234s', () => {
  const r = parseGroqRetry('Rate limit: try again in 1.234s');
  assert.strictEqual(r.kind, 'tpm');
  assert.strictEqual(r.waitMs, 1234);
});

check('parse try again in 600ms', () => {
  const r = parseGroqRetry('Rate limit reached. Please try again in 600ms');
  assert.strictEqual(r.kind, 'tpm');
  assert.strictEqual(r.waitMs, 600);
});

check('parse 429 tokens per day', () => {
  const r = parseGroqRetry({
    error: { message: 'Rate limit exceeded: tokens per day (TPD). Please try again tomorrow.' },
  });
  assert.strictEqual(r.kind, 'tpd');
});

check('fixture lead completo', () => {
  const fixtures = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'))[0];
  const row = rowFromExecution({ guion, chatId: 891000001, intento: 1, exec: fixtures[0] });
  assert.strictEqual(row.lead_completo, 'si');
  assert.strictEqual(row.temperatura_estado_actual, 'caliente');
  assert.strictEqual(row.stock_leido, '2');
  assert.strictEqual(row.guardar_lead_ok, 'si');
  assert.ok(Number(row.t_total_ms) > 0);
});

check('fixture sin lead completo', () => {
  const fixtures = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'))[1];
  const row = rowFromExecution({ guion, chatId: 891000002, intento: 1, exec: fixtures[1] });
  assert.strictEqual(row.lead_completo, 'no');
  assert.strictEqual(row.guardar_lead_ok, '');
  assert.strictEqual(row.temperatura_estado_actual, 'frio');
});

check('fixture sin tag → sin_tag aunque Parsear diga frio', () => {
  const fixtures = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'))[2];
  const row = rowFromExecution({ guion, chatId: 891000003, intento: 1, exec: fixtures[2] });
  assert.strictEqual(extractEstadoActual('Hola').temperatura_estado_actual, 'sin_tag');
  assert.strictEqual(row.temperatura_estado_actual, 'sin_tag');
  assert.strictEqual(row.estado_actual_crudo, '');
});

check('fixture rescate', () => {
  const fixtures = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'))[3];
  const row = rowFromExecution({ guion, chatId: 891000004, intento: 1, exec: fixtures[3] });
  assert.strictEqual(isRescate(row.respuesta_completa), 'si');
  assert.strictEqual(row.es_rescate, 'si');
  assert.strictEqual(row.temperatura_estado_actual, 'sin_tag');
});

check('fixture error Sheets', () => {
  const fixtures = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'))[4];
  const row = rowFromExecution({ guion, chatId: 891000005, intento: 1, exec: fixtures[4] });
  assert.strictEqual(row.historial_ok, 'no');
  assert.strictEqual(row.leads_bot_ok, 'no');
  assert.ok(row.notas.includes('invalid_grant') || row.notas.includes('historial'));
});

check('CSV tiene todas las columnas', () => {
  const fixtures = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const guion = parseCsv(fs.readFileSync(GUION, 'utf8'));
  const rows = fixtures.map((exec, i) =>
    rowFromExecution({ guion: guion[i], chatId: 891000001 + i, intento: 1, exec }),
  );
  const csv = rowsToCsv(rows);
  const header = csv.split(/\n/)[0].split(',');
  assert.deepStrictEqual(header, CSV_COLUMNS);
});

check('autocontrol build: diff no permitido falla', () => {
  const tag = loadTagWorkflow();
  const bad = JSON.parse(JSON.stringify(tag));
  bad.nodes.push({
    name: 'Nodo Pirateado',
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
  });
  const issues = diffAllowed(tag, bad, {
    historial: 'h',
    guardar_lead: 'g',
    leads_bot_consultas: 'l',
  });
  assert.ok(issues.some((x) => /Nodo Pirateado|extra/.test(x)));
});

check('build falla con COMPLETAR', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'build-copia-3f132c3.js')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.notStrictEqual(r.status, 0);
  assert.ok(/COMPLETAR/i.test(r.stderr + r.stdout));
});

if (failed) {
  console.error(`\n${failed} test(s) fallaron`);
  process.exit(1);
}
console.log('\nTodos los tests OK');
