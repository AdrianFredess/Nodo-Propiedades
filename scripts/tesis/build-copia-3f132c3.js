#!/usr/bin/env node
'use strict';

/**
 * Genera la copia TESIS-3f132c3 Campaña desde el tag.
 * node scripts/tesis/build-copia-3f132c3.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const {
  EXPECTED_HASHES,
  DISABLE_EFFECT,
  hashesFromWorkflow,
  assertExpectedHashes,
  sha256,
} = require('./lib/campana-utils');

const ROOT = path.join(__dirname, '..', '..');
const TAG = 'tesis-evaluacion-3f132c3';
const PLANILLAS = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'planillas-prueba.json');
const OUT_WF = path.join(ROOT, 'workflows', 'tesis', 'TESIS-3f132c3-campana.json');
const OUT_INT = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'integridad-generada.md');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function loadTagWorkflow() {
  const raw = execFileSync('git', ['show', `${TAG}:workflows/Bot Telegram Inmobiliaria.json`], {
    encoding: 'utf8',
    maxBuffer: 80e6,
    cwd: ROOT,
  });
  return JSON.parse(raw);
}

function setDocumentId(node, id) {
  if (!node.parameters) node.parameters = {};
  const cur = node.parameters.documentId;
  if (cur && typeof cur === 'object') {
    node.parameters.documentId = { ...cur, value: id, mode: cur.mode || 'id' };
  } else {
    node.parameters.documentId = {
      __rl: true,
      value: id,
      mode: 'id',
    };
  }
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function diffAllowed(tagWf, copyWf, planillas) {
  const issues = [];
  const tagByName = new Map((tagWf.nodes || []).map((n) => [n.name, n]));
  const copyByName = new Map((copyWf.nodes || []).map((n) => [n.name, n]));

  const expectedExtra = new Set(['Webhook', 'Normalizar Update Telegram']);
  const expectedMissing = new Set(['Telegram Trigger']);

  for (const name of copyByName.keys()) {
    if (!tagByName.has(name) && !expectedExtra.has(name)) {
      issues.push(`nodo extra no permitido: ${name}`);
    }
  }
  for (const name of tagByName.keys()) {
    if (!copyByName.has(name) && !expectedMissing.has(name)) {
      issues.push(`falta nodo del tag: ${name}`);
    }
  }

  for (const [name, tagNode] of tagByName) {
    if (expectedMissing.has(name)) continue;
    const copyNode = copyByName.get(name);
    if (!copyNode) continue;

    const tagSans = deepClone(tagNode);
    const copySans = deepClone(copyNode);
    delete tagSans.disabled;
    delete copySans.disabled;
    if (['Leer Historial', 'Actualizar Historial'].includes(name)) {
      delete tagSans.parameters?.documentId;
      delete copySans.parameters?.documentId;
    }
    if (name === 'Guardar Lead') {
      delete tagSans.parameters?.documentId;
      delete copySans.parameters?.documentId;
    }
    if (['Sync Leads_Bot', 'Registrar Consulta Telegram'].includes(name)) {
      delete tagSans.parameters?.documentId;
      delete copySans.parameters?.documentId;
    }

    if (JSON.stringify(tagSans) !== JSON.stringify(copySans)) {
      issues.push(`parámetros/estructura distintos en ${name}`);
    }

    const shouldDisable = DISABLE_EFFECT.has(name);
    if (!!copyNode.disabled !== shouldDisable) {
      issues.push(`disabled incorrecto en ${name}: ${!!copyNode.disabled}`);
    }
  }

  const histId = planillas.historial;
  const leadId = planillas.guardar_lead;
  const lbId = planillas.leads_bot_consultas;
  const checkDoc = (name, expected) => {
    const n = copyByName.get(name);
    const v = n?.parameters?.documentId?.value ?? n?.parameters?.documentId;
    if (String(v) !== String(expected)) {
      issues.push(`documentId de ${name}: ${v} != ${expected}`);
    }
  };
  checkDoc('Leer Historial', histId);
  checkDoc('Actualizar Historial', histId);
  checkDoc('Guardar Lead', leadId);
  checkDoc('Sync Leads_Bot', lbId);
  checkDoc('Registrar Consulta Telegram', lbId);

  // Conexiones: iguales al tag, salvo Telegram Trigger → Webhook + Normalizar
  const tagConns = deepClone(tagWf.connections || {});
  const copyConns = deepClone(copyWf.connections || {});
  delete tagConns['Telegram Trigger'];
  delete copyConns.Webhook;
  delete copyConns['Normalizar Update Telegram'];
  if (JSON.stringify(tagConns) !== JSON.stringify(copyConns)) {
    issues.push('conexiones fuera de las diferencias permitidas');
  }
  if (!copyWf.connections?.Webhook || !copyWf.connections?.['Normalizar Update Telegram']) {
    issues.push('faltan conexiones Webhook → Normalizar → Set Variables');
  }

  return issues;
}

function build() {
  const planillas = JSON.parse(fs.readFileSync(PLANILLAS, 'utf8'));
  const blob = JSON.stringify(planillas);
  if (blob.includes('COMPLETAR')) {
    fail('planillas-prueba.json todavía tiene "COMPLETAR"');
  }
  for (const k of ['historial', 'guardar_lead', 'leads_bot_consultas']) {
    if (!planillas[k] || typeof planillas[k] !== 'string') fail(`falta clave ${k}`);
  }

  const tagWf = loadTagWorkflow();
  const tagHashes = hashesFromWorkflow(tagWf);
  const badTag = assertExpectedHashes(tagHashes);
  if (badTag.length) fail(`hashes del tag no coinciden:\n${badTag.join('\n')}`);

  const src = deepClone(tagWf);
  const trigger = (src.nodes || []).find((n) => n.name === 'Telegram Trigger');
  if (!trigger) fail('no está Telegram Trigger en el tag');

  const today = new Date().toISOString().slice(0, 10);
  const webhook = {
    id: trigger.id,
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: trigger.position,
    webhookId: crypto.randomUUID(),
    parameters: {
      httpMethod: 'POST',
      path: 'tesis-3f132c3-campana',
      responseMode: 'onReceived',
      options: {},
    },
  };
  const unwrap = {
    id: 'tesis-campana-normalizar-update',
    name: 'Normalizar Update Telegram',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [trigger.position[0] + 220, trigger.position[1]],
    parameters: {
      jsCode:
        "const b = ($json && $json.body && $json.body.message) ? $json.body : $json;\nreturn [{ json: b }];",
    },
  };

  src.nodes = (src.nodes || []).filter((n) => n.name !== 'Telegram Trigger');
  src.nodes.push(webhook, unwrap);

  for (const n of src.nodes) {
    if (DISABLE_EFFECT.has(n.name)) n.disabled = true;
    if (n.name === 'Leer Historial' || n.name === 'Actualizar Historial') {
      setDocumentId(n, planillas.historial);
    }
    if (n.name === 'Guardar Lead') setDocumentId(n, planillas.guardar_lead);
    if (n.name === 'Sync Leads_Bot' || n.name === 'Registrar Consulta Telegram') {
      setDocumentId(n, planillas.leads_bot_consultas);
    }
  }

  const conns = src.connections || {};
  delete conns['Telegram Trigger'];
  conns.Webhook = {
    main: [[{ node: 'Normalizar Update Telegram', type: 'main', index: 0 }]],
  };
  conns['Normalizar Update Telegram'] = {
    main: [[{ node: 'Set Variables', type: 'main', index: 0 }]],
  };
  src.connections = conns;
  src.name = `TESIS-3f132c3 Campaña ${today}`;
  delete src.id;
  delete src.active;
  delete src.versionId;
  delete src.meta;
  delete src.tags;
  delete src.pinData;

  const copyHashes = hashesFromWorkflow(src);
  const badCopy = assertExpectedHashes(copyHashes);
  if (badCopy.length) fail(`hashes de la copia no coinciden:\n${badCopy.join('\n')}`);

  const issues = diffAllowed(tagWf, src, planillas);
  if (issues.length) fail(`diff no permitido:\n- ${issues.join('\n- ')}`);

  fs.mkdirSync(path.dirname(OUT_WF), { recursive: true });
  fs.writeFileSync(OUT_WF, JSON.stringify(src, null, 2) + '\n', 'utf8');

  const md = [
    '# Integridad generada — TESIS-3f132c3 Campaña',
    '',
    `- Tag: \`${TAG}\``,
    `- Fecha build: ${new Date().toISOString()}`,
    `- Workflow salida: \`workflows/tesis/TESIS-3f132c3-campana.json\``,
    `- Nombre: \`${src.name}\``,
    '',
    '## Hashes SHA-256',
    '',
    '| Pieza | Tag | Copia |',
    '|---|---|---|',
    `| Construir Prompt | \`${tagHashes.construir_prompt}\` | \`${copyHashes.construir_prompt}\` |`,
    `| Parsear Respuesta | \`${tagHashes.parsear_respuesta}\` | \`${copyHashes.parsear_respuesta}\` |`,
    `| HTTP Groq jsonBody | \`${tagHashes.http_groq_body}\` | \`${copyHashes.http_groq_body}\` |`,
    '',
    '## Planillas de prueba (documentId)',
    '',
    `- historial: \`${planillas.historial}\``,
    `- guardar_lead: \`${planillas.guardar_lead}\``,
    `- leads_bot_consultas: \`${planillas.leads_bot_consultas}\``,
    '',
    '## Diff permitido',
    '',
    '- Trigger: Telegram Trigger → Webhook POST `tesis-3f132c3-campana` + `Normalizar Update Telegram`',
    `- Nodos deshabilitados: ${[...DISABLE_EFFECT].join(', ')}`,
    '- documentId de historial / Guardar Lead / Leads_Bot+Consultas → copias de prueba',
    '- Resto de nodos, parámetros y conexiones: iguales al tag',
    '',
    `SHA-256 del JSON generado: \`${sha256(fs.readFileSync(OUT_WF))}\``,
    '',
  ].join('\n');
  fs.writeFileSync(OUT_INT, md, 'utf8');

  console.log('OK', OUT_WF);
  console.log('OK', OUT_INT);
  console.log(JSON.stringify({ tagHashes, copyHashes, planillas }, null, 2));
}

if (require.main === module) {
  try {
    build();
  } catch (e) {
    fail(e.message || String(e));
  }
}

module.exports = { build, diffAllowed, loadTagWorkflow, setDocumentId };
