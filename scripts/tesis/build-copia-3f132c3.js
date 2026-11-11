#!/usr/bin/env node
'use strict';

/**
 * Genera la copia de campaña desde el tag 3f132c3 o desde un JSON base (v1.1).
 * node scripts/tesis/build-copia-3f132c3.js
 * node scripts/tesis/build-copia-3f132c3.js --base "workflows/tesis/Bot Telegram Inmobiliaria v1.1.json"
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

function parseArgs(argv) {
  const out = { base: null, outWf: null, outInt: null, namePrefix: null, webhookPath: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') out.base = argv[++i];
    else if (a === '--out') out.outWf = argv[++i];
    else if (a === '--integridad') out.outInt = argv[++i];
    else if (a === '--name-prefix') out.namePrefix = argv[++i];
    else if (a === '--webhook-path') out.webhookPath = argv[++i];
  }
  return out;
}

const CLI = parseArgs(process.argv);
const IS_V11 = Boolean(CLI.base);
const OUT_WF =
  CLI.outWf ||
  (IS_V11
    ? path.join(ROOT, 'workflows', 'tesis', 'TESIS-v1.1-campana.json')
    : path.join(ROOT, 'workflows', 'tesis', 'TESIS-3f132c3-campana.json'));
const OUT_INT =
  CLI.outInt ||
  (IS_V11
    ? path.join(ROOT, 'docs', 'validacion', 'v1.1', 'integridad-copia-campana.md')
    : path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3', 'integridad-generada.md'));
const NAME_PREFIX = CLI.namePrefix || (IS_V11 ? 'TESIS-v1.1 Campaña' : 'TESIS-3f132c3 Campaña');
const WEBHOOK_PATH = CLI.webhookPath || (IS_V11 ? 'tesis-v11-campana' : 'tesis-3f132c3-campana');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function loadTagWorkflow() {
  if (CLI.base) {
    const p = path.isAbsolute(CLI.base) ? CLI.base : path.join(ROOT, CLI.base);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  const raw = execFileSync('git', ['show', `${TAG}:workflows/Bot Telegram Inmobiliaria.json`], {
    encoding: 'utf8',
    maxBuffer: 80e6,
    cwd: ROOT,
  });
  return JSON.parse(raw);
}

function hashesForBase(wf) {
  const h = hashesFromWorkflow(wf);
  if (IS_V11) {
    const base = (wf.nodes || []).find((n) => n.name === 'Parsear Respuesta Base');
    h.parsear_respuesta = sha256(base?.parameters?.jsCode);
  }
  return h;
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
  const tagHashes = hashesForBase(tagWf);
  const badTag = assertExpectedHashes(tagHashes);
  if (badTag.length) fail(`hashes del tag/base no coinciden:\n${badTag.join('\n')}`);

  // Clasificador de v1.1 debe quedar habilitado (no está en DISABLE_EFFECT).
  if (IS_V11) {
    const clas = (tagWf.nodes || []).find((n) => n.name === 'HTTP Groq Clasificador');
    if (!clas) fail('base v1.1 sin HTTP Groq Clasificador');
    if (clas.disabled) fail('HTTP Groq Clasificador no puede estar disabled en la base');
  }

  const src = deepClone(tagWf);
  const trigger = (src.nodes || []).find((n) => n.name === 'Telegram Trigger');
  if (!trigger) fail('no está Telegram Trigger en el tag/base');

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
      path: WEBHOOK_PATH,
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
  src.name = `${NAME_PREFIX} ${today}`;
  delete src.id;
  delete src.active;
  delete src.versionId;
  delete src.meta;
  delete src.tags;
  delete src.pinData;

  const copyHashes = hashesForBase(src);
  const badCopy = assertExpectedHashes(copyHashes);
  if (badCopy.length) fail(`hashes de la copia no coinciden:\n${badCopy.join('\n')}`);

  if (IS_V11) {
    const clasCopy = (src.nodes || []).find((n) => n.name === 'HTTP Groq Clasificador');
    if (clasCopy?.disabled) fail('HTTP Groq Clasificador quedó disabled (debe habilitado)');
  }

  const issues = diffAllowed(tagWf, src, planillas);
  if (issues.length) fail(`diff no permitido:\n- ${issues.join('\n- ')}`);

  fs.mkdirSync(path.dirname(OUT_WF), { recursive: true });
  fs.writeFileSync(OUT_WF, JSON.stringify(src, null, 2) + '\n', 'utf8');

  const parseLabel = IS_V11 ? 'Parsear Respuesta Base' : 'Parsear Respuesta';
  const md = [
    `# Integridad generada — ${NAME_PREFIX}`,
    '',
    IS_V11 ? `- Base: \`${CLI.base}\`` : `- Tag: \`${TAG}\``,
    `- Fecha build: ${new Date().toISOString()}`,
    `- Workflow salida: \`${path.relative(ROOT, OUT_WF).replace(/\\/g, '/')}\``,
    `- Nombre: \`${src.name}\``,
    '',
    '## Hashes SHA-256',
    '',
    '| Pieza | Tag/Base | Copia |',
    '|---|---|---|',
    `| Construir Prompt | \`${tagHashes.construir_prompt}\` | \`${copyHashes.construir_prompt}\` |`,
    `| ${parseLabel} | \`${tagHashes.parsear_respuesta}\` | \`${copyHashes.parsear_respuesta}\` |`,
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
    `- Trigger: Telegram Trigger → Webhook POST \`${WEBHOOK_PATH}\` + \`Normalizar Update Telegram\``,
    `- Nodos deshabilitados: ${[...DISABLE_EFFECT].join(', ')}`,
    IS_V11 ? '- `HTTP Groq Clasificador`: habilitado' : '',
    '- documentId de historial / Guardar Lead / Leads_Bot+Consultas → copias de prueba',
    '- Resto de nodos, parámetros y conexiones: iguales a la base',
    '',
    `SHA-256 del JSON generado: \`${sha256(fs.readFileSync(OUT_WF))}\``,
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
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
