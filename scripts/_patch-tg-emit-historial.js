/**
 * Enriquecer Emit Panel Realtime / Emit Lead Updated con historial_json
 * para que el CRM pueda sincronizar sin Sheets cuando OAuth está caído.
 * Uso: node scripts/_patch-tg-emit-historial.js
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

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
const WF_ID = '8JoSfkcn3pE1f0av';

const EMIT_CHAT_BODY = `={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String(($('Parsear Respuesta').first().json.chat_id || $('Set Variables').first().json.chat_id || '')), mensajeCliente: String(($('Set Variables').first().json.texto_usuario || '')), respuestaBot: String(($('Parsear Respuesta').first().json.respuesta_bot || '')), nombre: String(($('Parsear Respuesta').first().json.nombre || $('Set Variables').first().json.nombre_usuario || '')), temperatura: String(($('Parsear Respuesta').first().json.temperatura || '')), presupuesto: String(($('Parsear Respuesta').first().json.presupuesto || '')), historial_json: String(($('Parsear Respuesta').first().json.historial_json || '[]')), status: 'abierto', source: 'telegram' } }) }}`;

const EMIT_LEAD_BODY = `={{ JSON.stringify({ type: 'lead.updated', payload: { chatId: String(($('Parsear Respuesta').first().json.chat_id || $json.chat_id || '')), nombre: String(($('Parsear Respuesta').first().json.nombre || '')), temperatura: String(($('Parsear Respuesta').first().json.temperatura || $json.temperatura || '')), presupuesto: String(($('Parsear Respuesta').first().json.presupuesto || '')), status: 'abierto', lastMessage: String(($('Parsear Respuesta').first().json.respuesta_bot || '')), source: 'telegram-sync' } }) }}`;

function request(method, urlPath, body) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
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
  const emitChat = wf.nodes.find(
    (n) => n.id === 'emit-panel-realtime' || n.name === 'Emit Panel Realtime',
  );
  const emitLead = wf.nodes.find(
    (n) => n.id === 'emit-lead-updated' || n.name === 'Emit Lead Updated',
  );
  if (!emitChat || !emitLead) throw new Error('Faltan nodos Emit');

  emitChat.parameters.jsonBody = EMIT_CHAT_BODY;
  emitLead.parameters.jsonBody = EMIT_LEAD_BODY;

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

  await request('PUT', `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings,
    staticData: wf.staticData ?? null,
  });
  try {
    await request('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  } catch (_) {
    /* ok */
  }
  await request('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('OK: emit enriquecido + workflow activo');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
