#!/usr/bin/env node
'use strict';

/**
 * Genera workflows/Bot Prueba Panel.json desde producción (MVP Fase 5).
 * node scripts/build-bot-prueba-panel.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('./lib/n8n-http-helper');

const SRC = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');
const OUT = path.join(ROOT, 'workflows', 'Bot Prueba Panel.json');
const PLANILLAS = path.join(
  ROOT,
  'docs',
  'validacion',
  'campana-flujo-3f132c3',
  'planillas-prueba.json',
);
const AUTH = fs.readFileSync(path.join(ROOT, 'scripts', 'snippets', 'panel-auth.js'), 'utf8');

const DISABLE_NAMES = new Set([
  'Telegram Responder',
  'Telegram Enviar Foto',
  'Telegram Mensaje Cierre',
  'Email Lead Caliente',
  'Telegram Alerta Owner',
  'Emit Panel Realtime',
  'Emit Lead Updated',
]);

const DISABLE_PREFIX = [
  'Telegram Alerta',
  'HTTP - Email',
];

function setDocumentId(node, id) {
  if (!node.parameters) node.parameters = {};
  node.parameters.documentId = {
    __rl: true,
    value: id,
    mode: 'id',
  };
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function shouldDisable(name) {
  if (DISABLE_NAMES.has(name)) return true;
  return DISABLE_PREFIX.some((p) => name.startsWith(p));
}

function rewriteTelegramTriggerRefs(wf) {
  const repl = `$('Normalizar Panel Prueba')`;
  for (const n of wf.nodes || []) {
    const code = n.parameters?.jsCode;
    if (code && code.includes("$('Telegram Trigger')")) {
      n.parameters.jsCode = code.split("$('Telegram Trigger')").join(repl);
    }
  }
}

function build() {
  const planillas = JSON.parse(fs.readFileSync(PLANILLAS, 'utf8'));
  const wf = deepClone(JSON.parse(fs.readFileSync(SRC, 'utf8')));
  const trigger = (wf.nodes || []).find((n) => n.name === 'Telegram Trigger');
  if (!trigger) throw new Error('sin Telegram Trigger');

  const pos = trigger.position || [0, 0];
  const webhook = {
    id: 'bot-prueba-webhook',
    name: 'Webhook Panel Prueba',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: pos,
    webhookId: 'bot-prueba-panel',
    parameters: {
      httpMethod: 'POST',
      path: 'bot-prueba-panel',
      responseMode: 'responseNode',
      options: { allowedOrigins: 'http://localhost:5173' },
    },
  };
  const checkAuth = {
    id: 'bot-prueba-auth',
    name: 'Check Panel Auth',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [pos[0] + 200, pos[1]],
    parameters: { jsCode: AUTH },
  };
  const ifAuth = {
    id: 'bot-prueba-if-auth',
    name: 'IF Panel Auth OK',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [pos[0] + 420, pos[1]],
    parameters: {
      conditions: {
        combinator: 'and',
        options: { version: 2, typeValidation: 'strict', caseSensitive: true, leftValue: '' },
        conditions: [
          {
            id: 'auth',
            leftValue: '={{ $json._authOk }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
      },
      options: {},
    },
  };
  const authFail = {
    id: 'bot-prueba-auth-fail',
    name: 'Responder Auth Fail',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [pos[0] + 420, pos[1] + 160],
    parameters: {
      respondWith: 'json',
      responseBody: "={{ JSON.stringify({ ok: false, error: 'unauthorized' }) }}",
      options: { responseCode: 401 },
    },
  };
  const normalizar = {
    id: 'bot-prueba-normalizar',
    name: 'Normalizar Panel Prueba',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [pos[0] + 640, pos[1]],
    parameters: {
      jsCode: `const item = $input.first().json || {};
const body = item.body && typeof item.body === 'object' ? item.body : item;
const chatId = String(body.chat_id || '').trim();
const text = String(body.text || '').trim();
const nombre = String(body.nombre || 'Prueba panel').trim();
if (!/^894\\d{6}$/.test(chatId)) {
  return [{ json: { error: 'chat_id_invalido', ok: false } }];
}
if (!text) {
  return [{ json: { error: 'text_requerido', ok: false } }];
}
const update = {
  update_id: Date.now(),
  message: {
    message_id: Date.now(),
    chat: { id: Number(chatId), type: 'private' },
    from: { id: Number(chatId), is_bot: false, first_name: nombre },
    text,
    date: Math.floor(Date.now() / 1000),
  },
};
return [{ json: update }];`,
    },
  };
  const responder = {
    id: 'bot-prueba-responder',
    name: 'Responder Panel Prueba',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [pos[0] + 860, pos[1] + 400],
    parameters: {
      respondWith: 'json',
      responseBody:
        "={{ JSON.stringify({ ok: true, respuesta: $('Parsear Respuesta Base').first().json.respuesta_bot || '', temperatura: $('Parsear Respuesta').first().json.temperatura || '', derivacion: $('Parsear Respuesta').first().json.derivacion_categoria || 'A', motivo: $('Parsear Respuesta').first().json.derivacion_motivo || '', chat_id: $('Parsear Respuesta').first().json.chat_id || '' }) }}",
      options: {
        responseHeaders: {
          entries: [
            {
              name: 'Access-Control-Allow-Origin',
              value: "={{ $env.PANEL_ORIGIN || 'http://localhost:5173' }}",
            },
            { name: 'Access-Control-Allow-Headers', value: 'Content-Type, X-Panel-Token' },
          ],
        },
      },
    },
  };

  wf.nodes = (wf.nodes || []).filter((n) => n.name !== 'Telegram Trigger');
  wf.nodes.push(webhook, checkAuth, ifAuth, authFail, normalizar, responder);

  for (const n of wf.nodes) {
    if (shouldDisable(n.name)) n.disabled = true;
    if (n.name === 'Leer Historial' || n.name === 'Actualizar Historial') {
      setDocumentId(n, planillas.historial);
    }
    if (n.name === 'Guardar Lead') setDocumentId(n, planillas.guardar_lead);
    if (n.name === 'Sync Leads_Bot' || n.name === 'Registrar Consulta Telegram') {
      setDocumentId(n, planillas.leads_bot_consultas);
    }
  }

  rewriteTelegramTriggerRefs(wf);

  const conns = wf.connections || {};
  const nextAfterTrigger =
    conns['Telegram Trigger']?.main?.[0]?.[0]?.node || 'Set Variables';
  delete conns['Telegram Trigger'];
  conns['Webhook Panel Prueba'] = {
    main: [[{ node: 'Check Panel Auth', type: 'main', index: 0 }]],
  };
  conns['Check Panel Auth'] = {
    main: [[{ node: 'IF Panel Auth OK', type: 'main', index: 0 }]],
  };
  conns['IF Panel Auth OK'] = {
    main: [
      [{ node: 'Normalizar Panel Prueba', type: 'main', index: 0 }],
      [{ node: 'Responder Auth Fail', type: 'main', index: 0 }],
    ],
  };
  conns['Normalizar Panel Prueba'] = {
    main: [[{ node: nextAfterTrigger, type: 'main', index: 0 }]],
  };

  if (conns['IF Debe Responder TG']?.main?.[0]) {
    conns['IF Debe Responder TG'].main[0] = [
      { node: 'Responder Panel Prueba', type: 'main', index: 0 },
    ];
  } else {
    conns['IF Debe Responder TG'] = {
      main: [[{ node: 'Responder Panel Prueba', type: 'main', index: 0 }], []],
    };
  }

  wf.connections = conns;
  wf.name = 'Bot Prueba Panel';
  delete wf.id;
  delete wf.active;
  delete wf.versionId;
  delete wf.meta;
  delete wf.tags;
  delete wf.pinData;

  fs.writeFileSync(OUT, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ ok: true, out: OUT, sha: crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex') }, null, 2));
}

if (require.main === module) {
  try {
    build();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

module.exports = { build };
