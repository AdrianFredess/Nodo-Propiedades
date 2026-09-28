/**
 * WhatsApp fuera de 24 h: no envía, marca requiere_plantilla y avisa al vendedor.
 * node scripts/patch-seguimiento-24h.js [--live]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const FILE = path.join(__dirname, '..', 'workflows', 'SIMPLE-04 Seguimiento Automatico.json');
const CODE = fs.readFileSync(path.join(__dirname, 'snippets', 'filtrar-candidatos.js'), 'utf8');

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
        timeout: 120000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 240)));
            return;
          }
          resolve(buf ? JSON.parse(buf) : null);
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function aplicar(wf) {
  const filtro = wf.nodes.find((n) => n.name === 'Filtrar Candidatos');
  if (!filtro) throw new Error('sin Filtrar Candidatos');
  filtro.parameters.jsCode = CODE;

  const tg = wf.nodes.find((n) => n.name === 'Enviar Telegram');
  const sheets = wf.nodes.find((n) => n.name === 'Google Sheets - Update');
  if (!wf.nodes.some((n) => n.name === 'IF Fuera Ventana')) {
    wf.nodes.push({
      id: 's04-fuera-ventana',
      name: 'IF Fuera Ventana',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [780, 480],
      parameters: {
        conditions: {
          combinator: 'and',
          options: { version: 2, typeValidation: 'loose' },
          conditions: [
            {
              id: 'fuera',
              leftValue: '={{ Boolean($json.requiere_plantilla) }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'equals' },
            },
          ],
        },
      },
    });
  }
  if (!wf.nodes.some((n) => n.name === 'Telegram Aviso Vendedor')) {
    wf.nodes.push({
      id: 's04-aviso-vendedor',
      name: 'Telegram Aviso Vendedor',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [1040, 560],
      parameters: {
        operation: 'sendMessage',
        chatId: '={{ $env.OWNER_TELEGRAM_CHAT_ID }}',
        text: '={{ $json.aviso_vendedor }}',
        additionalFields: {},
      },
      credentials: tg && tg.credentials ? JSON.parse(JSON.stringify(tg.credentials)) : undefined,
      onError: 'continueRegularOutput',
    });
  }
  if (!wf.nodes.some((n) => n.name === 'Sheets Marcar Plantilla')) {
    const base = sheets ? JSON.parse(JSON.stringify(sheets.parameters)) : {};
    wf.nodes.push({
      id: 's04-marcar-plantilla',
      name: 'Sheets Marcar Plantilla',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1300, 560],
      parameters: {
        operation: 'update',
        documentId: base.documentId,
        sheetName: base.sheetName,
        columns: {
          mappingMode: 'defineBelow',
          matchingColumns: ['chat_id'],
          value: {
            chat_id: '={{ $json.chat_id }}',
            estado_seguimiento: 'requiere_plantilla',
          },
        },
        options: {},
      },
      credentials: sheets && sheets.credentials ? JSON.parse(JSON.stringify(sheets.credentials)) : undefined,
      onError: 'continueRegularOutput',
    });
  }

  wf.connections['Filtrar Candidatos'] = {
    main: [[{ node: 'IF Fuera Ventana', type: 'main', index: 0 }]],
  };
  wf.connections['IF Fuera Ventana'] = {
    main: [
      [{ node: 'Telegram Aviso Vendedor', type: 'main', index: 0 }],
      [{ node: 'IF Hay Candidatos', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Telegram Aviso Vendedor'] = {
    main: [[{ node: 'Sheets Marcar Plantilla', type: 'main', index: 0 }]],
  };
  return wf;
}

(async () => {
  const wf = aplicar(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
  console.log('json ok');
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  const row = (list.data || []).find((w) => w.name === 'SIMPLE-04 Seguimiento Automático' || w.name === wf.name);
  if (!row) throw new Error('no esta SIMPLE-04 en n8n');
  const live = await request('GET', '/api/v1/workflows/' + row.id, key);
  const patched = aplicar(live);
  await request('PUT', '/api/v1/workflows/' + row.id, key, {
    name: patched.name,
    nodes: patched.nodes,
    connections: patched.connections,
    settings: { executionOrder: (patched.settings && patched.settings.executionOrder) || 'v1' },
  });
  console.log('live', row.id);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
