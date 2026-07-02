/**
 * Escribe el CSV de simulación (30 propiedades Mendoza) en la planilla SOLO de catálogo
 * (distinta de la de conversaciones / historial). Misma convención que el nodo "Leer Stock Propiedades"
 * y el placeholder __SET_GOOGLE_SHEET_PROPIEDADES_ID__ en n8n.
 *
 * Uso:
 *   npm run import-stock
 *   node scripts/_cargar_propiedades_simulacion_mendoza.js [spreadsheetId]
 *
 * Variables (si no pasás ID por CLI): en .env del proyecto o en el entorno:
 *   GOOGLE_SHEET_PROPIEDADES_ID, NODO_PROPIEDADES_SHEET_ID o N8N_PROPIEDADES_SPREADSHEET_ID
 *
 * Requiere: config/google-credentials.json + config/google-token.json (mismo flujo que _crear_google_sheet.js)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { parse } = require('csv-parse/sync');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'csv', 'Simulacion_30_Propiedades_Mendoza.csv');

/** Carga .env de la raíz del repo (sin dependencia dotenv). No pisa variables ya definidas en el proceso. */
function loadEnvFromRoot() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq === -1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFromRoot();

const CRED_PATH = path.join(ROOT, 'config', 'google-credentials.json');
const TOKEN_PATH = path.join(ROOT, 'config', 'google-token.json');

const OAUTH_PORT = 34567;
const OAUTH_PATH = '/oauth2callback';
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}${OAUTH_PATH}`;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/** Pestaña en la planilla solo-stock (archivo nuevo = "Hoja 1" por defecto en Google) */
const SHEET_TAB = 'Hoja 1';

function resolveSpreadsheetId() {
  const a =
    process.argv[2] ||
    process.env.N8N_PROPIEDADES_SPREADSHEET_ID ||
    process.env.NODO_PROPIEDADES_SHEET_ID ||
    process.env.GOOGLE_SHEET_PROPIEDADES_ID ||
    '';
  const t = String(a).trim();
  if (!t || t === '__SET_GOOGLE_SHEET_PROPIEDADES_ID__') {
    console.error(
      'Falta el ID de la planilla solo de propiedades (NO uses la de conversaciones).\n' +
        '  1) Creá una Google Sheet nueva solo para el catálogo y copiá el ID (entre /d/ y /edit).\n' +
        '  2) Ejecutá: node scripts/_cargar_propiedades_simulacion_mendoza.js TU_ID\n' +
        '     o definí NODO_PROPIEDADES_SHEET_ID / GOOGLE_SHEET_PROPIEDADES_ID.\n' +
        '  3) En n8n reemplazá __SET_GOOGLE_SHEET_PROPIEDADES_ID__ por ese mismo ID en Leer Stock + Import.'
    );
    process.exit(1);
  }
  return t;
}

function loadCredentials() {
  if (!fs.existsSync(CRED_PATH)) {
    console.error('Falta config/google-credentials.json');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  return raw.installed || raw.web;
}

function openBrowser(url) {
  const { exec } = require('child_process');
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url.replace(/"/g, '\\"')}"`
      : process.platform === 'darwin'
        ? `open "${url.replace(/"/g, '\\"')}"`
        : `xdg-open "${url.replace(/"/g, '\\"')}"`;
  exec(cmd, (err) => {
    if (err) console.warn('No se pudo abrir el navegador. URL:\n', url);
  });
}

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url || !req.url.startsWith(OAUTH_PATH)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const u = new URL(req.url, `http://127.0.0.1:${OAUTH_PORT}`);
      const code = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!DOCTYPE html><html><body><h1>Listo</h1><p>Podés cerrar esta ventana.</p></body></html>'
      );
      server.close(() => {
        if (err) reject(new Error(`OAuth error: ${err}`));
        else if (code) resolve(code);
        else reject(new Error('No se recibió el código de autorización.'));
      });
    });
    server.on('error', reject);
    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      console.log(`Esperando OAuth en ${REDIRECT_URI} ...`);
    });
  });
}

async function authorize() {
  const cred = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(cred.client_id, cred.client_secret, REDIRECT_URI);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  console.log('Primera ejecución: autorizá en el navegador. URI autorizado en Cloud Console:\n ', REDIRECT_URI);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  openBrowser(authUrl);
  const code = await waitForOAuthCode();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  console.log('Token guardado en:', TOKEN_PATH);
  return oAuth2Client;
}

function readCsvAsRows(csvPath) {
  const buf = fs.readFileSync(csvPath, 'utf8');
  const bomStripped = buf.charCodeAt(0) === 0xfeff ? buf.slice(1) : buf;
  const rows = parse(bomStripped, {
    relax_column_count: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });
  return rows.map((row) => row.map((cell) => (cell == null || cell === undefined ? '' : String(cell))));
}

async function ensureSheetTab(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const titles = (meta.data.sheets || []).map((s) => s.properties && s.properties.title);
  if (titles.includes(title)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title, gridProperties: { rowCount: 2000, columnCount: 20 } } } }],
    },
  });
  console.log('Creada pestaña:', title);
}

async function main() {
  const spreadsheetId = resolveSpreadsheetId();

  if (!fs.existsSync(CSV_PATH)) {
    console.error('No existe:', CSV_PATH);
    process.exit(1);
  }

  const values = readCsvAsRows(CSV_PATH);
  if (values.length < 2) {
    console.error('CSV sin datos (solo encabezado o vacío).');
    process.exit(1);
  }

  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  await ensureSheetTab(sheets, spreadsheetId, SHEET_TAB);
  const safeName = SHEET_TAB.replace(/'/g, "''");
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${safeName}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  console.log('OK — escritas', values.length, 'filas (con encabezado) en', SHEET_TAB);
  console.log('Spreadsheet:', spreadsheetId);
  console.log('Origen CSV:', CSV_PATH);
}

main().catch((e) => {
  const m = e.message || String(e);
  if (/invalid_grant|Invalid grant/i.test(m)) {
    console.error(
      'OAuth caducado o revocado.\n' +
        '  1) En n8n: Credenciales → Cuenta de Google Sheets → Reconnect.\n' +
        '  2) Para este script: borrá o renombrá config/google-token.json y ejecutá de nuevo (abre navegador en 127.0.0.1:34567).'
    );
  } else {
    console.error(m);
  }
  process.exit(1);
});
