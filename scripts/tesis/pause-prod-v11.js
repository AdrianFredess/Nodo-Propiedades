#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PROD = '8JoSfkcn3pE1f0av';
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'validacion', 'v1.1', 'campana-2026-11-11');
const EXPECTED = 'ced49e79e72e1ffdc4b6743ee45d3131b3596be13e5e4c339a25464bd16123eb';

function apiKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  const code =
    "import sqlite3\n" +
    "c=sqlite3.connect(r'file:C:/Users/adrian/.n8n/database.sqlite?mode=ro', uri=True)\n" +
    "row=c.execute(\"SELECT apiKey FROM user_api_keys WHERE label='n8n'\").fetchone()\n" +
    "print(row[0] if row else '')\n";
  return execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
}

function request(method, urlPath, key, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: {
          'X-N8N-API-KEY': key,
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (_) {
            json = { raw: buf.slice(0, 400) };
          }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function topologyHash(wf) {
  const nodes = (wf.nodes || [])
    .map((n) => ({
      name: n.name,
      type: n.type,
      disabled: !!n.disabled,
      params: n.parameters,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ nodes, connections: wf.connections || {} }))
    .digest('hex');
}

async function main() {
  const key = apiKey();
  const prod = await request('GET', `/api/v1/workflows/${PROD}`, key);
  const hash = topologyHash(prod.json);
  const active = !!prod.json.active;
  fs.mkdirSync(OUT, { recursive: true });
  const metaPath = path.join(OUT, '_import_meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  meta.prodHashBefore = hash;
  meta.prodActiveBefore = active;
  meta.pausedAt = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  if (active) {
    const d = await request('POST', `/api/v1/workflows/${PROD}/deactivate`, key);
    if (d.status >= 400) throw new Error('deactivate fail ' + d.status);
  }
  const after = await request('GET', `/api/v1/workflows/${PROD}`, key);
  console.log(
    JSON.stringify(
      {
        hash,
        activeBefore: active,
        activeAfter: !!after.json.active,
        expected: EXPECTED,
        hashMatch: hash === EXPECTED,
      },
      null,
      2,
    ),
  );
  if (hash !== EXPECTED) {
    console.error('WARN: hash distinto al esperado ced49e79…');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
