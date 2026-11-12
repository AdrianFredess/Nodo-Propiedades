#!/usr/bin/env node
'use strict';

/**
 * Fase 4 MVP: PANEL-07 Entrevista + sección inmobiliaria en Construir Prompt.
 * Uso: node scripts/patch-mvp-f4-entrevista.js [--deploy]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ROOT, loadEnv, apiKey, request } = require('./lib/n8n-http-helper');

const PROD = '8JoSfkcn3pE1f0av';
const BOT_LOCAL = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');
const PANEL07_LOCAL = path.join(ROOT, 'workflows', 'PANEL-07 Entrevista Config.json');
const SNIPPETS = path.join(ROOT, 'scripts', 'snippets');

function readSnippet(name) {
  return fs.readFileSync(path.join(SNIPPETS, name), 'utf8');
}

function embedValidatorInParse() {
  const validatorPath = path.join(ROOT, 'scripts', 'lib', 'entrevista-draft-validator.js');
  let src = fs.readFileSync(validatorPath, 'utf8');
  src = src.replace(/^'use strict';\s*/m, '');
  src = src.replace(/module\.exports[\s\S]*$/, '');
  let parse = readSnippet('panel-entrevista-parse.js');
  parse = parse.replace('/* __ENTREVISTA_VALIDATOR__ */', src.trim() + '\n');
  return parse;
}

function buildPanel07Workflow() {
  const authCode = readSnippet('panel-auth.js');
  const armar = readSnippet('panel-entrevista-armar.js');
  const parse = embedValidatorInParse();

  return {
    name: 'PANEL-07 Entrevista Config',
    nodes: [
      {
        id: 'panel07-webhook',
        name: 'Webhook Entrevista',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [200, 300],
        webhookId: 'panel-entrevista-config',
        parameters: {
          httpMethod: 'POST',
          path: 'panel-entrevista-config',
          responseMode: 'responseNode',
          options: { allowedOrigins: 'http://localhost:5173' },
        },
      },
      {
        id: 'panel07-auth-check',
        name: 'Check Panel Auth',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [420, 300],
        parameters: { jsCode: authCode },
      },
      {
        id: 'panel07-auth-if',
        name: 'IF Panel Auth OK',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [640, 300],
        parameters: {
          conditions: {
            combinator: 'and',
            options: {
              version: 2,
              typeValidation: 'strict',
              caseSensitive: true,
              leftValue: '',
            },
            conditions: [
              {
                id: 'auth-ok',
                leftValue: '={{ $json._authOk }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
          },
          options: {},
        },
      },
      {
        id: 'panel07-auth-fail',
        name: 'Responder Auth Fail',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [640, 480],
        parameters: {
          respondWith: 'json',
          responseBody: "={{ JSON.stringify({ ok: false, error: 'unauthorized' }) }}",
          options: { responseCode: 401 },
        },
      },
      {
        id: 'panel07-armar',
        name: 'Armar Prompt Entrevista',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [860, 300],
        parameters: { jsCode: armar },
      },
      {
        id: 'panel07-groq',
        name: 'HTTP Groq Entrevista',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1080, 300],
        credentials: {
          openAiApi: {
            id: '__SET_GROQ_CREDENTIAL_ID__',
            name: 'Groq API',
          },
        },
        parameters: {
          method: 'POST',
          url: 'https://api.groq.com/openai/v1/chat/completions',
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'openAiApi',
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            "={{ { model: 'openai/gpt-oss-120b', messages: $json.messages, temperature: 0.4, max_tokens: 1200, reasoning_effort: 'low' } }}",
          options: {
            response: { response: { responseFormat: 'json' } },
          },
        },
      },
      {
        id: 'panel07-parse',
        name: 'Validar Borrador',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1300, 300],
        parameters: { jsCode: parse },
      },
      {
        id: 'panel07-respond',
        name: 'Responder JSON',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [1520, 300],
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify($json) }}',
          options: {
            responseHeaders: {
              entries: [
                {
                  name: 'Access-Control-Allow-Origin',
                  value: "={{ $env.PANEL_ORIGIN || 'http://localhost:5173' }}",
                },
                {
                  name: 'Access-Control-Allow-Headers',
                  value: 'Content-Type, X-Panel-Token',
                },
              ],
            },
          },
        },
      },
    ],
    connections: {
      'Webhook Entrevista': {
        main: [[{ node: 'Check Panel Auth', type: 'main', index: 0 }]],
      },
      'Check Panel Auth': {
        main: [[{ node: 'IF Panel Auth OK', type: 'main', index: 0 }]],
      },
      'IF Panel Auth OK': {
        main: [
          [{ node: 'Armar Prompt Entrevista', type: 'main', index: 0 }],
          [{ node: 'Responder Auth Fail', type: 'main', index: 0 }],
        ],
      },
      'Armar Prompt Entrevista': {
        main: [[{ node: 'HTTP Groq Entrevista', type: 'main', index: 0 }]],
      },
      'HTTP Groq Entrevista': {
        main: [[{ node: 'Validar Borrador', type: 'main', index: 0 }]],
      },
      'Validar Borrador': {
        main: [[{ node: 'Responder JSON', type: 'main', index: 0 }]],
      },
    },
    settings: { executionOrder: 'v1' },
  };
}

