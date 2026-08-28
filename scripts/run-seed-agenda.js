const fs = require('fs');
const path = require('path');
const http = require('http');

function loadApiKey() {
  const mcp = JSON.parse(
    fs.readFileSync(
      path.join(process.env.USERPROFILE, '.cursor/mcp.json'),
      'utf8',
    ),
  );
  for (const s of Object.values(mcp.mcpServers || {})) {
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  }
  throw new Error('Sin N8N_API_KEY');
}

const KEY = loadApiKey();
const ID = 'LSKeZxRxHf5Touif';
const SHEET = '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ';
const CRED = {
  googleSheetsOAuth2Api: {
    id: 'WBM00QjQj4q8xjLF',
    name: 'Cuenta de Google Sheets',
  },
};

function request(method, urlPath, body) {
  const url = new URL(urlPath, 'http://localhost:5678');
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'X-N8N-API-KEY': KEY,
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(JSON.stringify(json).slice(0, 700)));
            return;
          }
          resolve(json);
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function loadSeed() {
  const raw = fs.readFileSync(
    path.join(__dirname, '..', 'csv', 'Agenda_Visitas.csv'),
    'utf8',
  );
  const lines = raw.trim().split(/\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(',');
    const o = {};
    headers.forEach((h, i) => {
      o[h] = (cols[i] || '').trim();
    });
    return o;
  });
}

async function main() {
  const seed = loadSeed();
  console.log('rows', seed.length, seed[0]);

  const wf = {
    name: '_TMP Seed Agenda WH',
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        id: 'w',
        name: 'Webhook Seed',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: 'seed-agenda',
        parameters: {
          httpMethod: 'POST',
          path: 'seed-agenda',
          responseMode: 'lastNode',
          options: {},
        },
      },
      {
        id: 'create',
        name: 'Create Sheet',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.7,
        position: [200, 0],
        credentials: CRED,
        onError: 'continueRegularOutput',
        parameters: {
          resource: 'sheet',
          operation: 'create',
          documentId: { __rl: true, mode: 'id', value: SHEET },
          title: 'Agenda_Visitas',
          options: {},
        },
      },
      {
        id: 'c',
        name: 'Seed Rows',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [420, 0],
        parameters: {
          jsCode:
            'return ' + JSON.stringify(seed) + '.map((r) => ({ json: r }));',
        },
      },
      {
        id: 's',
        name: 'Append Agenda',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.7,
        position: [640, 0],
        credentials: CRED,
        onError: 'continueRegularOutput',
        parameters: {
          operation: 'append',
          documentId: { __rl: true, mode: 'id', value: SHEET },
          sheetName: { __rl: true, mode: 'name', value: 'Agenda_Visitas' },
          columns: { mappingMode: 'autoMapInputData', value: {} },
          options: {},
        },
      },
    ],
    connections: {
      'Webhook Seed': {
        main: [[{ node: 'Create Sheet', type: 'main', index: 0 }]],
      },
      'Create Sheet': {
        main: [[{ node: 'Seed Rows', type: 'main', index: 0 }]],
      },
      'Seed Rows': {
        main: [[{ node: 'Append Agenda', type: 'main', index: 0 }]],
      },
    },
  };

  await request('PUT', `/api/v1/workflows/${ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  });
  await request('POST', `/api/v1/workflows/${ID}/activate`);

  await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: '/webhook/seed-agenda',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          console.log('seed', res.statusCode, data.slice(0, 300));
          resolve();
        });
      },
    );
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
