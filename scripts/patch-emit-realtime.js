/**
 * Añade nodo "Emit Panel Realtime" al Bot Telegram y SIMPLE-04.
 * Uso: node scripts/patch-emit-realtime.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

function loadApiKey() {
  const mcp = JSON.parse(
    fs.readFileSync(
      path.join(process.env.USERPROFILE, '.cursor/mcp.json'),
      'utf8',
    ),
  );
  for (const s of Object.values(mcp.mcpServers || {})) {
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  }
  throw new Error('Sin N8N_API_KEY');
}

const KEY = loadApiKey();

function request(method, urlPath, body) {
  const url = new URL(urlPath, 'http://localhost:5678');
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'X-N8N-API-KEY': KEY,
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `${method} ${urlPath} ${res.statusCode} ${JSON.stringify(json).slice(0, 600)}`,
              ),
            );
            return;
          }
          resolve(json);
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function makeEmitNode(kind) {
  const jsonBody =
    kind === 'telegram'
      ? `={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String(($('Parsear Respuesta').first().json.chat_id || $('Set Variables').first().json.chat_id || '')), mensajeCliente: String(($('Set Variables').first().json.texto_usuario || '')), respuestaBot: String(($('Parsear Respuesta').first().json.respuesta_bot || '')), source: 'telegram' } }) }}`
      : `={{ JSON.stringify({ type: 'leads.refresh', payload: { source: 'seguimiento' } }) }}`;

  return {
    id: 'emit-panel-realtime',
    name: 'Emit Panel Realtime',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [1792, 520],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'http://127.0.0.1:5678/webhook/panel-realtime-emit',
      sendBody: true,
      specifyBody: 'json',
      jsonBody,
      options: {
        timeout: 3000,
        response: { response: { neverError: true } },
      },
    },
  };
}

async function patchWorkflow(id, kind, fromNodeName) {
  const remote = await request('GET', `/api/v1/workflows/${id}`);
  const wf = remote.data || remote;
  if (
    wf.nodes.some(
      (n) => n.name === 'Emit Panel Realtime' || n.id === 'emit-panel-realtime',
    )
  ) {
    console.log(wf.name, 'ya tiene emit');
    return;
  }

  const emitNode = makeEmitNode(kind);
  const nodes = [...wf.nodes, emitNode];
  const connections = JSON.parse(JSON.stringify(wf.connections || {}));
  const from =
    fromNodeName ||
    (wf.nodes.find((n) => n.name === 'Parsear Respuesta') || {}).name;
  if (!from) {
    console.log('skip', wf.name, 'sin nodo origen');
    return;
  }
  if (!connections[from]) connections[from] = { main: [[]] };
  if (!connections[from].main) connections[from].main = [[]];
  if (!connections[from].main[0]) connections[from].main[0] = [];
  connections[from].main[0].push({
    node: 'Emit Panel Realtime',
    type: 'main',
    index: 0,
  });

  const settings = {};
  for (const k of [
    'executionOrder',
    'timezone',
    'saveManualExecutions',
    'callerPolicy',
    'errorWorkflow',
    'availableInMCP',
  ]) {
    if (wf.settings?.[k] !== undefined) settings[k] = wf.settings[k];
  }
  if (!settings.executionOrder) settings.executionOrder = 'v1';

  await request('PUT', `/api/v1/workflows/${id}`, {
    name: wf.name,
    nodes,
    connections,
    settings,
    staticData: wf.staticData ?? null,
  });
  try {
    await request('POST', `/api/v1/workflows/${id}/deactivate`);
  } catch (_) {}
  await request('POST', `/api/v1/workflows/${id}/activate`);
  console.log('patched+activated', wf.name);
}

async function main() {
  await patchWorkflow('8JoSfkcn3pE1f0av', 'telegram', 'Parsear Respuesta');
  await patchWorkflow('U7Ec6hIatY4t47Fu', 'seguimiento', 'Sync Leads_Bot');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
