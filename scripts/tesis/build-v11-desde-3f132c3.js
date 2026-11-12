#!/usr/bin/env node
'use strict';

/**
 * Construye v1.1 desde el tag tesis-evaluacion-3f132c3.
 * Falla si aparece cualquier diferencia fuera de los puntos 1–6 del spec.
 */
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  TAG,
  EXPECTED_PARSEAR_BASE,
  EXPECTED_CONSTRUIR,
  EXPECTED_GROQ_BODY,
  sha256,
  deepClone,
  loadTagWorkflow,
  systemMinFromAnexo,
  systemMinFromBatchAtTag,
  jsPrepararClasificacion,
  jsParsearRespuestaClasificador,
} = require('./lib/v11-shared');

const OUT_WF = path.join(ROOT, 'workflows', 'tesis', 'Bot Telegram Inmobiliaria v1.1.json');
const OUT_INT = path.join(ROOT, 'docs', 'validacion', 'v1.1', 'integridad-v1.1.md');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function byName(wf, name) {
  return (wf.nodes || []).find((n) => n.name === name);
}

function applyV11(tagWf, systemMin) {
  const wf = deepClone(tagWf);
  const parseOld = byName(wf, 'Parsear Respuesta');
  if (!parseOld) throw new Error('Parsear Respuesta no está en el tag');
  const groq = byName(wf, 'HTTP Groq');
  if (!groq) throw new Error('HTTP Groq no está en el tag');
  const tg = byName(wf, 'Telegram Responder');
  if (!tg) throw new Error('Telegram Responder no está en el tag');

  // 1. Renombrar Parsear Respuesta → Parsear Respuesta Base (jsCode intacto)
  parseOld.name = 'Parsear Respuesta Base';

  // 6. Telegram lee de Base
  const rewrite = (s) =>
    String(s || '').replace(/\$\('Parsear Respuesta'\)/g, "$('Parsear Respuesta Base')");
  if (tg.parameters) {
    if (tg.parameters.text != null) tg.parameters.text = rewrite(tg.parameters.text);
    if (tg.parameters.chatId != null) tg.parameters.chatId = rewrite(tg.parameters.chatId);
  }

  const posBase = parseOld.position || [3080, 480];

  // 2. Preparar Clasificación
  const preparar = {
    id: 'v11-preparar-clasificacion',
    name: 'Preparar Clasificación',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [posBase[0] + 220, posBase[1] + 220],
    parameters: {
      jsCode: jsPrepararClasificacion(systemMin),
    },
  };

  // 3. HTTP Groq Clasificador (misma URL/credencial/headers/onError/neverError que HTTP Groq)
  const clasifHttp = deepClone(groq);
  clasifHttp.id = 'v11-http-groq-clasificador';
  clasifHttp.name = 'HTTP Groq Clasificador';
  clasifHttp.position = [posBase[0] + 440, posBase[1] + 220];
  // body desde Preparar Clasificación ($json.messages) — misma plantilla que HTTP Groq
  clasifHttp.parameters = deepClone(groq.parameters);
  clasifHttp.credentials = deepClone(groq.credentials);
  if (groq.onError != null) clasifHttp.onError = groq.onError;
  else clasifHttp.onError = 'continueRegularOutput';
  if (groq.continueOnFail != null) clasifHttp.continueOnFail = groq.continueOnFail;
  if (groq.retryOnFail != null) clasifHttp.retryOnFail = groq.retryOnFail;
  if (groq.maxTries != null) clasifHttp.maxTries = groq.maxTries;
  if (groq.waitBetweenTries != null) clasifHttp.waitBetweenTries = groq.waitBetweenTries;

  // 4. Parsear Respuesta (nuevo)
  const parseNew = {
    id: 'v11-parsear-respuesta',
    name: 'Parsear Respuesta',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [posBase[0] + 660, posBase[1] + 220],
    parameters: {
      jsCode: jsParsearRespuestaClasificador(),
    },
  };

  wf.nodes.push(preparar, clasifHttp, parseNew);

  // 5. Conexiones
  const oldParseOut = deepClone(wf.connections['Parsear Respuesta'] || { main: [[]] });
  delete wf.connections['Parsear Respuesta'];

  const outs = oldParseOut.main?.[0] || [];
  const toTelegram = outs.filter((c) => c.node === 'Telegram Responder');
  const rest = outs.filter((c) => c.node !== 'Telegram Responder');

  wf.connections['Parsear Respuesta Base'] = {
    main: [
      [
        ...toTelegram,
        { node: 'Preparar Clasificación', type: 'main', index: 0 },
      ],
    ],
  };
  wf.connections['Preparar Clasificación'] = {
    main: [[{ node: 'HTTP Groq Clasificador', type: 'main', index: 0 }]],
  };
  wf.connections['HTTP Groq Clasificador'] = {
    main: [[{ node: 'Parsear Respuesta', type: 'main', index: 0 }]],
  };
  wf.connections['Parsear Respuesta'] = {
    main: [rest],
  };

  // Entrada a Base: lo que antes iba a Parsear Respuesta
  for (const [src, conn] of Object.entries(wf.connections)) {
    for (const chain of conn.main || []) {
      for (const link of chain || []) {
        if (link.node === 'Parsear Respuesta' && src === 'HTTP Groq') {
          link.node = 'Parsear Respuesta Base';
        }
      }
    }
  }

  wf.name = 'Bot Telegram Inmobiliaria v1.1';
  delete wf.id;
  delete wf.active;
  delete wf.versionId;
  delete wf.meta;
  delete wf.tags;
  delete wf.pinData;

  return wf;
}

