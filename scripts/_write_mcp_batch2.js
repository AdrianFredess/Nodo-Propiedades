const fs = require('fs');
const path = require('path');
const js = fs.readFileSync(path.join(__dirname, '_tmp_n8n_code_propiedades.js'), 'utf8');
const DOC = '1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo';
const CREDS = { googleSheetsOAuth2Api: { id: 'WBM00QjQj4q8xjLF', name: 'Cuenta de Google Sheets' } };

const ops = [
  {
    type: 'addNode',
    node: {
      id: 'imp-co-1',
      name: 'Stock Mendoza 30 filas',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [680, 300],
      parameters: { jsCode: js },
    },
  },
  { type: 'addConnection', source: 'Clear Propiedades', target: 'Stock Mendoza 30 filas' },
  {
    type: 'addNode',
    node: {
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
  },
  { type: 'addConnection', source: 'Stock Mendoza 30 filas', target: 'Append filas' },
  {
    type: 'addNode',
    node: {
      id: 'imp-rsp-1',
      name: 'Respond OK',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1160, 300],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ ok: true, filas_escritas: 31, hoja: "Propiedades" }) }}',
        options: {},
      },
    },
  },
  { type: 'addConnection', source: 'Append filas', target: 'Respond OK' },
];

fs.writeFileSync(path.join(__dirname, '_mcp_batch2_ops.json'), JSON.stringify(ops), 'utf8');
console.error('OK', path.join(__dirname, '_mcp_batch2_ops.json'));
