/**
 * Actualiza la contraseña del usuario en database.sqlite de n8n.
 * Usa N8N_HOST_DATA_DIR del .env (misma ruta que Docker) o ~/.n8n.
 *
 * Uso (PowerShell):
 *   docker stop nodo-propiedades-n8n-1
 *   $env:N8N_RESET_EMAIL="tu@email.com"
 *   $env:N8N_RESET_PASSWORD="nueva-clave"
 *   node scripts/_reset_n8n_user_password.js
 *   docker start nodo-propiedades-n8n-1
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');

function loadEnvValue(key, fallback) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return fallback;
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) return fallback;
  return String(m[1]).trim().replace(/^["']|["']$/g, '') || fallback;
}

const email = process.env.N8N_RESET_EMAIL;
const password = process.env.N8N_RESET_PASSWORD;

if (!email || !password) {
  console.error('Definí N8N_RESET_EMAIL y N8N_RESET_PASSWORD en el entorno.');
  process.exit(1);
}

const bcryptPath = path.join(
  process.env.APPDATA,
  'npm',
  'node_modules',
  'n8n',
  'node_modules',
  'bcryptjs',
);
const bcrypt = require(bcryptPath);

const dataDir =
  process.env.N8N_HOST_DATA_DIR ||
  loadEnvValue('N8N_HOST_DATA_DIR', path.join(process.env.USERPROFILE, '.n8n'));
const dbPath = path.join(dataDir.replace(/\/$/, ''), 'database.sqlite');
const hash = bcrypt.hashSync(password, 10);
const now = new Date().toISOString();

let db;
try {
  db = new Database(dbPath);
  const row = db.prepare('SELECT id FROM user WHERE email = ?').get(email);
  if (!row) {
    console.error(`No hay usuario con email: ${email}`);
    process.exit(1);
  }

  const info = db
    .prepare(
      `UPDATE user SET
        password = ?,
        updatedAt = ?,
        mfaEnabled = 0,
        mfaSecret = NULL,
        mfaRecoveryCodes = NULL
      WHERE email = ?`,
    )
    .run(hash, now, email);

  if (info.changes !== 1) {
    console.error('UPDATE no aplicó cambios (inesperado).');
    process.exit(1);
  }

  console.log('Contraseña actualizada correctamente para:', email);
  console.log('Reiniciá n8n si estaba en ejecución y volvé a iniciar sesión.');
} catch (e) {
  if (e && e.code === 'SQLITE_BUSY') {
    console.error(
      'Base ocupada (SQLITE_BUSY). Cerrá el proceso de n8n y volvé a ejecutar este script.',
    );
  } else {
    console.error(e.message || e);
  }
  process.exit(1);
} finally {
  if (db) db.close();
}
