#!/usr/bin/env node
'use strict';

/**
 * Fase 7.6.1 — setMyName / setMyShortDescription / setMyDescription (idempotente).
 * Foto de perfil: solo BotFather (/setuserpic) — ver REPORT.
 */
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { loadEnv } = require('./lib/n8n-http-helper');

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
        'SELECT data FROM credentials_entity WHERE name LIKE ? LIMIT 1',
      )
      .get('%Telegram Bot Inmobiliaria%');
    if (!row) return null;
    const input = Buffer.from(String(row.data), 'base64');
    const salt = input.slice(8, 16);
    const encrypted = input.slice(16);
    let keyIv = Buffer.alloc(0);
    let prev = Buffer.alloc(0);
    while (keyIv.length < 48) {
      prev = crypto
        .createHash('md5')
        .update(Buffer.concat([prev, Buffer.from(cfg.encryptionKey), salt]))
        .digest();
      keyIv = Buffer.concat([keyIv, prev]);
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      keyIv.slice(0, 32),
      keyIv.slice(32, 48),
    );
    const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed = JSON.parse(out.toString('utf8'));
    return parsed.accessToken || parsed.access_token || null;
  } finally {
    db.close();
  }
}

function api(token, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  loadEnv();
  let token = loadTokenFromN8n() || '';
  const fromEnv = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token && fromEnv && !/tu-token|changeme|placeholder/i.test(fromEnv)) {
    token = fromEnv;
  }
  if (!token) throw new Error('Sin token Telegram (n8n credencial o TELEGRAM_BOT_TOKEN)');

  const name = 'Matías · Nodo Propiedades';
  const shortDescription = 'Te ayudo a encontrar tu próxima propiedad en Mendoza';
  const description =
    'Soy Matías, del equipo de Nodo Propiedades. Te ayudo a buscar casas y departamentos en Mendoza, te paso fichas y coordino con el equipo cuando hace falta una visita.';

  const results = {};
  results.setMyName = await api(token, 'setMyName', { name });
  results.setMyShortDescription = await api(token, 'setMyShortDescription', {
    short_description: shortDescription,
  });
  results.setMyDescription = await api(token, 'setMyDescription', { description });

  console.log(
    JSON.stringify(
      {
        ok: true,
        name,
        shortDescription,
        description,
        results,
        fotoPerfil:
          'BotFather → /setuserpic → elegí el bot → subí una foto cuadrada (cara/logo).',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