function assertOnlyAllowedDiff(tagWf, v11, systemMin) {
  const issues = [];
  const tagBy = new Map((tagWf.nodes || []).map((n) => [n.name, n]));
  const vBy = new Map((v11.nodes || []).map((n) => [n.name, n]));

  const allowedNew = new Set([
    'Preparar Clasificación',
    'HTTP Groq Clasificador',
    'Parsear Respuesta',
  ]);
  const renamed = 'Parsear Respuesta Base';

  for (const name of vBy.keys()) {
    if (!tagBy.has(name) && !allowedNew.has(name) && name !== renamed) {
      issues.push(`nodo extra no permitido: ${name}`);
    }
  }
  for (const name of tagBy.keys()) {
    if (name === 'Parsear Respuesta') continue;
    if (!vBy.has(name)) issues.push(`falta nodo del tag: ${name}`);
  }
  if (!vBy.has(renamed)) issues.push('falta Parsear Respuesta Base');
  for (const n of allowedNew) {
    if (!vBy.has(n)) issues.push(`falta nodo nuevo: ${n}`);
  }

  // Nodos inalterados (excepto Telegram Responder expresiones)
  for (const [name, tagNode] of tagBy) {
    if (name === 'Parsear Respuesta') continue;
    const cur = vBy.get(name);
    if (!cur) continue;
    if (name === 'Telegram Responder') {
      const t = deepClone(tagNode);
      const c = deepClone(cur);
      const rewrite = (s) =>
        String(s || '').replace(/\$\('Parsear Respuesta'\)/g, "$('Parsear Respuesta Base')");
      if (t.parameters?.text) t.parameters.text = rewrite(t.parameters.text);
      if (t.parameters?.chatId) t.parameters.chatId = rewrite(t.parameters.chatId);
      if (JSON.stringify(t) !== JSON.stringify(c)) {
        issues.push('Telegram Responder: cambios fuera de las expresiones Parsear→Base');
      }
      continue;
    }
    if (JSON.stringify(tagNode) !== JSON.stringify(cur)) {
      issues.push(`nodo modificado fuera de lo permitido: ${name}`);
    }
  }

  // Base = viejo Parsear con nombre nuevo
  const tagParse = tagBy.get('Parsear Respuesta');
  const base = vBy.get(renamed);
  const expectBase = deepClone(tagParse);
  expectBase.name = renamed;
  if (JSON.stringify(expectBase) !== JSON.stringify(base)) {
    issues.push('Parsear Respuesta Base no es el Parsear del tag renombrado (jsCode debe ser idéntico)');
  }
  const baseHash = sha256(base?.parameters?.jsCode);
  if (baseHash !== EXPECTED_PARSEAR_BASE) {
    issues.push(`hash Parsear Respuesta Base ${baseHash} != ${EXPECTED_PARSEAR_BASE}`);
  }

  // Construir / HTTP Groq intactos
  const construirHash = sha256(byName(v11, 'Construir Prompt')?.parameters?.jsCode);
  const groqHash = sha256(byName(v11, 'HTTP Groq')?.parameters?.jsonBody);
  if (construirHash !== EXPECTED_CONSTRUIR) {
    issues.push(`hash Construir Prompt distinto: ${construirHash}`);
  }
  if (groqHash !== EXPECTED_GROQ_BODY) {
    issues.push(`hash HTTP Groq body distinto: ${groqHash}`);
  }

  // SYSTEM_MIN en Preparar
  const prepCode = byName(v11, 'Preparar Clasificación')?.parameters?.jsCode || '';
  if (!prepCode.includes(JSON.stringify(systemMin))) {
    issues.push('SYSTEM_MIN embebido no coincide byte a byte con Anexo F');
  }
  const smHash = sha256(systemMin);

  // HTTP Clasificador ≈ HTTP Groq
  const groq = byName(v11, 'HTTP Groq');
  const clas = byName(v11, 'HTTP Groq Clasificador');
  if (clas?.parameters?.url !== groq?.parameters?.url) issues.push('URL clasificador distinta');
  if (JSON.stringify(clas?.credentials) !== JSON.stringify(groq?.credentials)) {
    issues.push('credencial clasificador distinta');
  }
  if (clas?.parameters?.jsonBody !== groq?.parameters?.jsonBody) {
    issues.push('jsonBody plantilla clasificador distinta de HTTP Groq');
  }

  // Conexiones
  const baseOut = v11.connections['Parsear Respuesta Base']?.main?.[0] || [];
  const hasTg = baseOut.some((c) => c.node === 'Telegram Responder');
  const hasPrep = baseOut.some((c) => c.node === 'Preparar Clasificación');
  if (!hasTg || !hasPrep) issues.push('Parsear Respuesta Base debe ir a Telegram y Preparar Clasificación');
  if (baseOut.length !== 2) issues.push(`Parsear Respuesta Base salidas inesperadas: ${baseOut.length}`);

  const prepOut = v11.connections['Preparar Clasificación']?.main?.[0] || [];
  if (prepOut.length !== 1 || prepOut[0].node !== 'HTTP Groq Clasificador') {
    issues.push('Preparar Clasificación → HTTP Groq Clasificador incorrecto');
  }
  const httpOut = v11.connections['HTTP Groq Clasificador']?.main?.[0] || [];
  if (httpOut.length !== 1 || httpOut[0].node !== 'Parsear Respuesta') {
    issues.push('HTTP Groq Clasificador → Parsear Respuesta incorrecto');
  }

  const tagOuts = (tagWf.connections['Parsear Respuesta']?.main?.[0] || [])
    .filter((c) => c.node !== 'Telegram Responder')
    .map((c) => c.node)
    .sort();
  const newOuts = (v11.connections['Parsear Respuesta']?.main?.[0] || []).map((c) => c.node).sort();
  if (JSON.stringify(tagOuts) !== JSON.stringify(newOuts)) {
    issues.push(`salidas de Parsear Respuesta distintas: ${newOuts.join(',')} vs ${tagOuts.join(',')}`);
  }

  // HTTP Groq → Base
  const groqTo = (v11.connections['HTTP Groq']?.main?.[0] || []).map((c) => c.node);
  if (!groqTo.includes('Parsear Respuesta Base')) {
    issues.push('HTTP Groq no conecta a Parsear Respuesta Base');
  }

  // Resto de conexiones: sin cambios salvo las tocadas
  const tagConns = deepClone(tagWf.connections || {});
  const vConns = deepClone(v11.connections || {});
  delete tagConns['Parsear Respuesta'];
  delete vConns['Parsear Respuesta'];
  delete vConns['Parsear Respuesta Base'];
  delete vConns['Preparar Clasificación'];
  delete vConns['HTTP Groq Clasificador'];
  // HTTP Groq target cambió
  const tagGroq = deepClone(tagConns['HTTP Groq']);
  const vGroq = deepClone(vConns['HTTP Groq']);
  delete tagConns['HTTP Groq'];
  delete vConns['HTTP Groq'];
  if (JSON.stringify(tagConns) !== JSON.stringify(vConns)) {
    issues.push('conexiones no relacionadas modificadas');
  }
  const tagGroqTargets = (tagGroq?.main?.[0] || []).map((c) =>
    c.node === 'Parsear Respuesta' ? 'Parsear Respuesta Base' : c.node,
  );
  const vGroqTargets = (vGroq?.main?.[0] || []).map((c) => c.node);
  if (JSON.stringify(tagGroqTargets) !== JSON.stringify(vGroqTargets)) {
    issues.push('conexiones de HTTP Groq fuera de lo permitido');
  }

  return { issues, smHash, construirHash, groqHash, baseHash };
}

