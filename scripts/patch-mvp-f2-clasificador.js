#!/usr/bin/env node
'use strict';

/**
 * Fase 2 MVP: clasificador v1.1 en producción (Bot Telegram Inmobiliaria).
 * Idempotente. Uso:
 *   node scripts/patch-mvp-f2-clasificador.js [--deploy] [--dry]
 */
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  sha256,
  deepClone,
  systemMinFromAnexo,
  jsPrepararClasificacion,
  jsParsearRespuestaClasificador,
} = require('./tesis/lib/v11-shared');
const { loadEnv, apiKey, request } = require('./lib/n8n-http-helper');

const PROD_ID = '8JoSfkcn3pE1f0av';
const LOCAL = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');
const BACKUP_DIR = path.join(
  ROOT,
  'docs',
  'ops',
  `backup-workflows-${new Date().toISOString().slice(0, 10)}`,
);

function collectChain(wf, start) {
  const chain = new Set([start]);
  const q = [start];
  while (q.length) {
    const n = q.shift();
    for (const c of (wf.connections[n]?.main || []).flat()) {
      if (c?.node && !chain.has(c.node)) {
        chain.add(c.node);
        q.push(c.node);
      }
    }
  }
  return chain;
}

function byName(wf, name) {
  return (wf.nodes || []).find((n) => n.name === name);
}

function rewriteParsearToBase(obj) {
  const s = JSON.stringify(obj);
  return JSON.parse(s.replace(/\$\('Parsear Respuesta'\)/g, "$('Parsear Respuesta Base')"));
}

function buildParseJs() {
  return jsParsearRespuestaClasificador()
    .replace(
      "clasificacion_fuente = 'fallback_prompt_principal'",
      "clasificacion_fuente = 'fallback'",
    )
    .replace(
      /return \[\{ json: out \}\];\s*$/,
      `try {
  let histC = [];
  try { histC = JSON.parse(out.historial_json || '[]'); } catch (e) { histC = []; }
  const usersC = histC
    .filter((m) => m && String(m.role || '') === 'user')
    .map((m) => m.content || m.text || '');
  if (out.texto_usuario) usersC.push(out.texto_usuario);
  out.pipeline_conversando = (function (msgs) {
    const list = Array.isArray(msgs) ? msgs : [];
    if (!list.length) return true;
    const saludo = /^(hola|buen[oa]s?(?:\\s+(?:d[ií]as|tardes|noches))?|hey|hi|hello|qu[eé]\\s+tal|c[oó]mo\\s+va)\\b/i;
    return list.every((m) => {
      const t = String(m || '').trim();
      if (!t) return true;
      const words = t.split(/\\s+/).filter(Boolean);
      return words.length < 4 || saludo.test(t);
    });
  })(usersC);
} catch (eConv) {
  out.pipeline_conversando = false;
}
return [{ json: out }];
`,
    );
}

