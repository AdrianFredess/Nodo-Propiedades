const path = require('path');
const bcrypt = require('/usr/local/lib/node_modules/n8n/node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs');
const sqlite3 = require('/usr/local/lib/node_modules/n8n/node_modules/.pnpm/sqlite3@5.1.7/node_modules/sqlite3');

const dbPath = '/home/node/.n8n/database.sqlite';
const email = (process.argv[2] || '__SET_NOTIFY_EMAIL__').toLowerCase().trim();
const plain = process.argv[3] || 'adriann8n10f';

const db = new sqlite3.Database(dbPath);
const hash = bcrypt.hashSync(plain, 10);
const settings = JSON.stringify({ userActivated: true });
const now = new Date().toISOString();

db.serialize(() => {
  db.get("SELECT id FROM user WHERE roleSlug = 'global:owner' LIMIT 1", (err, owner) => {
    if (err) {
      console.error(err.message || err);
      process.exit(1);
    }
    if (!owner) {
      console.error('Sin global:owner');
      process.exit(1);
    }
    db.run(
      `UPDATE user SET email = ?, password = ?, settings = ?, disabled = 0,
       mfaEnabled = 0, mfaSecret = NULL, mfaRecoveryCodes = NULL, updatedAt = ?
       WHERE id = ?`,
      [email, hash, settings, now, owner.id],
      (err) => {
        if (err) {
          console.error('UPDATE error:', err.message || err);
          process.exit(1);
        }
        console.log('OK', email);
        db.close();
      },
    );
  });
});