function fullDiffReport(tagWf, v11) {
  const lines = [];
  const tagNames = new Set((tagWf.nodes || []).map((n) => n.name));
  const vNames = new Set((v11.nodes || []).map((n) => n.name));
  const added = [...vNames].filter((n) => !tagNames.has(n) && n !== 'Parsear Respuesta Base');
  const removed = [...tagNames].filter((n) => !vNames.has(n) && n !== 'Parsear Respuesta');
  const renamed = tagNames.has('Parsear Respuesta') && vNames.has('Parsear Respuesta Base');
  lines.push('### Nodos');
  if (renamed) lines.push('- Renombrado: `Parsear Respuesta` → `Parsear Respuesta Base`');
  for (const n of added) lines.push(`- Agregado: \`${n}\``);
  for (const n of removed) lines.push(`- Eliminado: \`${n}\``);
  lines.push('- `Telegram Responder`: expresiones `$(\'Parsear Respuesta\')` → `$(\'Parsear Respuesta Base\')`');
  lines.push('');
  lines.push('### Conexiones');
  lines.push('- `HTTP Groq` → `Parsear Respuesta Base`');
  lines.push('- `Parsear Respuesta Base` → `Telegram Responder`, `Preparar Clasificación`');
  lines.push('- `Preparar Clasificación` → `HTTP Groq Clasificador` → `Parsear Respuesta`');
  lines.push(
    '- `Parsear Respuesta` → ' +
      (v11.connections['Parsear Respuesta']?.main?.[0] || []).map((c) => `\`${c.node}\``).join(', '),
  );
  return lines.join('\n');
}

