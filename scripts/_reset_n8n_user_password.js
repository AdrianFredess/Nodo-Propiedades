/**
 * Actualiza la contraseña del usuario en ~/.n8n/database.sqlite (instalación npm).
 * Usa el mismo algoritmo que n8n (bcryptjs, 10 rounds).
 *
 * Uso (PowerShell):
 *   $env:N8N_RESET_EMAIL="tu@email.com"
 *   $env:N8N_RESET_PASSWORD="nueva-clave"
 *   node scripts/_reset_n8n_user_password.js
 *
 * Detener n8n antes de ejecutar para evitar SQLITE_BUSY.
 */

const path = require('path');
const Database = require('better-sqlite3');

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

const dbPath = path.join(process.env.USERPROFILE, '.n8n', 'database.sqlite');
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
