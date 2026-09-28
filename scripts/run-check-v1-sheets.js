/**
 * V1: 3 chats con Sheets roto, una alerta con los 3, y al volver no quedan pausados.
 * Copia del bot de Telegram. No toca la tesis ni la producción como destino del mensaje.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const PROD = '8JoSfkcn3pE1f0av';
const TESIS = 'pAoeaGKRj49HvgJq';
const NAME = 'CHECK V1 sheets no pausa';
const HOOK = 'v1-sheets-no-pausa';
const OUT = path.join(__dirname, '..', 'docs', 'validacion', 'v1-sheets-no-pausa-2026-09-28.md');
const CHATS = [
  { id: 891310001, nombre: 'Ana', texto: 'hola soy ana' },
  { id: 891310002, nombre: 'Luis', texto: 'hola soy luis' },
  { id: 891310003, nombre: 'Mia', texto: 'hola soy mia' },
];

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
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
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
            json = { raw: buf.slice(0, 300) };
          }
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 300)));
            return;
          }
          resolve({ status: res.statusCode, json });
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

function putBody(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: s.executionOrder || 'v1' },
    staticData: wf.staticData || undefined,
  };
}

function stockRoto() {
  return "return [{ json: { error: 'invalid_grant: The provided authorization grant is invalid' } }];";
}

function stockOk() {
  return (
    "return [{ json: { id: 'MZA-001', tipo: 'departamento', zona: 'Godoy Cruz', precio: 'USD 85000', operacion: 'venta', dormitorios: '2', estado: 'disponible' } }];"
  );
}

(async () => {
  const key = apiKey();
  const prod = (await request('GET', '/api/v1/workflows/' + PROD, key)).json;
  const prompt = prod.nodes.find((n) => n.name === 'Construir Prompt');
  if (!prompt || !String(prompt.parameters.jsCode).includes('function debeAlertarRafagaSheets')) {
    throw new Error('Produccion no tiene V1. Correr patch-v1-sheets-espera.js --live primero.');
  }
  const list = (await request('GET', '/api/v1/workflows?limit=100', key)).json;
  let existing = (list.data || []).find((w) => w.name === NAME);
  const wf = JSON.parse(JSON.stringify(prod));
  delete wf.id;
  delete wf.versionId;
  delete wf.meta;
  delete wf.active;
  wf.name = NAME;
  wf.staticData = { global: {} };
  const stock = wf.nodes.find((n) => n.name === 'Leer Stock Propiedades');
  stock.type = 'n8n-nodes-base.code';
  stock.typeVersion = 2;
  delete stock.credentials;
  stock.parameters = { jsCode: stockRoto() };
  const audio = wf.nodes.find((n) => n.name === 'Transcribir Audio TG');
  if (audio) {
    audio.type = 'n8n-nodes-base.code';
    audio.typeVersion = 2;
    delete audio.credentials;
    audio.parameters = {
      jsCode:
        "const j = $input.first().json || {};\nreturn [{ json: { ...j, texto_usuario: String(j.texto_usuario || ''), transcripcion: '' } }];",
    };
  }
  const trig = wf.nodes.find((n) => n.name === 'Telegram Trigger');
  if (trig) trig.disabled = true;
  for (const name of [
    'Guardar Lead',
    'Actualizar Historial',
    'Sync Leads_Bot',
    'Registrar Consulta Telegram',
    'Email Lead Caliente',
    'Email Solicitud Visita',
    'Emit Panel Realtime',
    'Emit Lead Updated',
    'Telegram Responder',
  ]) {
    const n = wf.nodes.find((x) => x.name === name);
    if (n) n.disabled = true;
  }
  if (!wf.nodes.some((n) => n.name === 'Webhook V1')) {
    wf.nodes.push({
      id: 'wh-v1-sheets',
      name: 'Webhook V1',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 900],
      webhookId: HOOK,
      parameters: { httpMethod: 'POST', path: HOOK, responseMode: 'onReceived', options: {} },
    });
    wf.nodes.push({
      id: 'norm-v1-sheets',
      name: 'Normalizar V1',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [420, 900],
      parameters: { jsCode: 'const b = $json.body || $json; return [{ json: b }];' },
    });
  }
  wf.connections['Webhook V1'] = { main: [[{ node: 'Normalizar V1', type: 'main', index: 0 }]] };
  wf.connections['Normalizar V1'] = { main: [[{ node: 'Set Variables', type: 'main', index: 0 }]] };

  let id = existing && existing.id;
  if (id === TESIS || id === PROD) throw new Error('id protegido ' + id);
  if (id) {
    await request('DELETE', '/api/v1/workflows/' + id, key);
    id = '';
  }
  const created = (await request('POST', '/api/v1/workflows', key, putBody(wf))).json;
  id = created.id;
  await request('POST', '/api/v1/workflows/' + id + '/activate', key);

  async function latestExecId() {
    const execs = (await request('GET', '/api/v1/executions?workflowId=' + id + '&limit=1', key)).json;
    return (execs.data && execs.data[0] && execs.data[0].id) || '';
  }
  async function postChat(chat, texto) {
    const before = await latestExecId();
    await request('POST', '/webhook/' + HOOK, key, {
      message: { chat: { id: chat.id }, from: { first_name: chat.nombre }, text: texto },
    });
    for (let k = 0; k < 80; k++) {
      await sleep(500);
      const execs = (await request('GET', '/api/v1/executions?workflowId=' + id + '&limit=5', key)).json;
      const row = (execs.data || []).find((e) => Number(e.id) > Number(before || 0));
      if (row && (row.status === 'success' || row.status === 'error' || row.finished)) return row.id;
    }
    throw new Error('sin ejecucion para ' + chat.id);
  }

  const ids = [];
  for (const chat of CHATS) ids.push(await postChat(chat, chat.texto));
  await sleep(21000);
  ids.push(await postChat(CHATS[0], 'sigo esperando'));

  const live = (await request('GET', '/api/v1/workflows/' + id, key)).json;
  const stockNode = live.nodes.find((n) => n.name === 'Leer Stock Propiedades');
  stockNode.parameters.jsCode = stockOk();
  await request('PUT', '/api/v1/workflows/' + id, key, putBody(live));
  await request('POST', '/api/v1/workflows/' + id + '/activate', key);
  const idOk = await postChat(CHATS[0], 'hola de nuevo, que tenes en godoy cruz');
  ids.push(idOk);

  const lines = [];
  const avisos = [];
  for (const eid of ids) {
    const full = (await request('GET', '/api/v1/executions/' + eid + '?includeData=true', key)).json;
    const run = (full.data && full.data.resultData && full.data.resultData.runData) || {};
    const parse = (run['Parsear Respuesta'] && run['Parsear Respuesta'][0] && run['Parsear Respuesta'][0].data.main[0][0].json) || {};
    const resp = String(parse.respuesta_bot || '');
    const aviso = String(parse.aviso_vendedor_texto || '');
    if (parse.aviso_vendedor) avisos.push(aviso);
    lines.push(
      [
        eid,
        'chat=' + parse.chat_id,
        'respuesta=' + JSON.stringify(resp.slice(0, 140)),
        'paused=' + parse.bot_paused,
        'sheets_error=' + parse.sheets_error,
        'aviso=' + parse.aviso_vendedor,
        'motivo=' + parse.derivacion_motivo,
        'aviso_txt=' + JSON.stringify(aviso.slice(0, 400)),
      ].join(' | '),
    );
  }
  await request('POST', '/api/v1/workflows/' + id + '/deactivate', key);

  const alertaRota = avisos.filter((t) => t.includes('891310001') && t.includes('891310002') && t.includes('891310003') && t.includes('Sheets caído'));
  const alertaOk = avisos.filter((t) => t.includes('Sheets volvió') && t.includes('891310001') && t.includes('891310002') && t.includes('891310003'));
  const ultima = lines[lines.length - 1] || '';
  const normal = ultima.includes('paused=no') && ultima.includes('sheets_error=false') && !ultima.includes('Dame un rato que chequeo');
  const md = [
    '# V1 — Sheets no deja el chat pausado',
    '',
    '- Copia: `' + id + '`. Producción `' + PROD + '` no recibió estos mensajes.',
    '- 3 chats con la lectura rota, espera de 21s y un mensaje de cierre para disparar la alerta de la ráfaga (20s).',
    '- Alertas cuyo texto lista los 3 chats: **' + alertaRota.length + '**.',
    '- Aviso de recuperación con los 3 chats: **' + alertaOk.length + '**.',
    '- El mensaje siguiente, con Sheets bien, no queda pausado ni usa el texto de Sheets caído: **' + (normal ? 'sí' : 'no') + '**.',
    '',
    '## Filas',
    '',
    ...lines.map((l) => '- ' + l),
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md);
  console.log(md);
  if (alertaRota.length !== 1 || alertaOk.length !== 1 || !normal) process.exit(1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
