#!/usr/bin/env node
'use strict';

/**
 * Ignorar mensajes del OWNER_TELEGRAM_CHAT_ID (grupo Ventas / dueño).
 * Idempotente. Uso: node scripts/patch-mvp-ignore-owner.js [--deploy]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, loadEnv, apiKey, request } = require('./lib/n8n-http-helper');
const { shouldIgnoreOwnerMessage } = require('./lib/ignore-owner-chat');

const BOT_PATH = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');
const PROD = '8JoSfkcn3pE1f0av';
const MARK = '/* mvp-ignore-owner */';

function uid(prefix) {
  return prefix + '-' + crypto.randomBytes(4).toString('hex');
}

function ensureNode(wf, node) {
  if ((wf.nodes || []).some((n) => n.name === node.name)) return false;
  wf.nodes.push(node);
  return true;
}

function setConn(wf, from, toList, outputIndex) {
  if (!wf.connections[from]) wf.connections[from] = { main: [] };
  const main = wf.connections[from].main;
  while (main.length <= outputIndex) main.push([]);
  main[outputIndex] = toList.map((node) => ({ node, type: 'main', index: 0 }));
}

function buildGateCode(ownerId) {
  const lib = fs
    .readFileSync(path.join(ROOT, 'scripts', 'lib', 'ignore-owner-chat.js'), 'utf8')
    .replace(/^'use strict';\s*/m, '')
    .replace(/module\.exports[\s\S]*$/, '')
    .trim();
  return `${MARK}
${lib}
const OWNER = ${JSON.stringify(String(ownerId || ''))};
const j = $input.first().json || {};
const chat_id = j.chat_id != null ? j.chat_id : (j.message && j.message.chat && j.message.chat.id);
const decision = shouldIgnoreOwnerMessage({ chat_id }, OWNER);
if (decision.skip) {
  return [{ json: { ...j, chat_id, skip_owner: true, skip_reply: true, ignore_owner: true } }];
}
return [{ json: { ...j, chat_id, skip_owner: false } }];
`;
}

function patchWorkflow(wf, ownerId) {
  const gateName = 'Ignorar Chat Dueño';
  const ifName = 'IF Es Chat Dueño';

  const existing = (wf.nodes || []).find((n) => n.name === gateName);
  if (existing?.parameters) {
    existing.parameters.jsCode = buildGateCode(ownerId);
  } else {
    ensureNode(wf, {
      id: uid('ignore-owner'),
      name: gateName,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [300, 300],
      parameters: { jsCode: buildGateCode(ownerId) },
    });
  }

  ensureNode(wf, {
    id: uid('if-owner'),
    name: ifName,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [520, 300],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'owner',
            leftValue: '={{ Boolean($json.skip_owner) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  });

  // Set Variables → Ignorar → IF Es Chat Dueño
  // true (es dueño): fin (sin nodos)
  // false: lo que antes salía de Set Variables (IF Es Start u otros)
  const setOut = wf.connections['Set Variables'];
  const setTargets = (setOut?.main?.[0] || []).map((l) => l.node);
  if (!setTargets.includes(gateName)) {
    const prev = setTargets.filter((n) => n !== gateName && n !== ifName);
    setConn(wf, 'Set Variables', [gateName], 0);
    setConn(wf, gateName, [ifName], 0);
    // true = skip (dueño) → vacío
    setConn(wf, ifName, [], 0);
    // false = seguir flujo normal
    const next = prev.length ? prev : ['IF Es Start'];
    // si prev ya era IF Es Start ok; si era Ignorar no
    setConn(
      wf,
      ifName,
      next.filter((n) => n !== gateName && n !== ifName),
      1,
    );
  } else {
    // ya cableado: asegurar false branch existe
    const ifOut = wf.connections[ifName];
    if (!ifOut?.main?.[1]?.length) {
      const fallback = ['IF Es Start'];
      setConn(wf, ifName, [], 0);
      setConn(wf, ifName, fallback, 1);
    }
  }

  return wf;
}

async function deploy(wf) {
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
  loadEnv();
  const args = new Set(process.argv.slice(2));
  const owner = String(process.env.OWNER_TELEGRAM_CHAT_ID || '').trim();
  if (!owner) throw new Error('OWNER_TELEGRAM_CHAT_ID vacío');

  // sanity test inline
  const t = shouldIgnoreOwnerMessage({ chat_id: owner }, owner);
  if (!t.skip) throw new Error('ignore-owner self-check failed');

  let wf = JSON.parse(fs.readFileSync(BOT_PATH, 'utf8'));
  wf = patchWorkflow(wf, owner);
  const before = JSON.stringify(wf);
  wf = patchWorkflow(wf, owner);
  const after = JSON.stringify(wf);
  fs.writeFileSync(BOT_PATH, JSON.stringify(wf, null, 2) + '\n');

  const report = {
    ok: true,
    idempotent: before === after,
    hasGate: (wf.nodes || []).some((n) => n.name === 'Ignorar Chat Dueño'),
    ownerConfigured: true,
    ownerIsNegative: Number(owner) < 0,
  };
  if (args.has('--deploy')) {
    await deploy(wf);
    report.deployed = PROD;
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
