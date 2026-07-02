/**
 * Crea la planilla "Nodo Propiedades CRM" en Google Sheets e importa los CSV de csv/.
 * Requiere: config/google-credentials.json (OAuth2 escritorio) y genera config/google-token.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { parse } = require('csv-parse/sync');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const CSV_DIR = path.join(ROOT, 'csv');
const CRED_PATH = path.join(ROOT, 'config', 'google-credentials.json');
const TOKEN_PATH = path.join(ROOT, 'config', 'google-token.json');

/** Debe coincidir con un "URI de redireccionamiento autorizado" en Google Cloud Console */
const OAUTH_PORT = 34567;
const OAUTH_PATH = '/oauth2callback';
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}${OAUTH_PATH}`;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const SPREADSHEET_TITLE = 'Nodo Propiedades CRM';

const SHEETS = [
  { name: 'Leads', csvFile: 'Google Sheets - Leads.csv' },
  { name: 'Propiedades', csvFile: 'Google Sheets - Propiedades.csv' },
  { name: 'Interacciones', csvFile: 'Google Sheets - Interacciones.csv' },
  { name: 'Seguimientos', csvFile: 'Google Sheets - Seguimientos.csv' },
  { name: 'Errores', csvFile: 'Google Sheets - Errores.csv' },
];

function loadCredentials() {
  if (!fs.existsSync(CRED_PATH)) {
    console.error(
      '\nFalta config/google-credentials.json.\n' +
        'Copiá config/google-credentials.example.json, renombralo y pegá el JSON descargado de Google Cloud (tipo Escritorio).\n'
    );
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
    if (err) console.warn('No se pudo abrir el navegador automáticamente. Abrí esta URL manualmente:\n', url);
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
        '<!DOCTYPE html><html><body><h1>Listo</h1><p>Podés cerrar esta ventana y volver a la terminal.</p></body></html>'
      );
      server.close(() => {
        if (err) reject(new Error(`OAuth error: ${err}`));
        else if (code) resolve(code);
        else reject(new Error('No se recibió el código de autorización.'));
      });
    });
    server.on('error', reject);
    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      console.log(`\nEsperando OAuth en ${REDIRECT_URI} ...`);
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

  console.log('\n--- Primera ejecución: autorización OAuth2 ---');
  console.log('Asegurate de tener en Google Cloud Console este URI autorizado:');
  console.log('  ', REDIRECT_URI);
  console.log('(Credenciales → tu cliente OAuth → URI de redireccionamiento autorizado)\n');

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  openBrowser(authUrl);
  console.log('Si no se abrió el navegador, abrí manualmente:\n', authUrl, '\n');

  const code = await waitForOAuthCode();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  console.log('\nToken guardado en:', TOKEN_PATH);
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

async function main() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('\nCreando planilla:', SPREADSHEET_TITLE);
  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SPREADSHEET_TITLE },
      sheets: SHEETS.map((s) => ({
        properties: {
          title: s.name,
          gridProperties: { rowCount: 5000, columnCount: 60 },
        },
      })),
    },
  });

  const spreadsheetId = createRes.data.spreadsheetId;
  const url = createRes.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  const summary = [];

  for (const { name, csvFile } of SHEETS) {
    const csvPath = path.join(CSV_DIR, csvFile);
    if (!fs.existsSync(csvPath)) {
      console.warn('Advertencia: no existe', csvPath);
      summary.push({ sheet: name, rows: 0, error: 'CSV no encontrado' });
      continue;
    }
    const values = readCsvAsRows(csvPath);
    const safeName = name.replace(/'/g, "''");
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${safeName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    summary.push({ sheet: name, rows: values.length });
    console.log(`  · ${name}: ${values.length} fila(s) (incluye encabezados)`);
  }

  console.log('\n========== RESULTADO ==========');
  console.log('ID de la planilla:', spreadsheetId);
  console.log('URL:', url);
  console.log('\nResumen por hoja:');
  for (const s of summary) {
    if (s.error) console.log(`  - ${s.sheet}: ${s.error}`);
    else console.log(`  - ${s.sheet}: ${s.rows} filas escritas`);
  }
  console.log('\nSiguiente paso: actualizar workflows y n8n con:');
  console.log('  node scripts/_actualizar_sheet_id.js', spreadsheetId);
  console.log('================================\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
