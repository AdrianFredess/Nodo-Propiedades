/**
 * Copia del bot de Telegram con Leer Stock roto a propósito.
 * No toca la copia de tesis ni las credenciales de producción.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const PROD = '8JoSfkcn3pE1f0av';
const TESIS = 'pAoeaGKRj49HvgJq';
const NAME = 'CHECK P1 sheets fail-closed';
const HOOK = 'p1-sheets-fail-closed';
const OUT = path.join(
  __dirname,
  '..',
  'docs',
  'validacion',
  'p1-sheets-fail-closed-2026-09-28.md',
);

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
  };
}

(async () => {
  const key = apiKey();
  const prod = (await request('GET', '/api/v1/workflows/' + PROD, key)).json;
  if (!prod.nodes.some((n) => (n.parameters.jsCode || '').includes('function leerFilasSheets'))) {
    throw new Error('Produccion no tiene fail-closed. Correr patch-sheets-fail-closed.js --live primero.');
  }
  const list = (await request('GET', '/api/v1/workflows?limit=100', key)).json;
  const rows = list.data || [];
  let existing = rows.find((w) => w.name === NAME);
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
  stock.parameters = {
    jsCode:
      "return [{ json: { error: 'invalid_grant: The provided authorization grant is invalid' } }];",
  };
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
  if (!wf.nodes.some((n) => n.name === 'Webhook P1')) {
    wf.nodes.push({
      id: 'wh-p1-sheets',
      name: 'Webhook P1',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 800],
      webhookId: 'p1-sheets-fail-closed',
      parameters: { httpMethod: 'POST', path: HOOK, responseMode: 'onReceived', options: {} },
    });
    wf.nodes.push({
      id: 'norm-p1-sheets',
      name: 'Normalizar P1',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [420, 800],
      parameters: {
        jsCode: 'const b = $json.body || $json; return [{ json: b }];',
      },
    });
  }
  wf.connections['Webhook P1'] = { main: [[{ node: 'Normalizar P1', type: 'main', index: 0 }]] };
  wf.connections['Normalizar P1'] = { main: [[{ node: 'Set Variables', type: 'main', index: 0 }]] };

  let id = existing && existing.id;
  if (id === TESIS || id === PROD) throw new Error('id protegido ' + id);
  if (id) {
    await request('DELETE', '/api/v1/workflows/' + id, key);
    id = '';
  }
  const created = (await request('POST', '/api/v1/workflows', key, putBody(wf))).json;
  id = created.id;
  await request('POST', '/api/v1/workflows/' + id + '/activate', key);

  const textos = [
    'Hola, el depto de Godoy Cruz de 2 amb a cuanto esta?',
    'Pasame precio y ficha de MZA-001',
    'Cuanto sale la casa de Chacras?',
  ];
  async function latestExecId() {
    const execs = (await request('GET', '/api/v1/executions?workflowId=' + id + '&limit=1', key)).json;
    return (execs.data && execs.data[0] && execs.data[0].id) || '';
  }
  for (let i = 0; i < textos.length; i++) {
    const before = await latestExecId();
    await request('POST', '/webhook/' + HOOK, key, {
      message: {
        chat: { id: 891100001 },
        from: { first_name: 'Check' },
        text: textos[i],
      },
    });
    let eid = '';
    for (let k = 0; k < 20; k++) {
      await sleep(500);
      const execs = (await request('GET', '/api/v1/executions?workflowId=' + id + '&limit=3', key)).json;
      const row = (execs.data || []).find((e) => Number(e.id) > Number(before || 0));
      if (row && (row.status === 'success' || row.status === 'error' || row.finished)) {
        eid = row.id;
        break;
      }
    }
    if (!eid) throw new Error('sin ejecucion para mensaje ' + (i + 1));
  }
  const execs = (await request('GET', '/api/v1/executions?workflowId=' + id + '&limit=10', key)).json;
  const ids = (execs.data || []).map((e) => e.id).slice(0, 3);
  const lines = [];
  let alertas = 0;
  let revisiones = 0;
  for (const eid of ids.reverse()) {
    const full = (await request('GET', '/api/v1/executions/' + eid + '?includeData=true', key)).json;
    const run = full.data.resultData.runData || {};
    const parse = run['Parsear Respuesta']?.[0]?.data?.main?.[0]?.[0]?.json || {};
    const revNode = run['Google Sheets - Conversaciones_Revision TG']?.[0];
    const rev = run['Code - Preparar Registro Revision TG']?.[0]?.data?.main?.[0]?.[0]?.json || {};
    const alerta = run['Telegram Alerta Owner']?.[0];
    if (alerta && !alerta.error && alerta.executionStatus !== 'error') alertas += 1;
    if (revNode) revisiones += 1;
    const revErr = revNode && revNode.error ? String(revNode.error.message || '').slice(0, 80) : '';
    const resp = String(parse.respuesta_bot || '');
    const props = String(parse.propiedades_mostrar || '');
    const precio = /USD|\$\s*\d|\b\d{4,}\b|MZA-\d/i.test(resp + ' ' + props);
    lines.push(
      [
        eid,
        'respuesta=' + JSON.stringify(resp),
        'props=' + props,
        'sheets_error=' + parse.sheets_error,
        'aviso=' + parse.aviso_vendedor,
        'motivo=' + parse.derivacion_motivo,
        'revision=' + rev.motivo,
        'sheets_write=' + (revErr || (revNode ? revNode.executionStatus || 'ran' : 'no')),
        'precio_o_ficha=' + precio,
        'alerta_nodo=' + (alerta ? alerta.executionStatus || 'ran' : 'no'),
      ].join(' | '),
    );
  }
  await request('POST', '/api/v1/workflows/' + id + '/deactivate', key);

  const md = [
    '# P1 — Sheets fail-closed',
    '',
    '- Copia: `' + id + '` (`' + NAME + '`). Producción `' + PROD + '` no se usó como destino del mensaje.',
    '- `Leer Stock Propiedades` de la copia devuelve `invalid_grant` (nodo Code, credencial de Sheets no se llama).',
    '- 3 mensajes en menos de 10 minutos.',
    '- Alertas de Telegram Alerta Owner que corrieron: **' + alertas + '**.',
    '- Nodo de revisión presente en ejecuciones: **' + revisiones + '**.',
    '',
    '## Filas',
    '',
    ...lines.map((l) => '- ' + l),
    '',
  ].join('\n');
  fs.writeFileSync(OUT, md);
  console.log(md);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