function build() {
  const systemMinAnexo = systemMinFromAnexo();
  const systemMinBatch = systemMinFromBatchAtTag();
  if (systemMinAnexo !== systemMinBatch) {
    fail(
      `SYSTEM_MIN Anexo vs batch difieren\nanexo:${sha256(systemMinAnexo)}\nbatch:${sha256(systemMinBatch)}`,
    );
  }

  const tagWf = loadTagWorkflow();
  const v11 = applyV11(tagWf, systemMinAnexo);
  const check = assertOnlyAllowedDiff(tagWf, v11, systemMinAnexo);
  if (check.issues.length) fail(`diff no permitido:\n- ${check.issues.join('\n- ')}`);

  fs.mkdirSync(path.dirname(OUT_WF), { recursive: true });
  fs.writeFileSync(OUT_WF, JSON.stringify(v11, null, 2) + '\n', 'utf8');
  fs.mkdirSync(path.dirname(OUT_INT), { recursive: true });

  const md = [
    '# Integridad v1.1',
    '',
    `- Tag base: \`${TAG}\``,
    `- Build: ${new Date().toISOString()}`,
    `- Workflow: \`workflows/tesis/Bot Telegram Inmobiliaria v1.1.json\``,
    '',
    '## Hashes (deben coincidir con el tag)',
    '',
    '| Pieza | Tag / esperado | v1.1 |',
    '|---|---|---|',
    `| Construir Prompt | \`${EXPECTED_CONSTRUIR}\` | \`${check.construirHash}\` |`,
    `| HTTP Groq jsonBody | \`${EXPECTED_GROQ_BODY}\` | \`${check.groqHash}\` |`,
    `| Parsear Respuesta Base (jsCode) | \`${EXPECTED_PARSEAR_BASE}\` | \`${check.baseHash}\` |`,
    `| SYSTEM_MIN (Anexo F) | \`${check.smHash}\` | \`${sha256(systemMinAnexo)}\` |`,
    '',
    '## Diff completo vs tag (solo puntos 1–6)',
    '',
    fullDiffReport(tagWf, v11),
    '',
    `SHA-256 JSON v1.1: \`${sha256(fs.readFileSync(OUT_WF))}\``,
    '',
  ].join('\n');
  fs.writeFileSync(OUT_INT, md, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        out: OUT_WF,
        integridad: OUT_INT,
        hashes: {
          construir: check.construirHash,
          groq: check.groqHash,
          parsear_base: check.baseHash,
          system_min: check.smHash,
        },
      },
      null,
      2,
    ),
  );
  return { v11, check, systemMin: systemMinAnexo };
}

if (require.main === module) {
  try {
    build();
  } catch (e) {
    fail(e.stack || e.message || String(e));
  }
}

module.exports = { build, applyV11, assertOnlyAllowedDiff };