function syncBotConstruirPrompt() {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'patch-advisor-learning.js')], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  const construir = JSON.parse(fs.readFileSync(BOT_LOCAL, 'utf8')).nodes.find(
    (n) => n.name === 'Construir Prompt',
  );
  if (!construir?.parameters?.jsCode?.includes('seccionComoTrabajaInmobiliaria')) {
    throw new Error('Construir Prompt sin sección inmobiliaria — revisar snippets');
  }
}

function markF4Construir(wf) {
  const construir = (wf.nodes || []).find((n) => n.name === 'Construir Prompt');
  if (construir?.parameters?.jsCode && !construir.parameters.jsCode.includes('/* mvp-f4-entrevista */')) {
    construir.parameters.jsCode = '/* mvp-f4-entrevista */\n' + construir.parameters.jsCode;
  }
  return wf;
}

async function upsertPanel07(wf) {
  loadEnv();
  const key = apiKey();
  const list = await request('GET', '/api/v1/workflows?limit=250', key);
  const rows = list.json?.data || [];
  const existing = rows.find((w) => w.name === wf.name);
  const body = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' },
  };
  if (existing) {
    const was = !!existing.active;
    if (was) await request('POST', `/api/v1/workflows/${existing.id}/deactivate`, key);
    const put = await request('PUT', `/api/v1/workflows/${existing.id}`, key, body);
    if (put.status >= 400) throw new Error(put.raw.slice(0, 400));
    await request('POST', `/api/v1/workflows/${existing.id}/activate`, key);
    return { id: existing.id, created: false };
  }
  const post = await request('POST', '/api/v1/workflows', key, body);
  if (post.status >= 400) throw new Error(post.raw.slice(0, 400));
  const id = post.json?.id;
  if (id) await request('POST', `/api/v1/workflows/${id}/activate`, key);
  return { id, created: true };
}

async function deployBot(wf) {
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
}

async function main() {
  const args = new Set(process.argv.slice(2));
  syncBotConstruirPrompt();

  const panel07 = buildPanel07Workflow();
  fs.writeFileSync(PANEL07_LOCAL, JSON.stringify(panel07, null, 2) + '\n');

  let bot = JSON.parse(fs.readFileSync(BOT_LOCAL, 'utf8'));
  bot = markF4Construir(bot);
  fs.writeFileSync(BOT_LOCAL, JSON.stringify(bot, null, 2) + '\n');

  // idempotente
  buildPanel07Workflow();
  syncBotConstruirPrompt();

  const report = {
    ok: true,
    panel07: path.relative(ROOT, PANEL07_LOCAL),
    construir_has_seccion: true,
  };

  if (args.has('--deploy')) {
    report.panel07Deploy = await upsertPanel07(panel07);
    report.botDeploy = await deployBot(JSON.parse(fs.readFileSync(BOT_LOCAL, 'utf8')));
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
