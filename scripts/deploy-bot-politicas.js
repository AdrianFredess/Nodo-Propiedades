/**
 * Actualiza workflow JSON local + emite ops MCP para Bot Telegram
 * (prompt presupuestos/pagos + nodo Leer Politicas Pago).
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/Dev/Nodo-Propiedades';
const WF_PATH = path.join(ROOT, 'workflows/Bot Telegram Inmobiliaria.json');
const SNIPPET = path.join(ROOT, 'scripts/snippets/tg-construir-prompt.js');
const DOC_ID = '1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU';

const jsCode = fs.readFileSync(SNIPPET, 'utf8');
const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));

const promptNode = wf.nodes.find((n) => n.name === 'Construir Prompt');
if (!promptNode) throw new Error('Construir Prompt missing');
promptNode.parameters.jsCode = jsCode;

let politicas = wf.nodes.find((n) => n.name === 'Leer Politicas Pago');
if (!politicas) {
  politicas = {
    id: 'bot-leer-politicas-pago',
    name: 'Leer Politicas Pago',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [576, 520],
    parameters: {
      documentId: { __rl: true, mode: 'id', value: DOC_ID },
      sheetName: { __rl: true, mode: 'name', value: 'Politicas_Pago' },
      filtersUI: { values: [] },
      options: {
        dataLocationOnSheet: {
          values: {
            range: 'A:ZZ',
            rangeDefinition: 'specifyRangeA1',
          },
        },
      },
      resource: 'sheet',
      operation: 'read',
      range: "'Politicas_Pago'!A:ZZ",
    },
    credentials: {
      googleSheetsOAuth2Api: {
        id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__',
        name: 'Cuenta de Google Sheets',
      },
    },
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
  };
  wf.nodes.push(politicas);
}

const setOut = wf.connections['Set Variables'].main[0];
if (!setOut.some((c) => c.node === 'Leer Politicas Pago')) {
  setOut.push({ node: 'Leer Politicas Pago', type: 'main', index: 0 });
}
if (!wf.connections['Leer Politicas Pago']) {
  wf.connections['Leer Politicas Pago'] = {
    main: [[{ node: 'Esperar Lecturas', type: 'main', index: 2 }]],
  };
} else {
  wf.connections['Leer Politicas Pago'] = {
    main: [[{ node: 'Esperar Lecturas', type: 'main', index: 2 }]],
  };
}

fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2), 'utf8');
console.log('Updated local workflow JSON');

const ops = [
  {
    type: 'addNode',
    node: politicas,
  },
  {
    type: 'addConnection',
    source: 'Set Variables',
    target: 'Leer Politicas Pago',
  },
  {
    type: 'addConnection',
    source: 'Leer Politicas Pago',
    target: 'Esperar Lecturas',
    targetIndex: 2,
  },
  {
    type: 'updateNode',
    nodeName: 'Construir Prompt',
    updates: {
      parameters: {
        jsCode,
      },
    },
  },
];

const outOps = path.join(ROOT, 'scripts/_ops_bot_politicas.json');
fs.writeFileSync(
  outOps,
  JSON.stringify({ id: '8JoSfkcn3pE1f0av', operations: ops }, null, 2),
  'utf8',
);
console.log('Wrote', outOps, 'ops', ops.length, 'jsCodeLen', jsCode.length);
