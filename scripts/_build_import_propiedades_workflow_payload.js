/**
 * Genera el payload JSON para n8n_create_workflow (import único de stock a hoja Propiedades).
 * Salida: stdout (UTF-8).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const jsPath = path.join(__dirname, '_tmp_n8n_code_propiedades.js');
const jsCode = fs.readFileSync(jsPath, 'utf8');

const DOC = '1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo';
const CREDS = {
  googleSheetsOAuth2Api: { id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__', name: 'Cuenta de Google Sheets' },
};

const name = 'Import Propiedades Mendoza (una vez)';

const nodes = [
  {
    id: 'imp-wh-1',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [200, 300],
    parameters: {
      path: 'import-propiedades-mza',
      httpMethod: 'POST',
      responseMode: 'responseNode',
      options: {},
    },
  },
  {
    id: 'imp-cl-1',
    name: 'Clear Propiedades',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [440, 300],
    parameters: {
      resource: 'sheet',
      operation: 'clear',
      clear: 'wholeSheet',
      documentId: { __rl: true, mode: 'id', value: DOC },
      sheetName: { __rl: true, mode: 'name', value: 'Propiedades' },
    },
    credentials: CREDS,
  },
  {
    id: 'imp-co-1',
    name: 'Stock Mendoza 30 filas',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [680, 300],
    parameters: { jsCode },
  },
  {
    id: 'imp-ap-1',
    name: 'Append filas',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [920, 300],
    parameters: {
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: DOC },
      sheetName: { __rl: true, mode: 'name', value: 'Propiedades' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          id: '={{ $json.id }}',
          tipo: '={{ $json.tipo }}',
          zona: '={{ $json.zona }}',
          precio: '={{ $json.precio }}',
          descripcion: '={{ $json.descripcion }}',
          estado: '={{ $json.estado }}',
        },
        matchingColumns: [],
        schema: [
          { id: 'id', displayName: 'id', required: false, defaultMatch: false, canBeUsedToMatch: true },
          { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, canBeUsedToMatch: false },
          { id: 'zona', displayName: 'zona', required: false, defaultMatch: false, canBeUsedToMatch: false },
          { id: 'precio', displayName: 'precio', required: false, defaultMatch: false, canBeUsedToMatch: false },
          { id: 'descripcion', displayName: 'descripcion', required: false, defaultMatch: false, canBeUsedToMatch: false },
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, canBeUsedToMatch: false },
        ],
      },
      options: {},
    },
    credentials: CREDS,
  },
  {
    id: 'imp-rsp-1',
    name: 'Respond OK',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [1160, 300],
    parameters: {
      respondWith: 'json',
      responseBody: '={{ { ok: true, filas_escritas: 31, hoja: "Propiedades" } }}',
      options: {},
    },
  },
];

const connections = {
  Webhook: { main: [[{ node: 'Clear Propiedades', type: 'main', index: 0 }]] },
  'Clear Propiedades': { main: [[{ node: 'Stock Mendoza 30 filas', type: 'main', index: 0 }]] },
  'Stock Mendoza 30 filas': { main: [[{ node: 'Append filas', type: 'main', index: 0 }]] },
  'Append filas': { main: [[{ node: 'Respond OK', type: 'main', index: 0 }]] },
};

const outPath = path.join(__dirname, '_wf_import_payload_out.json');
fs.writeFileSync(outPath, JSON.stringify({ name, nodes, connections, settings: { executionOrder: 'v1' } }), 'utf8');
console.error('Escrito:', outPath);
