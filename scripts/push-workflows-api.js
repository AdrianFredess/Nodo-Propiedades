/**
 * Push workflows locales a n8n (API key desde env o mcp.json).
 * Uso: node scripts/push-workflows-api.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = 'D:/Dev/Nodo-Propiedades';
const API_URL = process.env.N8N_API_URL || 'http://localhost:5678';

function loadApiKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  const mcp = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor/mcp.json'), 'utf8'),
  );
  const n8n = (mcp.mcpServers || {})['n8n'] || (mcp.mcpServers || {})['user-n8n'];
  const env = n8n?.env || {};
  if (!env.N8N_API_KEY) throw new Error('Sin N8N_API_KEY');
  return env.N8N_API_KEY;
}

function request(method, urlPath, body) {
  const url = new URL(urlPath, API_URL);
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'X-N8N-API-KEY': loadApiKey(),
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
                `${method} ${urlPath} → ${res.statusCode}: ${JSON.stringify(json).slice(0, 400)}`,
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

function mergeCredentials(localNodes, remoteNodes) {
  const byId = new Map((remoteNodes || []).map((n) => [n.id, n]));
  const byName = new Map((remoteNodes || []).map((n) => [n.name, n]));
  return (localNodes || []).map((node) => {
    const remote = byId.get(node.id) || byName.get(node.name);
    if (!remote?.credentials) return node;
    const creds = JSON.stringify(node.credentials || {});
    if (/__SET_/.test(creds) || !node.credentials) {
      return { ...node, credentials: remote.credentials };
    }
    return node;
  });
}

async function pushWorkflow(fileRel, id) {
  const local = JSON.parse(fs.readFileSync(path.join(ROOT, fileRel), 'utf8'));
  const remote = await request('GET', `/api/v1/workflows/${id}`);
  const current = remote.data || remote;
  const allowedSettings = [
    'executionOrder',
    'timezone',
    'saveManualExecutions',
    'callerPolicy',
    'errorWorkflow',
    'availableInMCP',
  ];
  const srcSettings = local.settings || current.settings || {};
  const settings = {};
  for (const k of allowedSettings) {
    if (srcSettings[k] !== undefined) settings[k] = srcSettings[k];
  }
  if (!settings.executionOrder) settings.executionOrder = 'v1';
  const nodes = mergeCredentials(local.nodes, current.nodes);
  const body = {
    name: local.name || current.name,
    nodes,
    connections: local.connections,
    settings,
    staticData: current.staticData ?? null,
  };
  const updated = await request('PUT', `/api/v1/workflows/${id}`, body);
  console.log(
    'OK',
    local.name,
    'nodes',
    (updated.data || updated).nodes?.length || nodes.length,
  );
}

async function main() {
  await pushWorkflow('workflows/PANEL-01 API Leads.json', 'TfGR4Uhq2TnSBFLw');
  await pushWorkflow(
    'workflows/Bot Telegram Inmobiliaria.json',
    '8JoSfkcn3pE1f0av',
  );
  // Reactivar bot para registrar trigger
  try {
    await request('POST', `/api/v1/workflows/8JoSfkcn3pE1f0av/deactivate`);
  } catch (_) {}
  await request('POST', `/api/v1/workflows/8JoSfkcn3pE1f0av/activate`);
  console.log('Bot reactivado');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
