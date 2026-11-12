#!/usr/bin/env node
'use strict';

/**
 * Fase 1 MVP video: backup + arreglar planillas + patch alerta escritura.
 * Idempotente en sheets (no duplica pestañas/columnas) y en nodos Detectar Error.
 *
 * Uso:
 *   node scripts/patch-mvp-f1-planillas.js --backup
 *   node scripts/patch-mvp-f1-planillas.js --apply-sheets
 *   node scripts/patch-mvp-f1-planillas.js --patch-workflow
 *   node scripts/patch-mvp-f1-planillas.js --all
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ROOT,
  loadEnv,
  apiKey,
  request,
  sheetsCred,
  httpSteps,
  valuesToCsv,
} = require('./lib/n8n-http-helper');

const PROD_ID = '8JoSfkcn3pE1f0av';
const IDS = {
  guardar_lead: '18eZ-ryGdRC4jVbzfd11ttITl3VwuW00HPxbAzU0LimQ',
  historial: '1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo',
  crm: '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ',
};

const CONSULTAS_HEADERS = [
  'consulta_id',
  'chat_id',
  'fecha',
  'fecha_local',
  'anio',
  'mes',
  'canal_origen',
  'nombre',
  'mensaje_cliente',
  'respuesta_bot',
  'intencion',
  'operacion',
  'zona',
  'presupuesto',
  'temperature',
  'lead_completo',
  'es_nueva_consulta',
  'phone',
  'dormitorios',
  'tipo_propiedad',
];

const LEADS_COMPLETOS_HEADERS = [
  'chat_id',
  'fecha',
  'nombre',
  'presupuesto',
  'resumen',
  'temperatura',
  'tipo_operacion',
  'zona',
];

const CONVERSACIONES_REVISION_HEADERS = [
  'fecha_hora',
  'canal',
  'motivo',
  'chat_id',
  'lead_name',
  'ultimo_mensaje_cliente',
  'respuesta_bot',
  'historial_json',
  'mensajes_extra',
];

const HISTORIAL_ADD = ['ultima_actualizacion', 'propiedad_seguimiento', 'bot_paused'];

/** Tras bot_paused/handoff/senales_json: extras SIMPLE-02/04 ausentes en diagnóstico. */
const LEADS_BOT_ADD = [
  'bot_paused',
  'handoff',
  'senales_json',
  'last_interaction_at',
  'phone',
  'updated_at',
  'created_at',
  'lead_id',
  'consultas_count',
  'dormitorios',
  'historial',
  'last_bot_message',
  'lead_intent',
  'operacion',
  'tipo_propiedad',
  'ultima_consulta_fecha',
];

