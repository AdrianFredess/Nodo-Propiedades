#!/usr/bin/env node
'use strict';

/**
 * Fase 5 MVP: genera y despliega Bot Prueba Panel.
 * Uso: node scripts/patch-mvp-f5-probar.js [--deploy]
 */
const fs = require('fs');
const path = require('path');
const { build } = require('./build-bot-prueba-panel');
const { ROOT, loadEnv, apiKey, request } = require('./lib/n8n-http-helper');

const WF_PATH = path.join(ROOT, 'workflows', 'Bot Prueba Panel.json');

async function upsertWorkflow(wf) {
  loadEnv();
  const key = apiKey();
  const list = await request('GET', '/api/v1/workflows?limit=250', key);
  const rows = list.json?.data || [];
  const existing = rows.find((w) => w.name === wf.name);
  const body = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    // n8n 2.x API: solo executionOrder (resto de settings del export falla el PUT)
    settings: { executionOrder: 'v1' },
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

async function main() {
  const args = new Set(process.argv.slice(2));
  build();
  const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  const report = { ok: true, workflow: path.relative(ROOT, WF_PATH), nodes: (wf.nodes || []).length };
  if (args.has('--deploy')) report.deploy = await upsertWorkflow(wf);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
