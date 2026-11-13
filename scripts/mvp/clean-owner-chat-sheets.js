#!/usr/bin/env node
'use strict';

/**
 * Borra filas del OWNER_TELEGRAM_CHAT_ID en Historial, Leads_Bot, Consultas, Leads_Completos.
 * Backup antes. No imprime el chat_id.
 */
const fs = require('fs');
const path = require('path');
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
  { key: 'historial', doc: IDS.historial, range: 'Hoja 1' },
  { key: 'Leads_Bot', doc: IDS.crm, range: 'Leads_Bot' },
  { key: 'Consultas', doc: IDS.crm, range: 'Consultas' },
  { key: 'Leads_Completos', doc: IDS.guardar_lead, range: 'Leads_Completos' },
];

async function main() {
  loadEnv();
  const owner = String(process.env.OWNER_TELEGRAM_CHAT_ID || '').trim();
  if (!owner) throw new Error('OWNER_TELEGRAM_CHAT_ID vacío');

  const key = apiKey();
  const { cred } = await sheetsCred(key);
  const today = new Date().toISOString().slice(0, 10);
  const bak = path.join(ROOT, 'docs', 'ops', `backup-planillas-${today}`);
  fs.mkdirSync(bak, { recursive: true });

  const report = { ok: true, ownerLen: owner.length, sheets: {} };

  for (const t of SHEETS) {
    const before = await httpSteps(
      key,
      cred,
      [
        {
          name: 'G',
          method: 'GET',
          url: `https://sheets.googleapis.com/v4/spreadsheets/${t.doc}/values/${encodeURIComponent(t.range)}`,
        },
      ],
      '_TMP owner clean get',
    );
    const values = before.G?.values || [];
    fs.writeFileSync(
      path.join(bak, `owner-clean-${t.key}-antes.csv`),
      valuesToCsv(values),
    );
    if (!values.length) {
      report.sheets[t.key] = { removed: 0, kept: 0 };
      continue;
    }
    const header = values[0];
    const idx = header.findIndex(
      (h) => String(h).trim().toLowerCase() === 'chat_id',
    );
    if (idx < 0) {
      report.sheets[t.key] = { error: 'no_chat_id_col' };
      continue;
    }
    const kept = [header];
    let removed = 0;
    for (let i = 1; i < values.length; i++) {
      const id = String(values[i][idx] || '').trim();
      if (id === owner || Number(id) === Number(owner)) {
        removed++;
        continue;
      }
      kept.push(values[i]);
    }
    await httpSteps(
      key,
      cred,
      [
        {
          name: 'Clear',
          method: 'POST',
          url: `https://sheets.googleapis.com/v4/spreadsheets/${t.doc}/values/${encodeURIComponent(t.range)}:clear`,
          body: {},
        },
        {
          name: 'Put',
          method: 'PUT',
          url: `https://sheets.googleapis.com/v4/spreadsheets/${t.doc}/values/${encodeURIComponent(t.range + '!A1')}?valueInputOption=RAW`,
          body: { values: kept },
        },
      ],
      '_TMP owner clean put',
    );
    report.sheets[t.key] = { removed, kept: kept.length - 1 };
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
