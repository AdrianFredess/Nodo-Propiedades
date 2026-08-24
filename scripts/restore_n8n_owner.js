/**
 * Restaura el usuario owner en la SQLite de n8n (misma ruta que Docker: N8N_HOST_DATA_DIR).
 * Parar el contenedor antes: docker stop nodopropiedades-n8n-1
 *
 * Uso: node scripts/restore_n8n_owner.js [email] [password]
 */
const Database = require('better-sqlite3');
const bcrypt = require('C:/Users/adrian/AppData/Roaming/npm/node_modules/n8n/node_modules/bcryptjs');

const dir = process.env.N8N_HOST_DATA_DIR || 'C:/Users/adrian/.n8n';
const dbPath = `${dir.replace(/\/$/, '')}/database.sqlite`;
const email = (process.argv[2] || '__SET_NOTIFY_EMAIL__').toLowerCase().trim();
const plain = process.argv[3] || 'adriann8n10f';

const db = new Database(dbPath);
try {
  const owner = db.prepare("SELECT id FROM user WHERE roleSlug = 'global:owner' LIMIT 1").get();
  if (!owner) throw new Error('Sin global:owner en ' + dbPath);
  const hash = bcrypt.hashSync(plain, 10);
  const settings = JSON.stringify({ userActivated: true });
  db.prepare(
    `UPDATE user SET email=@email, password=@password, settings=@settings,
     disabled=0, mfaEnabled=0, mfaSecret=NULL, mfaRecoveryCodes=NULL,
     updatedAt=STRFTIME('%Y-%m-%d %H:%M:%f','NOW') WHERE id=@id`,
  ).run({ email, password: hash, settings, id: owner.id });
  console.log('OK', email, '→', dbPath);
} finally {
  db.close();
}
