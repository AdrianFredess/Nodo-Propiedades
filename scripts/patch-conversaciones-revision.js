/**
 * Parchea workflows multicanal para registrar conversaciones difíciles en:
 *   Google Sheets > Conversaciones_Revision
 *
 * Uso:
 *   node scripts/patch-conversaciones-revision.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SNIPPET_PREP = path.join(
  __dirname,
  'snippets',
  'conversaciones-revision-prepare-row.js',
);

const TARGETS = [
  {
    file: 'SIMPLE-02 WhatsApp Bot.json',
    canal: 'whatsapp',
    parseNode: 'Code - Procesar IA',
    docNode: 'Google Sheets - Actualizar Lead',
    sheetName: 'Conversaciones_Revision',
  },
  {
    file: 'Bot Telegram Inmobiliaria.json',
    canal: 'telegram',
    parseNode: 'Parsear Respuesta',
    docNode: 'Sync Leads_Bot',
    sheetName: 'Conversaciones_Revision',
  },
];

function uid(prefix) {
  return (
    prefix +
    '-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 7)
  );
}

function snippetPrepCode(canal) {
  const raw = fs.readFileSync(SNIPPET_PREP, 'utf8');
  return raw.replace(/__CANAL__/g, canal);
}

function findGoogleDocAndCreds(wf, nodeName) {
  const node = wf.nodes.find((n) => n?.name === nodeName);
  if (!node || node.type !== 'n8n-nodes-base.googleSheets') {
    throw new Error(`Google Sheets node no encontrado: ${nodeName}`);
  }
  return { documentId: node.parameters.documentId, credentials: node.credentials };
}

function getOrCreateConnections(wf, from) {
  if (!wf.connections) wf.connections = {};
  if (!wf.connections[from]) wf.connections[from] = { main: [[]] };
  if (!wf.connections[from].main) wf.connections[from].main = [[]];
  if (!Array.isArray(wf.connections[from].main) || wf.connections[from].main.length === 0) {
    wf.connections[from].main = [[]];
  }
  return wf.connections[from];
}

function hasOutgoing(wf, from, to) {
  const c = wf.connections?.[from]?.main || [];
  for (const branch of c) {
    for (const edge of branch || []) {
      if (edge?.node === to) return true;
    }
  }
  return false;
}

function addOutgoingParallel(wf, from, to) {
  const nodeConn = getOrCreateConnections(wf, from);
  const branches = nodeConn.main;
  const idx = branches.findIndex((b) => (b || []).length > 0);
  const bIdx = idx >= 0 ? idx : 0;
  nodeConn.main[bIdx] = nodeConn.main[bIdx] || [];
  if (!hasOutgoing(wf, from, to)) {
    nodeConn.main[bIdx].push({ node: to, type: 'main', index: 0 });
  }
}

function ensureNode(wf, node) {
  const idx = wf.nodes.findIndex((n) => n.name === node.name);
  if (idx >= 0) {
    wf.nodes[idx] = { ...wf.nodes[idx], ...node };
    return;
  }
  wf.nodes.push(node);
}

function ensureCodeToIf(wf, codeNodeName, ifNodeName) {
  wf.connections = wf.connections || {};
  if (wf.connections[codeNodeName]?.main) return;
  wf.connections[codeNodeName] = { main: [[{ node: ifNodeName, type: 'main', index: 0 }]] };
}

function ensureIfToSheets(wf, ifNodeName, sheetsNodeName) {
  wf.connections = wf.connections || {};
  if (wf.connections[ifNodeName]?.main) return;
  wf.connections[ifNodeName] = {
    main: [[{ node: sheetsNodeName, type: 'main', index: 0 }], []],
  };
}

function makeCodeNode(name, canal) {
  return {
    id: uid('rev-code'),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [3500, canal === 'whatsapp' ? 760 : 640],
    parameters: {
      jsCode: snippetPrepCode(canal),
    },
  };
}

function makeIfNode(name) {
  return {
    id: uid('rev-if'),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3720, 760],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: uid('rev-cond'),
            leftValue: '={{ Boolean($json.registrar_revision) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  };
}

function makeSheetsNode(name, docInfo, sheetName) {
  return {
    id: uid('rev-gs'),
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position: [3920, 760],
    parameters: {
      operation: 'append',
      documentId: docInfo.documentId,
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['chat_id'],
        schema: [],
        value: {
          fecha_hora: '={{ $json.fecha_hora }}',
          canal: '={{ $json.canal }}',
          motivo: '={{ $json.motivo }}',
          chat_id: '={{ $json.chat_id }}',
          lead_name: '={{ $json.lead_name }}',
          ultimo_mensaje_cliente: '={{ $json.ultimo_mensaje_cliente }}',
          respuesta_bot: '={{ $json.respuesta_bot }}',
          historial_json: '={{ $json.historial_json }}',
          mensajes_extra: '={{ $json.mensajes_extra }}',
        },
      },
      options: {},
    },
    credentials: docInfo.credentials,
    onError: 'continueRegularOutput',
  };
}

function patchOneWorkflow(wfPath, cfg) {
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

  const { documentId, credentials } = findGoogleDocAndCreds(wf, cfg.docNode);
  const docInfo = { documentId, credentials };

  const suf = cfg.canal === 'whatsapp' ? 'WA' : 'TG';
  const codeName = `Code - Preparar Registro Revision ${suf}`;
  const ifName = `IF Registrar Conversaciones_Revision ${suf}`;
  const gsName = `Google Sheets - Conversaciones_Revision ${suf}`;

  ensureNode(wf, makeCodeNode(codeName, cfg.canal));
  ensureNode(wf, makeIfNode(ifName));
  ensureNode(wf, makeSheetsNode(gsName, docInfo, cfg.sheetName));

  // Conectar parse -> code (en paralelo, sin tocar el flujo existente)
  addOutgoingParallel(wf, cfg.parseNode, codeName);
  ensureCodeToIf(wf, codeName, ifName);
  ensureIfToSheets(wf, ifName, gsName);

  fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('OK parcheando:', wfPath);
}

function main() {
  for (const t of TARGETS) {
    const wfPath = path.join(ROOT, 'workflows', t.file);
    patchOneWorkflow(wfPath, t);
  }
}

main();

