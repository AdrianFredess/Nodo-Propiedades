/**
 * Importa el workflow de 3f132c3 como copia inactiva "TESIS-3f132c3 Clasificacion".
 * No modifica el workflow de producción.
 */
const crypto = require('crypto');
const http = require('http');
const { execFileSync } = require('child_process');

const COMMIT = '3f132c3';
const NAME = 'TESIS-3f132c3 Clasificacion';
const PATH_WH = 'tesis-3f132c3-clasificacion';
const PROD_ID = '8JoSfkcn3pE1f0av';

const DISABLE = new Set([
  'Telegram Responder',
  'Email Lead Caliente',
  'Telegram Alerta Owner',
  'Emit Panel Realtime',
  'Emit Lead Updated',
  // Escritura a Sheets: no hay copia de Drive desde este entorno.
  // Deshabilitarlas garantiza 0 escrituras en el spreadsheet de producción.
  'Guardar Lead',
  'Actualizar Historial',
  'Sync Leads_Bot',
  'Registrar Consulta Telegram',
]);

function apiKey() {
  const code = [
    'import sqlite3',
    'c=sqlite3.connect(r"file:C:/Users/adrian/.n8n/database.sqlite?mode=ro", uri=True)',
    'row=c.execute("SELECT apiKey FROM user_api_keys WHERE label=?", ("n8n",)).fetchone()',
    'print(row[0] if row else "")',
  ].join('; ');
  return execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
}

function request(method, urlPath, key, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: {
          'X-N8N-API-KEY': key,
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (_) {
            json = { raw: buf.slice(0, 500) };
          }
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 500)));
            return;
          }
          resolve(json);
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function sha(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function hashes(wf) {
  const by = (name) => wf.nodes.find((n) => n.name === name);
  return {
    construir_prompt: sha(by('Construir Prompt')?.parameters?.jsCode),
    parsear_respuesta: sha(by('Parsear Respuesta')?.parameters?.jsCode),
    http_groq_body: sha(by('HTTP Groq')?.parameters?.jsonBody),
  };
}

function loadCommitWf() {
  const s = execFileSync('git', ['show', COMMIT + ':workflows/Bot Telegram Inmobiliaria.json'], {
    encoding: 'utf8',
    maxBuffer: 80e6,
  });
  return JSON.parse(s);
}

async function main() {
  const key = apiKey();
  const src = loadCommitWf();
  const baseHashes = hashes(src);

  const prod = await request('GET', '/api/v1/workflows/' + PROD_ID, key);
  const prodSheet = (prod.nodes || []).find((n) => n.name === 'Leer Stock Propiedades');
  const sheetCred = prodSheet?.credentials?.googleSheetsOAuth2Api;
  if (!sheetCred?.id || String(sheetCred.id).includes('__SET_')) {
    throw new Error('No hay credencial real de Sheets en producción');
  }

  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  const existing = (list.data || []).find((w) => w.name === NAME);
  if (existing) {
    console.log('EXISTS', existing.id, 'active', existing.active);
    console.log('HASHES_COMMIT', JSON.stringify(baseHashes));
    process.exit(0);
  }

  const trigger = src.nodes.find((n) => n.name === 'Telegram Trigger');
  const webhook = {
    id: trigger.id,
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: trigger.position,
    webhookId: crypto.randomUUID(),
    parameters: {
      httpMethod: 'POST',
      path: PATH_WH,
      responseMode: 'onReceived',
      options: {},
    },
  };
  const unwrap = {
    id: 'tesis-normalizar-update',
    name: 'Normalizar Update Telegram',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [trigger.position[0] + 200, trigger.position[1]],
    parameters: {
      jsCode:
        "const b = ($json && $json.body && $json.body.message) ? $json.body : $json;\nreturn [{ json: b }];",
    },
  };

  src.nodes = src.nodes.filter((n) => n.name !== 'Telegram Trigger');
  src.nodes.push(webhook, unwrap);

  for (const n of src.nodes) {
    if (n.credentials?.googleSheetsOAuth2Api) {
      n.credentials.googleSheetsOAuth2Api = {
        id: sheetCred.id,
        name: sheetCred.name || 'Cuenta de Google Sheets',
      };
    }
    if (DISABLE.has(n.name)) n.disabled = true;
  }

  const conns = src.connections;
  delete conns['Telegram Trigger'];
  conns['Webhook'] = {
    main: [[{ node: 'Normalizar Update Telegram', type: 'main', index: 0 }]],
  };
  conns['Normalizar Update Telegram'] = {
    main: [[{ node: 'Set Variables', type: 'main', index: 0 }]],
  };

  const payload = {
    name: NAME,
    nodes: src.nodes,
    connections: conns,
    settings: {
      executionOrder: (src.settings && src.settings.executionOrder) || 'v1',
    },
  };

  const created = await request('POST', '/api/v1/workflows', key, payload);
  const id = created.id;
  const fetched = await request('GET', '/api/v1/workflows/' + id, key);
  const copyHashes = hashes(fetched);
  const same =
    copyHashes.construir_prompt === baseHashes.construir_prompt &&
    copyHashes.parsear_respuesta === baseHashes.parsear_respuesta &&
    copyHashes.http_groq_body === baseHashes.http_groq_body;

  console.log(JSON.stringify({ id, same, baseHashes, copyHashes, disabled: [...DISABLE] }, null, 2));
  if (!same) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