function applyLocal(wf, systemMin) {
  if (byName(wf, 'Preparar Clasificación') && byName(wf, 'HTTP Groq Clasificador')) {
    byName(wf, 'Preparar Clasificación').parameters.jsCode = jsPrepararClasificacion(systemMin);
    byName(wf, 'Parsear Respuesta').parameters.jsCode = buildParseJs();
    return { wf, already: true };
  }

  const parseOld = byName(wf, 'Parsear Respuesta');
  const groq = byName(wf, 'HTTP Groq');
  if (!parseOld || !groq) throw new Error('Faltan Parsear Respuesta o HTTP Groq');

  parseOld.name = 'Parsear Respuesta Base';

  // Cadena de respuesta TG lee desde Base (sin esperar clasificador)
  // Se aplica después de cablear conexiones; acá reescribimos nodos conocidos
  // y una segunda pasada al final de applyLocal sobre la cadena real.

  const posBase = parseOld.position || [3080, 480];
  const preparar = {
    id: 'mvp-f2-preparar-clasificacion',
    name: 'Preparar Clasificación',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [posBase[0] + 220, posBase[1] + 220],
    parameters: { jsCode: jsPrepararClasificacion(systemMin) },
  };

  const clasifHttp = deepClone(groq);
  clasifHttp.id = 'mvp-f2-http-groq-clasificador';
  clasifHttp.name = 'HTTP Groq Clasificador';
  clasifHttp.position = [posBase[0] + 440, posBase[1] + 220];
  clasifHttp.parameters = deepClone(groq.parameters);
  clasifHttp.credentials = deepClone(groq.credentials);
  clasifHttp.onError = groq.onError || 'continueRegularOutput';

  const parseNew = {
    id: 'mvp-f2-parsear-respuesta',
    name: 'Parsear Respuesta',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [posBase[0] + 660, posBase[1] + 220],
    parameters: { jsCode: buildParseJs() },
  };

  wf.nodes.push(preparar, clasifHttp, parseNew);

  const oldParseOut = deepClone(wf.connections['Parsear Respuesta'] || { main: [[]] });
  delete wf.connections['Parsear Respuesta'];
  const outs = oldParseOut.main?.[0] || [];
  const toReply = outs.filter((c) => c.node === 'IF Debe Responder TG');
  const rest = outs.filter((c) => c.node !== 'IF Debe Responder TG');

  wf.connections['Parsear Respuesta Base'] = {
    main: [
      [...toReply, { node: 'Preparar Clasificación', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Preparar Clasificación'] = {
    main: [[{ node: 'HTTP Groq Clasificador', type: 'main', index: 0 }]],
  };
  wf.connections['HTTP Groq Clasificador'] = {
    main: [[{ node: 'Parsear Respuesta', type: 'main', index: 0 }]],
  };
  wf.connections['Parsear Respuesta'] = { main: [rest] };

  for (const [src, conn] of Object.entries(wf.connections)) {
    for (const chain of conn.main || []) {
      for (const link of chain || []) {
        if (link.node === 'Parsear Respuesta' && src === 'HTTP Groq') {
          link.node = 'Parsear Respuesta Base';
        }
      }
    }
  }

  // Reescribir toda la cadena TG → Base
  for (const name of collectChain(wf, 'IF Debe Responder TG')) {
    const n = byName(wf, name);
    if (n?.parameters) n.parameters = rewriteParsearToBase(n.parameters);
  }

  return { wf, already: false };
}

function bumpColaTokens(wf) {
  const cola = byName(wf, 'Cola Tokens Groq');
  if (!cola?.parameters?.jsCode) return false;
  let code = cola.parameters.jsCode;
  if (code.includes('DEFAULT_EST = 6200') || code.includes('/* mvp-f2 +clasificador */')) {
    return false;
  }
  if (!code.includes('DEFAULT_EST = 5200')) return false;
  code = code.replace(
    'const DEFAULT_EST = 5200; // pedidos reales ~5k',
    'const DEFAULT_EST = 6200; /* mvp-f2 +clasificador ~1000 */',
  );
  if (code.includes('DEFAULT_EST = 5200')) {
    code = code.replace('DEFAULT_EST = 5200', 'DEFAULT_EST = 6200 /* mvp-f2 */');
  }
  cola.parameters.jsCode = code;
  return true;
}

async function deploy(wf) {
  loadEnv();
  const key = apiKey();
  const live = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  if (live.status >= 400) throw new Error(live.raw.slice(0, 300));
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(BACKUP_DIR, 'Bot-Telegram-Inmobiliaria-pre-f2.json'),
    JSON.stringify(live.json, null, 2),
  );
  const wasActive = !!live.json.active;
  if (wasActive) await request('POST', `/api/v1/workflows/${PROD_ID}/deactivate`, key);
  const body = {
    name: live.json.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: (live.json.settings && live.json.settings.executionOrder) || 'v1' },
  };
  const put = await request('PUT', `/api/v1/workflows/${PROD_ID}`, key, body);
  if (put.status >= 400) throw new Error(put.raw.slice(0, 400));
  if (wasActive) await request('POST', `/api/v1/workflows/${PROD_ID}/activate`, key);
  return { wasActive, backup: BACKUP_DIR };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const systemMin = systemMinFromAnexo();
  const hash = sha256(systemMin);
  const expected = '03c136d84c9c2878a1ff9339a143222644e368456991b47bec89a13ac7d57a44';
  if (hash !== expected) {
    throw new Error(`SYSTEM_MIN SHA mismatch: ${hash} != ${expected}`);
  }

  const local = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
  const { wf, already } = applyLocal(local, systemMin);
  const colaBumped = bumpColaTokens(wf);
  fs.writeFileSync(LOCAL, JSON.stringify(wf, null, 2) + '\n');

  const report = {
    ok: true,
    already,
    colaBumped,
    systemMinSha256: hash,
    nodes: {
      base: !!byName(wf, 'Parsear Respuesta Base'),
      preparar: !!byName(wf, 'Preparar Clasificación'),
      clasif: !!byName(wf, 'HTTP Groq Clasificador'),
      parsear: !!byName(wf, 'Parsear Respuesta'),
    },
  };

  if (args.has('--deploy') && !args.has('--dry')) {
    report.deploy = await deploy(wf);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
