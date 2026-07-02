const fs = require('fs');
const path = require('path');

const base = path.join(__dirname);
const jsCode = fs.readFileSync(path.join(base, 'n8n_codigo_preparar_seguimiento_telegram.js'), 'utf8');

const nodes = [
  {
    id: 'sch-seg-001',
    name: 'Schedule cada día 10h',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.3,
    position: [0, 0],
    parameters: {
      rule: {
        interval: [
          {
            field: 'days',
            daysInterval: 1,
            triggerAtHour: 10,
            triggerAtMinute: 0,
          },
        ],
      },
    },
  },
  {
    id: 'gs-read-crm-001',
    name: 'Leer CRM historial',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [260, 0],
    parameters: {
      documentId: { __rl: true, value: '1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo', mode: 'id' },
      sheetName: { __rl: true, value: 'Hoja 1', mode: 'name' },
      filtersUI: { values: [] },
      options: {
        dataLocationOnSheet: {
          values: { range: 'A:ZZ', rangeDefinition: 'specifyRangeA1' },
        },
      },
      resource: 'sheet',
      operation: 'read',
      range: "'Hoja 1'!A:ZZ",
    },
    credentials: {
      googleSheetsOAuth2Api: { id: 'WBM00QjQj4q8xjLF', name: 'Cuenta de Google Sheets' },
    },
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
  },
  {
    id: 'code-prep-001',
    name: 'Preparar seguimiento',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [520, 0],
    parameters: { jsCode },
  },
  {
    id: 'tg-nudge-001',
    name: 'Telegram recordatorio',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [780, 0],
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: '={{ $json.chat_id }}',
      text: '={{ $json.texto_seguimiento }}',
      additionalFields: { appendAttribution: false },
    },
    credentials: {
      telegramApi: { id: 'y7Csd64HC2GLm8WY', name: 'Telegram Bot Inmobiliaria' },
    },
  },
  {
    id: 'gs-ult-001',
    name: 'Marcar ultimo seguimiento',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1040, 0],
    parameters: {
      operation: 'appendOrUpdate',
      documentId: { __rl: true, value: '1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo', mode: 'id' },
      sheetName: { __rl: true, value: 'Hoja 1', mode: 'name' },
      columns: {
        ignoreTypeMismatch: false,
        matchingColumns: ['chat_id'],
        schema: [],
        mappingMode: 'defineBelow',
        attemptToConvertTypes: false,
        value: {
          chat_id: "={{ $('Preparar seguimiento').item.json.chat_id }}",
          ultimo_seguimiento: "={{ $('Preparar seguimiento').item.json.ultimo_seguimiento_iso }}",
        },
      },
      options: {},
    },
    credentials: {
      googleSheetsOAuth2Api: { id: 'WBM00QjQj4q8xjLF', name: 'Cuenta de Google Sheets' },
    },
    onError: 'continueRegularOutput',
  },
];

const connections = {
  'Schedule cada día 10h': { main: [[{ node: 'Leer CRM historial', type: 'main', index: 0 }]] },
  'Leer CRM historial': { main: [[{ node: 'Preparar seguimiento', type: 'main', index: 0 }]] },
  'Preparar seguimiento': { main: [[{ node: 'Telegram recordatorio', type: 'main', index: 0 }]] },
  'Telegram recordatorio': { main: [[{ node: 'Marcar ultimo seguimiento', type: 'main', index: 0 }]] },
};

const payload = {
  name: 'Telegram seguimiento inactivos',
  settings: { executionOrder: 'v1', timezone: 'America/Argentina/Buenos_Aires' },
  nodes,
  connections,
};

fs.writeFileSync(path.join(base, 'n8n_workflow_seguimiento_inactivos.create.json'), JSON.stringify(payload), 'utf8');
console.log('written', payload.nodes.length, 'nodes');
