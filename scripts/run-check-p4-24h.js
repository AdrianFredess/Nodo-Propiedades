/**
 * Copia de SIMPLE-04 con un lead de WhatsApp cuyo último mensaje del cliente
 * tiene más de 24 h. No toca la tesis.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const TESIS = 'pAoeaGKRj49HvgJq';
const NAME = 'CHECK P4 ventana 24h';
const HOOK = 'p4-ventana-24h';
const OUT = path.join(__dirname, '..', 'docs', 'validacion', 'p4-ventana-24h-2026-09-28.md');

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
          let json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (_) {
            json = { raw: buf.slice(0, 200) };
          }
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 240)));
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const hace = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const FIXTURE =
  'return [{ json: ' +
  JSON.stringify({
    chat_id: '5492610000099',
    nombre: 'Lead Ventana',
    zona: 'Godoy Cruz',
    canal_origen: 'whatsapp',
    estado_seguimiento: 'ninguno',
    ultima_actualizacion: hace(48),
    historial_json: JSON.stringify([
      { role: 'user', content: 'busco depto', ts: hace(48) },
      { role: 'assistant', content: 'te paso opciones', ts: hace(30) },
    ]),
  }) +
  ' }];';

(async () => {
  const key = apiKey();
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  const src = (list.data || []).find((w) => String(w.name).startsWith('SIMPLE-04'));
  if (!src) throw new Error('no esta SIMPLE-04');
  const prod = await request('GET', '/api/v1/workflows/' + src.id, key);
  if (!prod.nodes.some((n) => (n.parameters.jsCode || '').includes('requiere_plantilla'))) {
    throw new Error('SIMPLE-04 live sin la regla de 24h');
  }
  const wf = JSON.parse(JSON.stringify(prod));
  delete wf.id;
  delete wf.versionId;
  delete wf.meta;
  delete wf.active;
  wf.name = NAME;
  const read = wf.nodes.find((n) => n.name === 'Google Sheets - Read');
  read.type = 'n8n-nodes-base.code';
  read.typeVersion = 2;
  delete read.credentials;
  read.parameters = { jsCode: FIXTURE };
  for (const name of ['Schedule Trigger', 'Manual Trigger', 'Sheets Marcar Plantilla', 'Google Sheets - Update']) {
    const n = wf.nodes.find((x) => x.name === name);
    if (n) n.disabled = true;
  }
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.webhook') {
      n.disabled = true;
      n.webhookId = 'p4-off-' + n.name.replace(/\s+/g, '-');
      if (n.parameters) n.parameters.path = 'p4-off-' + n.name.replace(/\s+/g, '-');
    }
  }
  wf.nodes.push({
    id: 'wh-p4',
    name: 'Webhook P4',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 700],
    webhookId: HOOK,
    parameters: { httpMethod: 'POST', path: HOOK, responseMode: 'onReceived', options: {} },
  });
  wf.connections['Webhook P4'] = { main: [[{ node: 'Google Sheets - Read', type: 'main', index: 0 }]] };

  const old = (list.data || []).find((w) => w.name === NAME);
  if (old && (old.id === TESIS || old.id === src.id)) throw new Error('id protegido');
  if (old) await request('DELETE', '/api/v1/workflows/' + old.id, key);
  const created = await request('POST', '/api/v1/workflows', key, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1' },
  });
  await request('POST', '/api/v1/workflows/' + created.id + '/activate', key);
  const before = await request('GET', '/api/v1/executions?workflowId=' + created.id + '&limit=1', key);
  const prev = (before.data && before.data[0] && before.data[0].id) || 0;
  await request('POST', '/webhook/' + HOOK, key, {});
  let eid = '';
  for (let k = 0; k < 20; k++) {
    await sleep(500);
    const execs = await request('GET', '/api/v1/executions?workflowId=' + created.id + '&limit=3', key);
    const row = (execs.data || []).find((e) => Number(e.id) > Number(prev));
    if (row && (row.status === 'success' || row.status === 'error' || row.finished)) {
      eid = row.id;
      break;
    }
  }
  if (!eid) throw new Error('sin ejecucion');
  const full = await request('GET', '/api/v1/executions/' + eid + '?includeData=true', key);
  const run = full.data.resultData.runData || {};
  const filtro = run['Filtrar Candidatos'] && run['Filtrar Candidatos'][0];
  const item =
    (filtro && filtro.data && filtro.data.main && filtro.data.main[0] && filtro.data.main[0][0] && filtro.data.main[0][0].json) ||
    {};
  const aviso = run['Telegram Aviso Vendedor'] && run['Telegram Aviso Vendedor'][0];
  const graph = Boolean(run['Meta Enviar WhatsApp'] || run['Enviar WhatsApp']);
  await request('POST', '/api/v1/workflows/' + created.id + '/deactivate', key);
  const md = [
    '# P4 — WhatsApp fuera de 24 h',
    '',
    '- Copia `' + created.id + '`. SIMPLE-04 de producción no recibió el fixture.',
    '- Ejecución ' + eid + '.',
    '- Graph (`Meta Enviar WhatsApp`): **' + (graph ? 'corrió' : 'no corrió') + '**.',
    '- Telegram Aviso Vendedor: **' + (aviso ? aviso.executionStatus || 'corrió' : 'no') + '**.',
    '- estado_seguimiento: `' + item.estado_seguimiento + '`.',
    '- requiere_plantilla: `' + item.requiere_plantilla + '`.',
    '',
  ].join('\n');
  fs.writeFileSync(OUT, md);
  console.log(md);
  if (graph || item.estado_seguimiento !== 'requiere_plantilla' || !aviso) process.exit(1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