const WRITE_NODES = [
  {
    name: 'Guardar Lead',
    sheet: 'Leads_Completos',
    next: [],
  },
  {
    name: 'Actualizar Historial',
    sheet: 'Hoja 1 (conversaciones)',
    next: [],
  },
  {
    name: 'Sync Leads_Bot',
    sheet: 'Leads_Bot',
    next: ['Emit Lead Updated'],
  },
  {
    name: 'Registrar Consulta Telegram',
    sheet: 'Consultas',
    next: [],
  },
  {
    name: 'Registrar Aprendizaje Matias TG',
    sheet: 'Aprendizaje_Matias',
    next: [],
  },
  {
    name: 'Google Sheets - Conversaciones_Revision TG',
    sheet: 'Conversaciones_Revision',
    next: [],
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function backupDir() {
  return path.join(ROOT, 'docs', 'ops', `backup-planillas-${today()}`);
}

function detectCode(nodeName, sheetLabel) {
  const litNode = JSON.stringify(nodeName);
  const litSheet = JSON.stringify(sheetLabel);
  return `const SHEETS_WRITE_ALERT_MS = 60 * 60 * 1000;
const item = $input.first() || {};
const j = item.json || {};
let chatId = String(j.chat_id || '').trim();
try {
  if (!chatId) chatId = String(($('Parsear Respuesta').first().json || {}).chat_id || '').trim();
} catch (e) {}
try {
  if (!chatId) chatId = String(($('Set Variables').first().json || {}).chat_id || '').trim();
} catch (e) {}

function errMsg(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err.slice(0, 240);
  return String(err.message || err.description || err.error || JSON.stringify(err)).slice(0, 240);
}

// Google Sheets + onError=continueRegularOutput deja el fallo en item.error
// (no siempre en json.error). También contemplamos json.error por si el nodo lo mezcla.
const msg = errMsg(item.error) || errMsg(j.error);
const sd = $getWorkflowStaticData('global');
if (!sd.writeSheetsAlert) {
  sd.writeSheetsAlert = { lastSentAt: 0, pending: [] };
}
const st = sd.writeSheetsAlert;
if (!Array.isArray(st.pending)) st.pending = [];

if (msg) {
  st.pending.push({
    at: new Date().toISOString(),
    nodo: ${litNode},
    hoja: ${litSheet},
    error: msg,
    chat_id: chatId || '(sin chat_id)',
  });
}

const now = Date.now();
const due = !st.lastSentAt || now - Number(st.lastSentAt) >= SHEETS_WRITE_ALERT_MS;
let alertar = false;
let texto = '';
if (due && st.pending.length) {
  const byKey = new Map();
  for (const p of st.pending) {
    const k = p.nodo + '|' + p.hoja + '|' + p.error;
    if (!byKey.has(k)) byKey.set(k, { ...p, chats: new Set() });
    byKey.get(k).chats.add(p.chat_id);
  }
  const lines = ['ALERTA escritura Sheets (Nodo Propiedades)'];
  for (const g of byKey.values()) {
    lines.push(
      '- Nodo: ' +
        g.nodo +
        '\\n  Hoja: ' +
        g.hoja +
        '\\n  Error: ' +
        g.error +
        '\\n  chat_id: ' +
        [...g.chats].join(', '),
    );
  }
  texto = lines.join('\\n\\n').slice(0, 3500);
  alertar = true;
  st.lastSentAt = now;
  st.pending = [];
}

const out = Object.assign({}, j);
out._write_sheets_ok = !msg;
out._write_sheets_error = msg || '';
out.alertar_escritura_sheets = alertar;
out.escritura_alerta_texto = texto;
return [{ json: out }];
`;
}

function parseArgs(argv) {
  return {
    backup: argv.includes('--backup') || argv.includes('--all'),
    applySheets: argv.includes('--apply-sheets') || argv.includes('--all'),
    patchWorkflow: argv.includes('--patch-workflow') || argv.includes('--all'),
    all: argv.includes('--all'),
  };
}

async function doBackup(key, cred) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const steps = [
    {
      name: 'MetaGuardar',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}?fields=sheets.properties`,
    },
    {
      name: 'ValGuardar',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}/values/${encodeURIComponent('Hoja 1')}`,
    },
    {
      name: 'MetaHist',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.historial}?fields=sheets.properties`,
    },
    {
      name: 'ValHist',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.historial}/values/${encodeURIComponent('Hoja 1')}`,
    },
    {
      name: 'MetaCrm',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}?fields=sheets.properties`,
    },
    {
      name: 'ValLeadsBot',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Leads_Bot`,
    },
    {
      name: 'ValConsultas',
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Consultas`,
    },
  ];
  const out = await httpSteps(key, cred, steps, '_TMP Backup F1');
  fs.writeFileSync(
    path.join(dir, 'meta-guardar-lead.json'),
    JSON.stringify(out.MetaGuardar, null, 2),
  );
  fs.writeFileSync(
    path.join(dir, 'meta-historial.json'),
    JSON.stringify(out.MetaHist, null, 2),
  );
  fs.writeFileSync(path.join(dir, 'meta-crm.json'), JSON.stringify(out.MetaCrm, null, 2));
  fs.writeFileSync(path.join(dir, 'Hoja1-guardar-lead.csv'), valuesToCsv(out.ValGuardar?.values));
  fs.writeFileSync(path.join(dir, 'historial-Hoja1.csv'), valuesToCsv(out.ValHist?.values));
  fs.writeFileSync(path.join(dir, 'Leads_Bot.csv'), valuesToCsv(out.ValLeadsBot?.values));
  fs.writeFileSync(path.join(dir, 'Consultas.csv'), valuesToCsv(out.ValConsultas?.values));
  fs.writeFileSync(
    path.join(dir, 'headers-antes.json'),
    JSON.stringify(
      {
        guardar_lead_hoja1: (out.ValGuardar?.values || [])[0] || [],
        historial: (out.ValHist?.values || [])[0] || [],
        leads_bot: (out.ValLeadsBot?.values || [])[0] || [],
        consultas: (out.ValConsultas?.values || [])[0] || [],
        tabs_guardar: (out.MetaGuardar?.sheets || []).map((s) => s.properties?.title),
        tabs_crm: (out.MetaCrm?.sheets || []).map((s) => s.properties?.title),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ backupDir: dir, ok: true }, null, 2));
  return { dir, out };
}

function enc(range) {
  return encodeURIComponent(range);
}

async function applySheets(key, cred) {
  const before = await httpSteps(
    key,
    cred,
    [
      {
        name: 'MetaG',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}?fields=sheets.properties`,
      },
      {
        name: 'MetaC',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}?fields=sheets.properties`,
      },
      {
        name: 'HHist',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.historial}/values/${enc('Hoja 1!1:1')}`,
      },
      {
        name: 'HLeads',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Leads_Bot!1:1`,
      },
      {
        name: 'HCons',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Consultas!1:1`,
      },
    ],
    '_TMP F1 before',
  );

  const tabsG = new Set((before.MetaG?.sheets || []).map((s) => s.properties?.title));
  const tabsC = new Set((before.MetaC?.sheets || []).map((s) => s.properties?.title));
  const histHeader = (before.HHist?.values || [])[0] || [];
  const leadsHeader = (before.HLeads?.values || [])[0] || [];
  const consHeader = (before.HCons?.values || [])[0] || [];

  const steps = [];
  let i = 0;
  const add = (name, method, url, body) => {
    steps.push({ name: name + '_' + i++, method, url, body });
  };

  // 1) Leads_Completos
  if (!tabsG.has('Leads_Completos')) {
    add('AddLeadsCompletos', 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: 'Leads_Completos' } } }],
    });
  }
  add(
    'HdrLeadsCompletos',
    'PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}/values/${enc('Leads_Completos!A1:H1')}?valueInputOption=RAW`,
    { values: [LEADS_COMPLETOS_HEADERS] },
  );

  // 2) Consultas backup + replace header
  if (!tabsC.has('Consultas_encabezado_anterior')) {
    add('AddConsBackup', 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: 'Consultas_encabezado_anterior' } } }],
    });
  }
  add(
    'PutConsBackup',
    'PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/${enc('Consultas_encabezado_anterior!A1')}?valueInputOption=RAW`,
    { values: [consHeader.length ? consHeader : ['(vacio)']] },
  );
  add(
    'PutConsHdr',
    'PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/${enc('Consultas!A1:T1')}?valueInputOption=RAW`,
    { values: [CONSULTAS_HEADERS] },
  );

  // 3) Conversaciones_Revision
  if (!tabsC.has('Conversaciones_Revision')) {
    add('AddRev', 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: 'Conversaciones_Revision' } } }],
    });
  }
  add(
    'HdrRev',
    'PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/${enc('Conversaciones_Revision!A1:I1')}?valueInputOption=RAW`,
    { values: [CONVERSACIONES_REVISION_HEADERS] },
  );

  // 4) Historial append columns
  const histMissing = HISTORIAL_ADD.filter((c) => !histHeader.includes(c));
  if (histMissing.length) {
    const startCol = histHeader.length; // 0-based index = next col
    const colLetter = (n) => {
      let s = '';
      let x = n + 1;
      while (x > 0) {
        const m = (x - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        x = Math.floor((x - 1) / 26);
      }
      return s;
    };
    const a1 = `Hoja 1!${colLetter(startCol)}1`;
    add(
      'HistAdd',
      'PUT',
      `https://sheets.googleapis.com/v4/spreadsheets/${IDS.historial}/values/${enc(a1)}?valueInputOption=RAW`,
      { values: [histMissing] },
    );
  }

  // 5) Leads_Bot append columns
  const leadsMissing = LEADS_BOT_ADD.filter((c) => !leadsHeader.includes(c));
  if (leadsMissing.length) {
    const startCol = leadsHeader.length;
    const colLetter = (n) => {
      let s = '';
      let x = n + 1;
      while (x > 0) {
        const m = (x - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        x = Math.floor((x - 1) / 26);
      }
      return s;
    };
    const a1 = `Leads_Bot!${colLetter(startCol)}1`;
    add(
      'LeadsAdd',
      'PUT',
      `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/${enc(a1)}?valueInputOption=RAW`,
      { values: [leadsMissing] },
    );
  }

  const applied = await httpSteps(key, cred, steps, '_TMP F1 apply');

  const after = await httpSteps(
    key,
    cred,
    [
      {
        name: 'HHist',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.historial}/values/${enc('Hoja 1!1:1')}`,
      },
      {
        name: 'HLeads',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Leads_Bot!1:1`,
      },
      {
        name: 'HCons',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/Consultas!1:1`,
      },
      {
        name: 'HLC',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}/values/${enc('Leads_Completos!1:1')}`,
      },
      {
        name: 'HRev',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}/values/${enc('Conversaciones_Revision!1:1')}`,
      },
      {
        name: 'MetaG',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.guardar_lead}?fields=sheets.properties`,
      },
      {
        name: 'MetaC',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${IDS.crm}?fields=sheets.properties`,
      },
    ],
    '_TMP F1 after',
  );

  const report = {
    before: {
      historial: histHeader,
      leads_bot: leadsHeader,
      consultas: consHeader,
      tabs_guardar: [...tabsG],
      tabs_crm: [...tabsC],
    },
    after: {
      historial: (after.HHist?.values || [])[0] || [],
      leads_bot: (after.HLeads?.values || [])[0] || [],
      consultas: (after.HCons?.values || [])[0] || [],
      leads_completos: (after.HLC?.values || [])[0] || [],
      conversaciones_revision: (after.HRev?.values || [])[0] || [],
      tabs_guardar: (after.MetaG?.sheets || []).map((s) => s.properties?.title),
      tabs_crm: (after.MetaC?.sheets || []).map((s) => s.properties?.title),
    },
    leads_bot_added: leadsMissing,
    historial_added: histMissing,
    appliedKeys: Object.keys(applied).filter((k) => !k.startsWith('_')),
  };

  const outMd = path.join(ROOT, 'docs', 'ops', `planillas-produccion-arregladas-${today()}.md`);
  fs.mkdirSync(path.dirname(outMd), { recursive: true });
  fs.writeFileSync(
    outMd,
    [
      `# Planillas de producción arregladas — ${today()}`,
      '',
      '## Antes / después (encabezados fila 1)',
      '',
      '### Historial (`conversaciones` / Hoja 1)',
      '',
      `- Antes: \`${histHeader.join(' | ')}\``,
      `- Después: \`${report.after.historial.join(' | ')}\``,
      `- Agregadas al final: \`${histMissing.join(', ') || '(ninguna — ya estaban)'}\``,
      '',
      '### Leads_Bot (CRM)',
      '',
      `- Antes: \`${leadsHeader.join(' | ')}\``,
      `- Después: \`${report.after.leads_bot.join(' | ')}\``,
      `- Agregadas al final (orden): \`${leadsMissing.join(', ') || '(ninguna — ya estaban)'}\``,
      '',
      '### Consultas (CRM)',
      '',
      `- Antes: \`${consHeader.join(' | ')}\``,
      `- Después: \`${report.after.consultas.join(' | ')}\``,
      `- Backup fila 1 → pestaña \`Consultas_encabezado_anterior\``,
      '',
      '### Leads_Completos (planilla leads_bot `18eZ…`)',
      '',
      `- Encabezados: \`${report.after.leads_completos.join(' | ')}\``,
      '',
      '### Conversaciones_Revision (CRM, nueva)',
      '',
      `- Encabezados: \`${report.after.conversaciones_revision.join(' | ')}\``,
      '',
      '## Nodo Guardar Lead',
      '',
      '- `sheetName` → `Leads_Completos` (vía patch-workflow)',
      '- `Hoja 1` no se tocó',
      '',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, outMd, report }, null, 2));
  return report;
}

