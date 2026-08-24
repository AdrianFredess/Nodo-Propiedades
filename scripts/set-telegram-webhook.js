/**
 * Re-set Telegram webhook al ngrok fijo + getWebhookInfo.
 * Token: TELEGRAM_BOT_TOKEN env, o descifrado desde ~/.n8n (local).
 * Nunca imprime el token.
 *
 * Uso: node scripts/set-telegram-webhook.js
 */
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const NGROK =
  process.env.N8N_HOST || 'deranged-defile-comrade.ngrok-free.dev';
const WEBHOOK_ID =
  process.env.TELEGRAM_WEBHOOK_ID ||
  'f0e1d2c3-b4a5-9687-8765-inmobiliaria01';
const CRED_ID = process.env.TELEGRAM_CRED_ID || '__SET_TELEGRAM_CREDENTIAL_ID__';
// n8n Telegram Trigger valida X-Telegram-Bot-Api-Secret-Token =
// `{workflowId}_{triggerNodeId}`. Si setWebhook va sin secret, Telegram deja
// de enviarlo y n8n responde 403 "Provided secret is not valid".
const WORKFLOW_ID = process.env.TELEGRAM_WORKFLOW_ID || '8JoSfkcn3pE1f0av';
const TRIGGER_NODE_ID =
  process.env.TELEGRAM_TRIGGER_NODE_ID ||
  'a1b2c3d4-0001-0001-0001-000000000001';
const SECRET_TOKEN =
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  `${WORKFLOW_ID}_${TRIGGER_NODE_ID}`;
const TARGET_URL = `https://${NGROK}/webhook/${WEBHOOK_ID}/webhook`;

function decryptN8nData(encryptionKey, data) {
  const input = Buffer.from(String(data), 'base64');
  if (input.slice(0, 8).toString() !== 'Salted__') {
    throw new Error('Formato de credencial no Salted__');
  }
  const salt = input.slice(8, 16);
  const encrypted = input.slice(16);
  let keyIv = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (keyIv.length < 48) {
    prev = crypto
      .createHash('md5')
      .update(Buffer.concat([prev, Buffer.from(encryptionKey), salt]))
      .digest();
    keyIv = Buffer.concat([keyIv, prev]);
  }
  const key = keyIv.slice(0, 32);
  const iv = keyIv.slice(32, 48);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return out.toString('utf8');
}

function loadTokenFromN8n() {
  const home = process.env.USERPROFILE || process.env.HOME;
  const cfgPath = path.join(home, '.n8n', 'config');
  const dbPath = path.join(home, '.n8n', 'database.sqlite');
  if (!fs.existsSync(cfgPath) || !fs.existsSync(dbPath)) return null;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  if (!cfg.encryptionKey) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare(
        'SELECT data FROM credentials_entity WHERE id = ? OR name LIKE ? LIMIT 1',
      )
      .get(CRED_ID, '%Telegram Bot Inmobiliaria%');
    if (!row) return null;
    const parsed = JSON.parse(decryptN8nData(cfg.encryptionKey, row.data));
    return parsed.accessToken || parsed.access_token || null;
  } finally {
    db.close();
  }
}

function httpsJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { timeout: 20000, family: 4 },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function tgViaCurl(token, method, params) {
  const { spawnSync } = require('child_process');
  const endpoint = `https://api.telegram.org/bot${token}/${method}`;
  const usePost = params && Object.keys(params).length > 0;
  const args = usePost
    ? [
        '-sS',
        '-4',
        '--max-time',
        '25',
        '-X',
        'POST',
        '-H',
        'Content-Type: application/json',
        '-d',
        JSON.stringify(params),
        endpoint,
      ]
    : ['-sS', '-4', '--max-time', '25', endpoint];
  const r = spawnSync('curl.exe', args, { encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(r.stderr || `curl exit ${r.status}`);
  }
  return JSON.parse(r.stdout);
}

async function tg(token, method, params) {
  return tgViaCurl(token, method, params);
}

async function main() {
  // Preferir credencial n8n (activa en el bot). Env solo si n8n no está.
  let token = loadTokenFromN8n() || '';
  const fromEnv = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token && fromEnv && !/tu-token|changeme|placeholder/i.test(fromEnv)) {
    token = fromEnv;
  }
  if (!token) {
    console.error(
      'Sin token: seteá TELEGRAM_BOT_TOKEN o usá la credencial n8n local.',
    );
    process.exit(1);
  }

  console.log('Target webhook:', TARGET_URL);

  let me = await tg(token, 'getMe');
  if (!me.ok && fromEnv && fromEnv !== token) {
    token = fromEnv;
    me = await tg(token, 'getMe');
  }
  if (!me.ok) {
    console.error('getMe falló:', me.description);
    process.exit(1);
  }
  console.log('Bot @' + (me.result.username || '?'));

  const before = await tg(token, 'getWebhookInfo');
  if (before.ok) {
    console.log('Antes:', {
      url: before.result.url || '(vacío)',
      pending: before.result.pending_update_count,
      lastError: before.result.last_error_message || null,
    });
  } else {
    console.error('getWebhookInfo falló:', before.description);
    process.exit(1);
  }

  const set = await tg(token, 'setWebhook', {
    url: TARGET_URL,
    drop_pending_updates: true,
    allowed_updates: ['message'],
    secret_token: SECRET_TOKEN,
  });
  if (!set.ok) {
    console.error('setWebhook falló:', set.description);
    process.exit(1);
  }
  console.log('setWebhook: OK (secret alineado con n8n)');

  const after = await tg(token, 'getWebhookInfo');
  if (after.ok) {
    console.log('Después:', {
      url: after.result.url || '(vacío)',
      pending: after.result.pending_update_count,
      lastError: after.result.last_error_message || null,
      hasCustomCert: after.result.has_custom_certificate,
    });
    const ok =
      after.result.url === TARGET_URL ||
      String(after.result.url || '').includes(WEBHOOK_ID);
    if (!ok) {
      console.error('URL no coincide con el target esperado.');
      process.exit(2);
    }
  }
  console.log('Listo.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
