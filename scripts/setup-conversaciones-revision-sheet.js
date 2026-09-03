/**
 * Crea la pestaña `Conversaciones_Revision` en el Google Sheet del proyecto
 * (headers en A1:I1).
 *
 * Uso:
 *   node scripts/setup-conversaciones-revision-sheet.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const CRED_PATH = path.join(ROOT, 'config', 'google-credentials.json');
const TOKEN_PATH = path.join(ROOT, 'config', 'google-token.json');

const SHEET_TAB = 'Conversaciones_Revision';
const HEADERS = [
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
    range: `'${SHEET_TAB}'!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });

  return { ok: true, method: 'googleapis' };
}

function printManualInstructions() {
  console.log(`
=== Conversaciones_Revision — setup manual ===

1) Abrí el Sheet del proyecto:
   https://docs.google.com/spreadsheets/d/${sheetId}/edit

2) Creá una pestaña llamada exactamente:
   ${SHEET_TAB}

3) En A1:I1 pegá estos headers:
   ${HEADERS.join(' | ')}
`);
}

async function main() {
  console.log('Sheet ID:', sheetId);
  console.log('Pestaña:', SHEET_TAB);

  const g = await createViaGoogleApi().catch((e) => ({ ok: false, reason: e.message }));
  if (g.ok) {
    console.log('OK vía', g.method);
    console.log('URL:', `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`);
    return;
  }

  console.log('googleapis:', g.reason);
  printManualInstructions();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