function patchWorkflowLocal(wf) {
  const byName = new Map((wf.nodes || []).map((n) => [n.name, n]));
  const guardar = byName.get('Guardar Lead');
  if (!guardar) throw new Error('Guardar Lead no encontrado');
  if (!guardar.parameters.sheetName) guardar.parameters.sheetName = {};
  if (typeof guardar.parameters.sheetName === 'object') {
    guardar.parameters.sheetName.value = 'Leads_Completos';
    guardar.parameters.sheetName.mode = guardar.parameters.sheetName.mode || 'name';
  } else {
    guardar.parameters.sheetName = {
      __rl: true,
      value: 'Leads_Completos',
      mode: 'name',
    };
  }

  // Infer next targets from current connections before rewrite
  const conns = wf.connections || {};
  for (const w of WRITE_NODES) {
    const cur = (conns[w.name]?.main?.[0] || []).map((c) => c.node);
    w.next = cur;
  }

  const alertaOwner = byName.get('Telegram Alerta Owner');
  if (!alertaOwner) throw new Error('Telegram Alerta Owner no encontrado');

  for (const w of WRITE_NODES) {
    const detectName = `Detectar Error Escritura · ${w.name}`;
    if (!byName.has(detectName)) {
      const src = byName.get(w.name);
      const node = {
        id: 'mvp-f1-detect-' + crypto.createHash('sha1').update(w.name).digest('hex').slice(0, 12),
        name: detectName,
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [(src.position?.[0] || 0) + 220, (src.position?.[1] || 0) + 40],
        parameters: { jsCode: detectCode(w.name, w.sheet) },
      };
      wf.nodes.push(node);
      byName.set(detectName, node);
    } else {
      byName.get(detectName).parameters.jsCode = detectCode(w.name, w.sheet);
    }

    // writer → detect
    conns[w.name] = {
      main: [[{ node: detectName, type: 'main', index: 0 }]],
    };

    // detect → previous next + IF alerta
    const ifName = `IF Alerta Escritura · ${w.name}`;
    if (!byName.has(ifName)) {
      const detect = byName.get(detectName);
      const ifNode = {
        id: 'mvp-f1-if-' + crypto.createHash('sha1').update(w.name).digest('hex').slice(0, 12),
        name: ifName,
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [(detect.position?.[0] || 0) + 220, (detect.position?.[1] || 0) - 80],
        parameters: {
          conditions: {
            options: {
              version: 2,
              leftValue: '',
              caseSensitive: true,
              typeValidation: 'strict',
            },
            conditions: [
              {
                id: 'cond-write-alert',
                leftValue: `={{ Boolean($json.alertar_escritura_sheets) }}`,
                rightValue: true,
                operator: { type: 'boolean', operation: 'equals' },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
      };
      wf.nodes.push(ifNode);
      byName.set(ifName, ifNode);
    }

    const tgName = `Telegram Alerta Escritura · ${w.name}`;
    if (!byName.has(tgName)) {
      const ifN = byName.get(ifName);
      const tg = {
        id: 'mvp-f1-tg-' + crypto.createHash('sha1').update(w.name).digest('hex').slice(0, 12),
        name: tgName,
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [(ifN.position?.[0] || 0) + 220, (ifN.position?.[1] || 0)],
        parameters: {
          operation: 'sendMessage',
          chatId: alertaOwner.parameters.chatId,
          text: '={{ String($json.escritura_alerta_texto || "") }}',
          additionalFields: {
            appendAttribution: false,
            disable_web_page_preview: true,
          },
        },
        onError: 'continueRegularOutput',
        credentials: JSON.parse(JSON.stringify(alertaOwner.credentials || {})),
      };
      wf.nodes.push(tg);
      byName.set(tgName, tg);
    } else {
      byName.get(tgName).parameters.chatId = alertaOwner.parameters.chatId;
      byName.get(tgName).credentials = JSON.parse(JSON.stringify(alertaOwner.credentials || {}));
    }

    const nextLinks = (w.next || [])
      .filter((n) => n !== detectName && !String(n).startsWith('Detectar Error') && !String(n).startsWith('IF Alerta Escritura'))
      .map((n) => ({ node: n, type: 'main', index: 0 }));

    conns[detectName] = {
      main: [
        [
          { node: ifName, type: 'main', index: 0 },
          ...nextLinks,
        ],
      ],
    };
    conns[ifName] = {
      main: [[{ node: tgName, type: 'main', index: 0 }], []],
    };
  }

  wf.connections = conns;
  return wf;
}

async function patchWorkflow(key) {
  const localPath = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');
  const local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  patchWorkflowLocal(local);
  fs.writeFileSync(localPath, JSON.stringify(local, null, 2) + '\n');

  const live = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  if (live.status >= 400) throw new Error('GET prod fail');
  const wf = live.json;
  const wasActive = !!wf.active;
  patchWorkflowLocal(wf);

  const settings = { executionOrder: (wf.settings && wf.settings.executionOrder) || 'v1' };
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings,
  };
  const put = await request('PUT', `/api/v1/workflows/${PROD_ID}`, key, payload);
  if (put.status >= 400) throw new Error('PUT prod fail ' + put.raw.slice(0, 400));
  if (wasActive) {
    await request('POST', `/api/v1/workflows/${PROD_ID}/activate`, key);
  }

  const detectCount = (wf.nodes || []).filter((n) =>
    String(n.name).startsWith('Detectar Error Escritura'),
  ).length;
  console.log(
    JSON.stringify(
      {
        ok: true,
        guardarSheet: (wf.nodes || []).find((n) => n.name === 'Guardar Lead')?.parameters?.sheetName
          ?.value,
        detectCount,
        wasActive,
      },
      null,
      2,
    ),
  );
}

async function main() {
  loadEnv();
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.backup && !flags.applySheets && !flags.patchWorkflow) {
    console.error('Usá --backup | --apply-sheets | --patch-workflow | --all');
    process.exit(1);
  }
  const key = apiKey();
  if (!key) throw new Error('sin N8N_API_KEY');
  const { cred } = await sheetsCred(key, PROD_ID);
  if (flags.backup) await doBackup(key, cred);
  if (flags.applySheets) await applySheets(key, cred);
  if (flags.patchWorkflow) await patchWorkflow(key);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  LEADS_BOT_ADD,
  CONSULTAS_HEADERS,
  HISTORIAL_ADD,
  patchWorkflowLocal,
  IDS,
};
