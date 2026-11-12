#!/usr/bin/env node
'use strict';

/**
 * pnpm demo:reset — borra SOLO filas de DEMO_CHAT_IDS en 4 hojas.
 * Uso interactivo: node scripts/mvp/demo-reset.js
 * CI/local con confirmación: echo BORRAR DEMO | node scripts/mvp/demo-reset.js
 *          o DEMO_RESET_CONFIRM=BORRAR DEMO node scripts/mvp/demo-reset.js
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  ROOT,
  loadEnv,
  apiKey,
  sheetsCred,
  httpSteps,
  valuesToCsv,
} = require('../lib/n8n-http-helper');
const { IDS } = require('../patch-mvp-f1-planillas');

const SHEETS = [
  { key: 'historial', doc: IDS.historial, range: 'Hoja 1', chatCol: 'chat_id' },
  { key: 'Leads_Bot', doc: IDS.crm, range: 'Leads_Bot', chatCol: 'chat_id' },
  { key: 'Consultas', doc: IDS.crm, range: 'Consultas', chatCol: 'chat_id' },
  {
    key: 'Leads_Completos',
    doc: IDS.guardar_lead,
    range: 'Leads_Completos',
    chatCol: 'chat_id',
  },
];

function parseDemoIds() {
  const raw = String(process.env.DEMO_CHAT_IDS || '').trim();
  if (!raw) throw new Error('DEMO_CHAT_IDS vacío en .env');
  return new Set(
    raw
      .split(',')
      .map((s) => String(s).trim())
      .filter(Boolean),
  );
}

function askConfirm() {
  const envConfirm = String(process.env.DEMO_RESET_CONFIRM || '').trim();
  if (envConfirm === 'BORRAR DEMO') return Promise.resolve(true);
  if (!process.stdin.isTTY) {
    // pipe
    return new Promise((resolve) => {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (buf += c));
      process.stdin.on('end', () => resolve(buf.trim() === 'BORRAR DEMO'));
    });
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Escribí exactamente BORRAR DEMO para continuar: ', (ans) => {
      rl.close();
      resolve(String(ans || '').trim() === 'BORRAR DEMO');
    });
  });
}

async function main() {
  loadEnv();
  const demoIds = parseDemoIds();
  console.log('DEMO_CHAT_IDS:', [...demoIds].join(', '));
  const ok = await askConfirm();
  if (!ok) {
    console.error('Cancelado.');
    process.exit(1);
  }

  const key = apiKey();
  const { cred } = await sheetsCred(key);
  const today = new Date().toISOString().slice(0, 10);
  const bak = path.join(ROOT, 'docs', 'ops', `backup-planillas-${today}`);
  fs.mkdirSync(bak, { recursive: true });

  const report = { deleted: {}, kept: {} };

  for (const s of SHEETS) {
    const get = await httpSteps(
      key,
      cred,
      [
        {
          name: 'V',
          method: 'GET',
          url: `https://sheets.googleapis.com/v4/spreadsheets/${s.doc}/values/${encodeURIComponent(s.range)}`,
        },
      ],
      '_TMP demo-reset get',
    );
    const values = get.V?.values || [];
    fs.writeFileSync(
      path.join(bak, `demo-reset-${s.key}-antes.csv`),
      valuesToCsv(values),
    );
    if (values.length < 2) {
      report.deleted[s.key] = 0;
      report.kept[s.key] = 0;
      continue;
    }
    const header = values[0];
    const idx = header.indexOf(s.chatCol);
    if (idx < 0) throw new Error(`Sin columna ${s.chatCol} en ${s.key}`);
    const kept = [header];
    let del = 0;
    for (const row of values.slice(1)) {
      const chat = String(row[idx] || '').trim();
      if (demoIds.has(chat)) {
        del += 1;
      } else {
        kept.push(row);
      }
    }
    // Clear + rewrite kept (never touch non-demo)
    await httpSteps(
      key,
      cred,
      [
        {
          name: 'Clear',
          method: 'POST',
          url: `https://sheets.googleapis.com/v4/spreadsheets/${s.doc}/values/${encodeURIComponent(s.range)}:clear`,
          body: {},
        },
        {
          name: 'Put',
          method: 'PUT',
          url: `https://sheets.googleapis.com/v4/spreadsheets/${s.doc}/values/${encodeURIComponent(s.range + '!A1')}?valueInputOption=RAW`,
          body: { values: kept },
        },
      ],
      '_TMP demo-reset write',
    );
    report.deleted[s.key] = del;
    report.kept[s.key] = kept.length - 1;
  }

  console.log(JSON.stringify({ ok: true, backup: bak, report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
