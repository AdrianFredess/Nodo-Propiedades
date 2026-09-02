/**
 * Añade nodos Emit Panel Realtime + Emit Lead Updated a bots multicanal.
 *
 * Uso:
 *   node scripts/patch-channel-emit.js
 *   node scripts/patch-channel-emit.js --deploy
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const DEPLOY = process.argv.includes('--deploy');
const EMIT_URL = 'http://127.0.0.1:5678/webhook/panel-realtime-emit';

const TARGETS = [
  {
    file: 'SIMPLE-02 WhatsApp Bot.json',
    wfId: 'npq6sC6YLaUBpHac',
    source: 'whatsapp',
    normalizar: 'Code - Normalizar WhatsApp',
    procesar: 'Code - Procesar IA',
    respuestaField: 'respuesta_wa',
    afterNode: 'Google Sheets - Actualizar Temperatura',
  },
  {
    file: 'SIMPLE-03 Messenger Bot.json',
    wfId: 'XhceE1kxNalCTMw4',
    source: 'messenger',
    normalizar: 'Code - Normalizar Messenger',
    procesar: 'Code - Procesar IA',
    respuestaField: 'respuesta_messenger',
    afterNode: 'Google Sheets - Actualizar Temperatura',
  },
];

function emitChatBody(cfg) {
  const p = `$('${cfg.procesar}').first().json`;
  const n = `$('${cfg.normalizar}').item.json`;
  return `={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String((${p}.chat_id || '')), mensajeCliente: String((${n}.mensaje || ${p}.mensaje || '')), respuestaBot: String((${p}.${cfg.respuestaField} || '')), nombre: String((${p}.lead_name || '')), temperatura: String((${p}.temperatura || '')), presupuesto: String((${p}.presupuesto || '')), historial_json: String((${p}.historial_json || '[]')), status: String((${p}.status || 'abierto')), source: '${cfg.source}' } }) }}`;
}

function emitLeadBody(cfg) {
  const p = `$('${cfg.procesar}').first().json`;
  return `={{ JSON.stringify({ type: 'lead.updated', payload: { chatId: String((${p}.chat_id || '')), nombre: String((${p}.lead_name || '')), temperatura: String((${p}.temperatura || '')), presupuesto: String((${p}.presupuesto || '')), status: String((${p}.status || 'abierto')), lastMessage: String((${p}.${cfg.respuestaField} || '')), source: '${cfg.source}' } }) }}`;
}

function makeEmitNode(id, name, position, jsonBody) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: EMIT_URL,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: jsonBody,
      options: {
        timeout: 3000,
        response: { response: { neverError: true } },
      },
    },
  };
}

const LEGACY_EMIT_NODES = [
  'Emit Panel Realtime WA',
  'Emit Lead Updated WA',
];

function removeLegacyEmit(wf) {
  wf.nodes = wf.nodes.filter((n) => !LEGACY_EMIT_NODES.includes(n.name));
  for (const [from, conn] of Object.entries(wf.connections)) {
    if (!conn?.main) continue;
    conn.main = conn.main.map((branch) =>
      (branch || []).filter((c) => !LEGACY_EMIT_NODES.includes(c.node)),
    );
  }
}

function patchWorkflowEmit(wf, cfg) {
  removeLegacyEmit(wf);

  const chatId = `${cfg.source}-emit-chat`;
  const leadId = `${cfg.source}-emit-lead`;

  const chatNode = makeEmitNode(
    chatId,
    'Emit Panel Realtime',
    [2620, 520],
    emitChatBody(cfg),
  );
  const leadNode = makeEmitNode(
    leadId,
    'Emit Lead Updated',
    [2840, 520],
    emitLeadBody(cfg),
  );

  const chatIdx = wf.nodes.findIndex((n) => n.name === 'Emit Panel Realtime');
  if (chatIdx >= 0) wf.nodes[chatIdx] = { ...wf.nodes[chatIdx], ...chatNode };
  else wf.nodes.push(chatNode);

  const leadIdx = wf.nodes.findIndex((n) => n.name === 'Emit Lead Updated');
  if (leadIdx >= 0) wf.nodes[leadIdx] = { ...wf.nodes[leadIdx], ...leadNode };
  else wf.nodes.push(leadNode);

  const after = cfg.afterNode;
  const existing = wf.connections[after]?.main?.[0] || [];
  const withoutEmit = existing.filter(
    (c) => c.node !== 'Emit Panel Realtime' && c.node !== 'Emit Lead Updated',
  );
  withoutEmit.push({ node: 'Emit Panel Realtime', type: 'main', index: 0 });
  withoutEmit.push({ node: 'Emit Lead Updated', type: 'main', index: 0 });
  wf.connections[after] = { main: [withoutEmit] };

  wf.connections['Emit Panel Realtime'] = { main: [[]] };
  wf.connections['Emit Lead Updated'] = { main: [[]] };

  return wf;
}

function putSettings(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: s.executionOrder || 'v1',
      ...(s.timezone ? { timezone: s.timezone } : {}),
      ...(s.saveManualExecutions != null
        ? { saveManualExecutions: s.saveManualExecutions }
        : {}),
      ...(s.callerPolicy ? { callerPolicy: s.callerPolicy } : {}),
    },
  };
}

function loadApiKey() {
  try {
    const mcp = JSON.parse(
      fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'),
    );
    for (const s of Object.values(mcp.mcpServers || {})) {
      if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
    }
  } catch (_) {}
  return process.env.N8N_API_KEY || '';
}

function request(method, urlPath, body, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: {
          'X-N8N-API-KEY': apiKey,
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
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            reject(new Error(data.slice(0, 400)));
            return;
          }
          if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode} ${JSON.stringify(json).slice(0, 400)}`));
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

async function deploy(wfId, wf) {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.log('  SKIP deploy', wfId, '(sin N8N_API_KEY)');
    return false;
  }
  try {
    await request('PUT', `/api/v1/workflows/${wfId}`, putSettings(wf), apiKey);
    await request('POST', `/api/v1/workflows/${wfId}/deactivate`, null, apiKey);
    await request('POST', `/api/v1/workflows/${wfId}/activate`, null, apiKey);
    return true;
  } catch (e) {
    console.log('  SKIP deploy', wfId, e.message);
    return false;
  }
}

async function main() {
  console.log('→ Parche emit WebSocket (WA + Messenger)');
  for (const cfg of TARGETS) {
    const wfPath = path.join(ROOT, 'workflows', cfg.file);
    const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
    patchWorkflowEmit(wf, cfg);
    fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + '\n', 'utf8');
    console.log('  OK', cfg.file);
    if (DEPLOY) {
      const ok = await deploy(cfg.wfId, wf);
      if (ok) console.log('  deploy', cfg.wfId);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
