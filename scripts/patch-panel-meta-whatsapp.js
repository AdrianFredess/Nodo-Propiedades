/**
 * Migra PANEL-05 send_whatsapp de WAHA a Meta WhatsApp Cloud API.
 *
 * Uso:
 *   node scripts/patch-panel-meta-whatsapp.js           # actualiza workflows/PANEL-05 Acciones Lead.json
 *   node scripts/patch-panel-meta-whatsapp.js --deploy    # también sube a n8n local si está activo
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WF_PATH = path.join(ROOT, 'workflows', 'PANEL-05 Acciones Lead.json');
const WF_ID = '2JCWQgcxk5t9tMEt';
const DEPLOY = process.argv.includes('--deploy');

const META_MSG_URL =
  'https://graph.facebook.com/__SET_META_GRAPH_VERSION__/__SET_META_PHONE_NUMBER_ID__/messages';
const META_AUTH = 'Bearer __SET_META_ACCESS_TOKEN__';

function loadEnvValue(key, fallback) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return fallback;
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) return fallback;
  return String(m[1]).trim().replace(/^["']|["']$/g, '') || fallback;
}

function metaHeaders() {
  return {
    parameters: [
      { name: 'Authorization', value: META_AUTH },
      { name: 'Content-Type', value: 'application/json' },
    ],
  };
}

function metaToExpr(jsonPath) {
  return `(function(p){p=String(p||"").replace(/\\D/g,"");if(/^549\\d{8,11}$/.test(p))return "54"+p.slice(3);return p;})(${jsonPath}.phone || ${jsonPath}.chat_id || "")`;
}

const ENVELOPE_WA_CODE = `const prep = $('Preparar Accion').first().json;
const raw = $input.first().json || {};
const err = raw.error;
const hasMsg = Array.isArray(raw.messages) && raw.messages.length > 0;
const statusBad = Number(raw.statusCode || 0) >= 400;
const ok = !err && !statusBad && hasMsg;
return [{
  json: {
    ok,
    action: 'send_whatsapp',
    chat_id: prep.chat_id,
    text: prep.text,
    meta: hasMsg ? { message_id: raw.messages[0].id } : undefined,
    error: ok ? undefined : String(
      (err && (err.message || err.error_user_msg)) || raw.message || 'meta_send_error'
    ),
  },
}];`;

function patchWorkflow(wf) {
  const sendIdx = wf.nodes.findIndex(
    (n) => n.name === 'WAHA sendText' || n.name === 'Meta Enviar WhatsApp',
  );
  if (sendIdx < 0) throw new Error('Nodo de envío WhatsApp no encontrado en PANEL-05');

  const oldName = wf.nodes[sendIdx].name;
  wf.nodes[sendIdx] = {
    ...wf.nodes[sendIdx],
    id: wf.nodes[sendIdx].id || 'p05-send-wa',
    name: 'Meta Enviar WhatsApp',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: META_MSG_URL,
      sendBody: true,
      specifyBody: 'json',
      sendHeaders: true,
      headerParameters: metaHeaders(),
      jsonBody: `={{ JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: ${metaToExpr('$json')}, type: "text", text: { preview_url: false, body: String($json.text || "") } }) }}`,
      options: {
        response: { response: { neverError: true } },
        timeout: 15000,
      },
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
  };

  const wrap = wf.nodes.find((n) => n.name === 'Envelope WA');
  if (!wrap) throw new Error('Envelope WA no encontrado');
  wrap.parameters.jsCode = ENVELOPE_WA_CODE;

  if (oldName !== 'Meta Enviar WhatsApp' && wf.connections[oldName]) {
    wf.connections['Meta Enviar WhatsApp'] = wf.connections[oldName];
    delete wf.connections[oldName];
  }
  const ifSend = wf.connections['IF Send WhatsApp'];
  if (ifSend?.main?.[0]) {
    for (const edge of ifSend.main[0]) {
      if (edge.node === oldName) edge.node = 'Meta Enviar WhatsApp';
    }
  }

  applySheetPlaceholders(wf);
  return wf;
}

function applySheetPlaceholders(wf) {
  const sheetId = loadEnvValue('GOOGLE_SHEET_ID', '');
  for (const node of wf.nodes) {
    if (node.type !== 'n8n-nodes-base.googleSheets') continue;
    const doc = node.parameters?.documentId;
    if (!doc) continue;
    if (DEPLOY && sheetId) {
      doc.value = sheetId;
    } else if (!DEPLOY) {
      doc.value = '__SET_GOOGLE_SHEET_ID__';
    }
  }
}

function sanitizeForRepo(wf) {
  const copy = JSON.parse(JSON.stringify(wf));
  for (const node of copy.nodes) {
    if (node.name === 'Meta Enviar WhatsApp' || node.name === 'WAHA sendText') {
      node.name = 'Meta Enviar WhatsApp';
      node.parameters.url = META_MSG_URL;
      node.parameters.headerParameters = metaHeaders();
      node.parameters.jsonBody = `={{ JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: ${metaToExpr('$json')}, type: "text", text: { preview_url: false, body: String($json.text || "") } }) }}`;
      node.parameters.options = {
        response: { response: { neverError: true } },
        timeout: 15000,
      };
      delete node.parameters.headerParameters?.parameters?.find?.(
        (h) => h.name === 'X-Api-Key',
      );
    }
    if (node.name === 'Envelope WA') {
      node.parameters.jsCode = ENVELOPE_WA_CODE;
    }
    if (node.type === 'n8n-nodes-base.googleSheets') {
      const doc = node.parameters?.documentId;
      if (doc) doc.value = '__SET_GOOGLE_SHEET_ID__';
    }
  }
  // Renombrar conexiones WAHA → Meta
  if (copy.connections['WAHA sendText']) {
    copy.connections['Meta Enviar WhatsApp'] = copy.connections['WAHA sendText'];
    delete copy.connections['WAHA sendText'];
  }
  const ifSend = copy.connections['IF Send WhatsApp'];
  if (ifSend?.main?.[0]) {
    for (const edge of ifSend.main[0]) {
      if (edge.node === 'WAHA sendText') edge.node = 'Meta Enviar WhatsApp';
    }
  }
  return {
    name: 'PANEL-05 Acciones Lead',
    nodes: copy.nodes.filter((n) => n.name !== 'WAHA sendText'),
    connections: copy.connections,
    settings: { executionOrder: 'v1' },
  };
}

function putSettings(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    staticData: wf.staticData ?? null,
    settings: {
      executionOrder: s.executionOrder || 'v1',
      ...(s.timezone ? { timezone: s.timezone } : {}),
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
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
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
            reject(new Error(`${res.statusCode} ${JSON.stringify(json).slice(0, 600)}`));
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

function substituteMetaEnv(wf) {
  const vars = {
    __SET_META_GRAPH_VERSION__: loadEnvValue('META_GRAPH_VERSION', 'v21.0'),
    __SET_META_PHONE_NUMBER_ID__: loadEnvValue('META_PHONE_NUMBER_ID', ''),
    __SET_META_ACCESS_TOKEN__: loadEnvValue('META_ACCESS_TOKEN', ''),
    __SET_GOOGLE_SHEET_ID__: loadEnvValue(
      'GOOGLE_SHEET_ID',
      '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ',
    ),
  };
  let raw = JSON.stringify(wf);
  for (const [k, v] of Object.entries(vars)) {
    if (v) raw = raw.split(k).join(v);
  }
  return JSON.parse(raw);
}

async function loadWorkflow() {
  if (fs.existsSync(WF_PATH)) {
    return JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  }
  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('Sin workflow local ni N8N_API_KEY para fetch remoto');
  const remote = await request('GET', `/api/v1/workflows/${WF_ID}`, null, apiKey);
  return remote;
}

async function deployToN8n(wf) {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.log('  SKIP deploy: sin N8N_API_KEY');
    return false;
  }
  try {
    const patched = substituteMetaEnv(patchWorkflow(JSON.parse(JSON.stringify(wf))));
    await request('PUT', `/api/v1/workflows/${WF_ID}`, putSettings(patched), apiKey);
    await request('POST', `/api/v1/workflows/${WF_ID}/deactivate`, null, apiKey);
    await request('POST', `/api/v1/workflows/${WF_ID}/activate`, null, apiKey);
    return true;
  } catch (e) {
    console.log('  SKIP deploy:', e.message);
    return false;
  }
}

async function main() {
  console.log('→ Parche Meta WhatsApp (PANEL-05 panel CRM)');
  const wf = await loadWorkflow();
  patchWorkflow(wf);
  const forRepo = sanitizeForRepo(wf);
  fs.writeFileSync(WF_PATH, JSON.stringify(forRepo, null, 2) + '\n', 'utf8');
  console.log('  OK workflow JSON:', WF_PATH);

  if (DEPLOY) {
    const ok = await deployToN8n(wf);
    if (ok) console.log('  OK deploy n8n workflow', WF_ID);
  } else {
    console.log(
      '  Tip: node scripts/patch-panel-meta-whatsapp.js --deploy cuando n8n esté activo',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
