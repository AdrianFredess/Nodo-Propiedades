/**
 * Crea la pestaña Aprendizaje_Matias en Google Sheets (headers A1:J1).
 *
 * Intenta en orden:
 *  1) googleapis OAuth (config/google-credentials.json + google-token.json)
 *  2) n8n local (workflow efímero con credencial ya configurada)
 *  3) instrucciones manuales
 *
 * Uso: node scripts/setup-aprendizaje-sheet.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const CRED_PATH = path.join(ROOT, 'config', 'google-credentials.json');
const TOKEN_PATH = path.join(ROOT, 'config', 'google-token.json');
const SHEET_TAB = 'Aprendizaje_Matias';

const HEADERS = [
  'fecha',
  'canal',
  'contexto_cliente',
  'respuesta_matias',
  'zona',
  'operacion',
  'presupuesto',
  'temperatura',
  'intencion',
  'patron',
];

function loadEnvValue(key, fallback) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return fallback;
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) return fallback;
  return String(m[1]).trim().replace(/^["']|["']$/g, '') || fallback;
}

const sheetId = loadEnvValue(
  'GOOGLE_SHEET_ID',
  '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ',
);

function loadApiKey() {
  const fromEnv = loadEnvValue('N8N_API_KEY', '');
  if (fromEnv) return fromEnv;
  try {
    const mcp = JSON.parse(
      fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'),
    );
    for (const s of Object.values(mcp.mcpServers || {})) {
      if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
    }
  } catch (e) {}
  return '';
}

function n8nRequest(method, urlPath, body, apiUrl) {
  const url = new URL(urlPath, apiUrl);
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

async function authorizeGoogle() {
  if (!fs.existsSync(CRED_PATH)) return null;
  const { google } = require('googleapis');
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const cred = raw.installed || raw.web;
  const oAuth2Client = new google.auth.OAuth2(
    cred.client_id,
    cred.client_secret,
    'http://127.0.0.1:34567/oauth2callback',
  );
  if (!fs.existsSync(TOKEN_PATH)) return null;
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  return oAuth2Client;
}

async function sheetExistsGoogle(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return (meta.data.sheets || []).some((s) => s.properties?.title === title);
}

async function createViaGoogleApi() {
  const auth = await authorizeGoogle();
  if (!auth) return { ok: false, reason: 'sin credenciales OAuth locales' };

  const { google } = require('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });

  const exists = await sheetExistsGoogle(sheets, sheetId, SHEET_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_TAB,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    console.log('Pestaña creada vía googleapis:', SHEET_TAB);
  } else {
    console.log('Pestaña ya existía:', SHEET_TAB);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${SHEET_TAB}'!A1:J1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });

  return { ok: true, method: 'googleapis' };
}

async function resolveN8nCredId(apiUrl) {
  const wfId = 'npq6sC6YLaUBpHac';
  try {
    const wf = await n8nRequest('GET', `/api/v1/workflows/${wfId}`, null, apiUrl);
    const data = wf.data || wf;
    const node =
      (data.nodes || []).find((n) => n.name === 'Google Sheets - Buscar Lead') ||
      (data.nodes || []).find((n) => n.credentials?.googleSheetsOAuth2Api);
    return node?.credentials?.googleSheetsOAuth2Api?.id || '';
  } catch (e) {
    return '';
  }
}

async function createViaN8n() {
  const apiKey = loadApiKey();
  if (!apiKey) return { ok: false, reason: 'sin N8N_API_KEY' };

  const apiUrl = loadEnvValue('N8N_API_URL', 'http://localhost:5678');
  const credId = await resolveN8nCredId(apiUrl);
  if (!credId) return { ok: false, reason: 'no se encontró credencial Google Sheets en n8n' };

  const cred = {
    googleSheetsOAuth2Api: { id: credId, name: 'Cuenta de Google Sheets' },
  };

  const wf = {
    name: '_TMP Setup Aprendizaje_Matias',
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        id: 'wh1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [200, 300],
        parameters: {
          path: 'setup-aprendizaje-matias',
          httpMethod: 'POST',
          responseMode: 'lastNode',
          options: {},
        },
      },
      {
        id: 'gsCreate',
        name: 'Crear pestaña',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.7,
        position: [420, 300],
        parameters: {
          resource: 'sheet',
          operation: 'create',
          documentId: { __rl: true, mode: 'id', value: sheetId },
          title: SHEET_TAB,
          options: {},
        },
        credentials: cred,
        onError: 'continueRegularOutput',
        continueOnFail: true,
      },
      {
        id: 'gsHeaders',
        name: 'Escribir headers',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.7,
        position: [640, 300],
        parameters: {
          resource: 'sheet',
          operation: 'update',
          documentId: { __rl: true, mode: 'id', value: sheetId },
          sheetName: { __rl: true, mode: 'name', value: SHEET_TAB },
          range: 'A1:J1',
          columns: {
            mappingMode: 'defineBelow',
            value: Object.fromEntries(HEADERS.map((h) => [h, `={{ ${h} }}`])),
          },
          options: {},
        },
        credentials: cred,
      },
      {
        id: 'codeHeaders',
        name: 'Fila headers',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [520, 300],
        parameters: {
          jsCode: `const row = ${JSON.stringify(Object.fromEntries(HEADERS.map((h) => [h, h])))};\nreturn [{ json: row }];`,
        },
      },
    ],
    connections: {
      Webhook: { main: [[{ node: 'Crear pestaña', type: 'main', index: 0 }]] },
      'Crear pestaña': { main: [[{ node: 'Fila headers', type: 'main', index: 0 }]] },
      'Fila headers': { main: [[{ node: 'Escribir headers', type: 'main', index: 0 }]] },
    },
  };

  console.log('Creando workflow efímero en n8n…');
  const created = await n8nRequest('POST', '/api/v1/workflows', wf, apiUrl);
  const id = (created.data || created).id;
  await n8nRequest('POST', `/api/v1/workflows/${id}/activate`, null, apiUrl);

  const webhookUrl = `${apiUrl.replace(/\/$/, '')}/webhook/setup-aprendizaje-matias`;
  console.log('Ejecutando webhook:', webhookUrl);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  console.log('Webhook status:', res.status, text.slice(0, 400));

  try {
    await n8nRequest('POST', `/api/v1/workflows/${id}/deactivate`, null, apiUrl);
    await n8nRequest('DELETE', `/api/v1/workflows/${id}`, null, apiUrl);
  } catch (_) {}

  if (res.status >= 400) {
    return { ok: false, reason: `webhook ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, method: 'n8n' };
}

function printManualInstructions() {
  console.log(`
=== Aprendizaje Matías — creación manual ===

No se pudo automatizar (faltan credenciales OAuth locales y/o falló n8n).

1. Abrí el Sheet del proyecto:
   https://docs.google.com/spreadsheets/d/${sheetId}/edit

2. Creá una pestaña llamada exactamente:
   ${SHEET_TAB}

3. En la fila 1 (A1:J1), pegá estos headers:
   ${HEADERS.join(' | ')}

4. Congelá la fila 1 (Ver → Congelar → 1 fila).

5. Desplegá nodos en n8n:
   npm run patch-advisor-learning -- --deploy
`);
}

async function main() {
  console.log('Sheet ID:', sheetId);
  console.log('Pestaña:', SHEET_TAB);

  try {
    const g = await createViaGoogleApi();
    if (g.ok) {
      console.log('\n✓ Listo vía', g.method);
      console.log('URL:', `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`);
      return;
    }
    console.log('googleapis:', g.reason);
  } catch (e) {
    console.log('googleapis error:', e.message);
  }

  try {
    const n = await createViaN8n();
    if (n.ok) {
      console.log('\n✓ Listo vía', n.method);
      console.log('URL:', `https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
      return;
    }
    console.log('n8n:', n.reason);
  } catch (e) {
    console.log('n8n error:', e.message);
  }

  printManualInstructions();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
