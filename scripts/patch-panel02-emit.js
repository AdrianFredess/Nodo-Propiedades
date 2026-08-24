/**
 * Patch PANEL-02: include text in Mapear + emit chat.message to ws-bridge.
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
const WF_ID = 'ZhesATaZTLCLjscv';

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

  if (wf.nodes.some((n) => n.name === 'Emit Chat Realtime')) {
    console.log('PANEL-02 ya tiene Emit Chat Realtime');
    return;
  }

  const map = wf.nodes.find((n) => n.name === 'Mapear Resultado');
  if (map?.parameters?.jsCode) {
    map.parameters.jsCode = map.parameters.jsCode.replace(
      'chat_id: prep.chat_id, ok,',
      'chat_id: prep.chat_id, text: prep.text, ok,',
    );
  }

  wf.nodes.push(
    {
      id: 'panel02-emit-if',
      name: 'IF Emit OK',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1160, 420],
      parameters: {
        conditions: {
          combinator: 'and',
          conditions: [
            {
              id: 'ok1',
              leftValue: '={{ $json.ok }}',
              rightValue: true,
              operator: {
                type: 'boolean',
                operation: 'true',
                singleValue: true,
              },
            },
          ],
        },
      },
    },
    {
      id: 'panel02-emit',
      name: 'Emit Chat Realtime',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1400, 420],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: 'http://host.docker.internal:3099/emit',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ JSON.stringify({ type: 'chat.message', payload: { chatId: String($json.chat_id || ''), text: String($json.text || ''), side: 'bot', source: 'panel' } }) }}",
        options: {
          timeout: 3000,
          response: { response: { neverError: true } },
        },
      },
    },
  );

  const c = wf.connections || {};
  if (!c['Mapear Resultado']) c['Mapear Resultado'] = { main: [[]] };
  if (!c['Mapear Resultado'].main) c['Mapear Resultado'].main = [[]];
  if (!c['Mapear Resultado'].main[0]) c['Mapear Resultado'].main[0] = [];
  c['Mapear Resultado'].main[0].push({
    node: 'IF Emit OK',
    type: 'main',
    index: 0,
  });
  c['IF Emit OK'] = {
    main: [[{ node: 'Emit Chat Realtime', type: 'main', index: 0 }], []],
  };

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
    connections: c,
    settings,
    staticData: wf.staticData ?? null,
  });
  try {
    await request('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  } catch {
    /* ignore */
  }
  await request('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('PANEL-02 patched+activated');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
