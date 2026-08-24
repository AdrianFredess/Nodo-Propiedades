/**
 * Actualiza Emit Panel Realtime del Bot Telegram para incluir textos.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

function loadApiKey() {
  const mcp = JSON.parse(
    fs.readFileSync(
      path.join(process.env.USERPROFILE, '.cursor', 'mcp.json'),
      'utf8',
    ),
  );
  for (const s of Object.values(mcp.mcpServers || {})) {
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  }
  throw new Error('Sin N8N_API_KEY');
}

const KEY = loadApiKey();
const WF_ID = '8JoSfkcn3pE1f0av';

const NEW_BODY = `={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String(($('Parsear Respuesta').first().json.chat_id || $('Set Variables').first().json.chat_id || '')), mensajeCliente: String(($('Set Variables').first().json.texto_usuario || '')), respuestaBot: String(($('Parsear Respuesta').first().json.respuesta_bot || '')), source: 'telegram' } }) }}`;

function request(method, urlPath, body) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
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

async function main() {
  const remote = await request('GET', `/api/v1/workflows/${WF_ID}`);
  const wf = remote.data || remote;
  const emit = wf.nodes.find((n) => n.name === 'Emit Panel Realtime');
  if (!emit) {
    console.log('sin emit node');
    return;
  }
  emit.parameters.jsonBody = NEW_BODY;

  const settings = {};
  for (const key of [
    'executionOrder',
    'timezone',
    'saveManualExecutions',
    'callerPolicy',
    'errorWorkflow',
    'availableInMCP',
  ]) {
    if (wf.settings?.[key] !== undefined) settings[key] = wf.settings[key];
  }
  if (!settings.executionOrder) settings.executionOrder = 'v1';

  await request('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings,
    staticData: wf.staticData ?? null,
  });
  try {
    await request('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  } catch {
    /* ignore */
  }
  await request('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('Bot emit actualizado con textos');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
