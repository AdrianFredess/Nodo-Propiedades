#!/usr/bin/env node
'use strict';

/**
 * Fase 3: Leer Config Bot en vivo (ws-bridge) + patch Construir Prompt.
 * Uso: node scripts/patch-mvp-f3-config-vivo.js [--deploy]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, loadEnv, apiKey, request } = require('./lib/n8n-http-helper');

const PROD = '8JoSfkcn3pE1f0av';
const LOCAL = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');

const LEER_CODE = `const CACHE_MS = 60 * 1000;
const sd = $getWorkflowStaticData('global');
if (!sd.botConfigCache) sd.botConfigCache = { at: 0, config: null };
const now = Date.now();
const j = $input.first().json || {};
let cfg = null;
let fuente = 'embed';
try {
  if (sd.botConfigCache.config && now - Number(sd.botConfigCache.at || 0) < CACHE_MS) {
    cfg = sd.botConfigCache.config;
    fuente = 'cache';
  } else {
    const http = $input.first().json || {};
    // Si este Code corre DESPUÉS del HTTP, $json es la respuesta
    if (http && (http.tono || http.config)) {
      cfg = http.config || http;
      fuente = 'http';
      sd.botConfigCache = { at: now, config: cfg };
    }
  }
} catch (e) {}
if (!cfg && sd.botConfigCache && sd.botConfigCache.config) {
  cfg = sd.botConfigCache.config;
  fuente = 'last_good';
}
sd.botConfig = cfg || sd.botConfig || null;
return [{ json: Object.assign({}, j, { bot_config: cfg, bot_config_fuente: fuente }) }];
`;

function byName(wf, name) {
  return (wf.nodes || []).find((n) => n.name === name);
}

function apply(wf) {
  const construir = byName(wf, 'Construir Prompt');
  const esperar = byName(wf, 'Esperar Lecturas');
  if (!construir || !esperar) throw new Error('faltan nodos');

  let http = byName(wf, 'HTTP Leer Config Bot');
  let code = byName(wf, 'Leer Config Bot');

  if (!http) {
    const pos = construir.position || [2000, 400];
    http = {
      id: 'mvp-f3-http-bot-config',
      name: 'HTTP Leer Config Bot',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [pos[0] - 360, pos[1] - 40],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'GET',
        url: 'http://host.docker.internal:3099/bot-config',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'X-Panel-Token',
              value: '={{ $env.PANEL_API_TOKEN || "" }}',
            },
          ],
        },
        options: {
          timeout: 5000,
          response: { response: { neverError: true } },
        },
      },
    };
    wf.nodes.push(http);
  }

  if (!code) {
    const pos = construir.position || [2000, 400];
    code = {
      id: 'mvp-f3-leer-config-bot',
      name: 'Leer Config Bot',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [pos[0] - 180, pos[1] - 40],
      onError: 'continueRegularOutput',
      parameters: { jsCode: LEER_CODE },
    };
    wf.nodes.push(code);
  } else {
    code.parameters.jsCode = LEER_CODE;
  }

  // Esperar Lecturas → HTTP Leer Config → Leer Config → Construir Prompt
  // Keep Esperar Lecturas also feeding parallel? Spec: before Construir Prompt.
  const prev = wf.connections['Esperar Lecturas']?.main?.[0] || [];
  const withoutConstruir = prev.filter((c) => c.node !== 'Construir Prompt' && c.node !== 'HTTP Leer Config Bot');
  wf.connections['Esperar Lecturas'] = {
    main: [
      [
        ...withoutConstruir,
        { node: 'HTTP Leer Config Bot', type: 'main', index: 0 },
      ],
    ],
  };
  wf.connections['HTTP Leer Config Bot'] = {
    main: [[{ node: 'Leer Config Bot', type: 'main', index: 0 }]],
  };
  wf.connections['Leer Config Bot'] = {
    main: [[{ node: 'Construir Prompt', type: 'main', index: 0 }]],
  };

  // Asegurar que Construir Prompt use staticData.botConfig (ya lo hace cargarBotConfig)
  // Marcar en jsCode un comentario idempotente
  if (construir.parameters?.jsCode && !construir.parameters.jsCode.includes('/* mvp-f3-live-config */')) {
    construir.parameters.jsCode =
      '/* mvp-f3-live-config */\n' + construir.parameters.jsCode;
  }

  return wf;
}

async function deploy(wf) {
  loadEnv();
  const key = apiKey();
  const live = await request('GET', `/api/v1/workflows/${PROD}`, key);
  const was = !!live.json.active;
  if (was) await request('POST', `/api/v1/workflows/${PROD}/deactivate`, key);
  const put = await request('PUT', `/api/v1/workflows/${PROD}`, key, {
    name: live.json.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1' },
  });
  if (put.status >= 400) throw new Error(put.raw.slice(0, 400));
  if (was) await request('POST', `/api/v1/workflows/${PROD}/activate`, key);
  return { was };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const local = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
  apply(local);
  fs.writeFileSync(LOCAL, JSON.stringify(local, null, 2) + '\n');
  const report = {
    ok: true,
    hasHttp: !!byName(local, 'HTTP Leer Config Bot'),
    hasLeer: !!byName(local, 'Leer Config Bot'),
  };
  if (args.has('--deploy')) report.deploy = await deploy(local);
  // idempotent second apply
  apply(local);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
