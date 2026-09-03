/**
 * Elimina filas de prueba en Leads_Bot (Google Sheets).
 * Solo borra filas cuyo nombre coincide exactamente (case-insensitive):
 *   cliente nuevo, test user, adrian
 *
 * Uso: node scripts/purge-junk-leads-sheets.js
 * Requiere: config/google-credentials.json + config/google-token.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CRED_PATH = path.join(ROOT, 'config', 'google-credentials.json');
const TOKEN_PATH = path.join(ROOT, 'config', 'google-token.json');
const SHEET_TAB = 'Leads_Bot';

const JUNK_NAMES = new Set(['cliente nuevo', 'test user', 'adrian']);

function loadEnvValue(key, fallback) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return fallback;
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) return fallback;
  return String(m[1]).trim().replace(/^["']|["']$/g, '') || fallback;
}

const spreadsheetId = loadEnvValue(
  'GOOGLE_SHEET_ID',
  '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ',
);

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function authorizeGoogle() {
  if (!fs.existsSync(CRED_PATH) || !fs.existsSync(TOKEN_PATH)) return null;
  const { google } = require('googleapis');
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const cred = raw.installed || raw.web;
  const oAuth2Client = new google.auth.OAuth2(
    cred.client_id,
    cred.client_secret,
    'http://127.0.0.1:34567/oauth2callback',
  );
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  return oAuth2Client;
}

async function getSheetId(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = (meta.data.sheets || []).find((s) => s.properties?.title === title);
  return sheet?.properties?.sheetId;
}

async function main() {
  const auth = await authorizeGoogle();
  if (!auth) {
    console.log('Sin credenciales OAuth locales (config/google-*.json).');
    console.log('El panel ya filtra estos leads vía isJunkLeadKey en el front.');
    process.exit(0);
  }

  const { google } = require('googleapis');
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = await getSheetId(sheets, spreadsheetId, SHEET_TAB);
  if (sheetId == null) {
    console.error('No se encontró la pestaña', SHEET_TAB);
    process.exit(1);
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_TAB}'!A:Z`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) {
    console.log('Sin filas de datos en', SHEET_TAB);
    process.exit(0);
  }

  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h === 'nombre' || h === 'lead_name');
  if (nameIdx < 0) {
    console.error('Columna nombre/lead_name no encontrada. Headers:', header.join(', '));
    process.exit(1);
  }

  const toDelete = [];
  for (let i = 1; i < rows.length; i++) {
    const name = normalizeName(rows[i][nameIdx]);
    if (JUNK_NAMES.has(name)) {
      toDelete.push({ row: i + 1, name: rows[i][nameIdx] });
    }
  }

  if (toDelete.length === 0) {
    console.log('No hay filas de prueba que borrar en', SHEET_TAB);
    process.exit(0);
  }

  console.log('Filas a borrar:', toDelete);

  const requests = toDelete
    .sort((a, b) => b.row - a.row)
    .map(({ row }) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: row - 1,
          endIndex: row,
        },
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  console.log(`Borradas ${toDelete.length} fila(s) de ${SHEET_TAB}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
