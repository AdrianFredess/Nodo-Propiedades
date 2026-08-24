/**
 * Crea hoja Politicas_Pago + filas desde csv/Politicas_Pago.csv vía n8n API
 * (workflow efímero, se desactiva al terminar).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { parse } = require('csv-parse/sync');

const ROOT = 'D:/Dev/Nodo-Propiedades';
const DOC_ID = '1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU';
const API_URL = process.env.N8N_API_URL || 'http://localhost:5678';

function loadApiKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  const mcp = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'),
  );
  const servers = mcp.mcpServers || {};
  const n8n = servers.n8n || servers['user-n8n'] || Object.values(servers).find((s) => s?.env?.N8N_API_KEY);
  return n8n.env.N8N_API_KEY;
}

function request(method, urlPath, body) {
  const url = new URL(urlPath, API_URL);
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'X-N8N-API-KEY': loadApiKey(),
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
          let json = {};
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode} ${JSON.stringify(json).slice(0, 500)}`));
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

async function main() {
  const csv = fs.readFileSync(path.join(ROOT, 'csv/Politicas_Pago.csv'), 'utf8');
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  const values = [['clave', 'valor'], ...rows.map((r) => [r.clave, r.valor])];

  // Workflow one-shot: Code (rows) -> Google Sheets append
  const wf = {
    name: '_TMP Setup Politicas_Pago',
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        id: 'wh1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [200, 300],
        parameters: {
          path: 'setup-politicas-pago',
          httpMethod: 'POST',
          responseMode: 'lastNode',
          options: {},
        },
      },
      {
        id: 'code1',
        name: 'Filas CSV',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [420, 300],
        parameters: {
          jsCode: `const rows = ${JSON.stringify(rows)};\nreturn rows.map(r => ({ json: { clave: r.clave, valor: r.valor } }));`,
        },
      },
      {
        id: 'gs1',
        name: 'Append Politicas',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.7,
        position: [640, 300],
        parameters: {
          operation: 'append',
          documentId: { __rl: true, mode: 'id', value: DOC_ID },
          sheetName: { __rl: true, mode: 'name', value: 'Politicas_Pago' },
          columns: {
            mappingMode: 'defineBelow',
            value: {
              clave: '={{ $json.clave }}',
              valor: '={{ $json.valor }}',
            },
          },
          options: {},
        },
        credentials: {
          googleSheetsOAuth2Api: {
            id: '__SET_GOOGLE_SHEETS_CREDENTIAL_ID__',
            name: 'Cuenta de Google Sheets',
          },
        },
      },
    ],
    connections: {
      Webhook: { main: [[{ node: 'Filas CSV', type: 'main', index: 0 }]] },
      'Filas CSV': {
        main: [[{ node: 'Append Politicas', type: 'main', index: 0 }]],
      },
    },
  };

  // Create sheet via Google Sheets API through a small Code+HTTP is hard.
  // Try append first — if sheet missing, create via spreadsheet batchUpdate using Sheets node "create".
  console.log('Creating setup workflow…');
  const created = await request('POST', '/api/v1/workflows', wf);
  const id = (created.data || created).id;
  console.log('workflow id', id);
  await request('POST', `/api/v1/workflows/${id}/activate`);
  console.log('Calling webhook…');
  try {
    const res = await fetch('http://127.0.0.1:5678/webhook/setup-politicas-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const text = await res.text();
    console.log('webhook status', res.status, text.slice(0, 300));
  } catch (e) {
    console.error('webhook call failed', e.message);
  }
  try {
    await request('POST', `/api/v1/workflows/${id}/deactivate`);
  } catch (_) {}
  console.log('Done. Si falló por hoja inexistente, creá Politicas_Pago a mano (docs/POLITICAS-PAGO.md).');
  console.log('values preview', values.length);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
