/**
 * CITA-01: formulario público de visita vía ngrok → Gmail (FormSubmit) + Sheets.
 * GET  /webhook/cita-form
 * POST /webhook/cita-submit
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
const NOTIFY = 'adrianfredes12@gmail.com';
const SHEET = '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ';
const CRED = { googleSheetsOAuth2Api: { id: 'WBM00QjQj4q8xjLF', name: 'Cuenta de Google Sheets' } };

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
            reject(new Error(`${res.statusCode} ${JSON.stringify(json).slice(0, 700)}`));
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

const FORM_HTML_CODE = `const q = $input.first().json.query || {};
const chatId = String(q.chat_id || q.chatId || '').trim();
const nombre = String(q.nombre || '').trim();
const zona = String(q.zona || '').trim();
const propiedad = String(q.propiedad || q.propiedad_id || '').trim();
const canal = String(q.canal || 'telegram').trim();
const action = 'https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-submit';
const html = \`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Coordinar visita — Nodo Propiedades</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;background:#f4f1ec;margin:0;padding:24px;color:#1c1917}
.card{max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:22px;box-shadow:0 8px 28px rgba(0,0,0,.08)}
h1{font-size:1.25rem;margin:0 0 6px}
p{margin:0 0 16px;color:#57534e;line-height:1.45}
label{display:block;font-size:.85rem;margin:12px 0 4px;font-weight:600}
input,select,textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d6d3d1;border-radius:8px;font:inherit}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer}
.hint{font-size:.8rem;color:#78716c;margin-top:10px}
</style>
</head>
<body>
<div class="card">
<h1>Coordinemos la visita</h1>
<p>Completá estos datos y te confirmamos a la brevedad.</p>
<form method="POST" action="\${action}">
<input type="hidden" name="chat_id" value="\${chatId.replace(/"/g,'')}"/>
<input type="hidden" name="canal" value="\${canal.replace(/"/g,'')}"/>
<label>Nombre</label>
<input name="nombre" required value="\${nombre.replace(/"/g,'')}"/>
<label>Teléfono / WhatsApp</label>
<input name="telefono" required placeholder="Ej. 261..."/>
<label>Email</label>
<input name="email" type="email" placeholder="opcional"/>
<label>Fecha preferida</label>
<input name="fecha" type="date" required/>
<label>Horario</label>
<select name="horario" required>
<option value="">Elegí…</option>
<option>Mañana (9–12)</option>
<option>Mediodía (12–15)</option>
<option>Tarde (15–18)</option>
<option>A coordinar</option>
</select>
<label>Zona / propiedad de interés</label>
<input name="zona_propiedad" value="\${[zona,propiedad].filter(Boolean).join(' · ').replace(/"/g,'')}"/>
<label>Comentario</label>
<textarea name="comentario" rows="3" placeholder="Ej. quiero ver el PH de Godoy Cruz"></textarea>
<button type="submit">Enviar pedido de visita</button>
<p class="hint">Nodo Propiedades · Mendoza</p>
</form>
</div>
</body>
</html>\`;
return [{ json: { html } }];`;

const PARSE_SUBMIT = `const root = $input.first().json;
const body = root.body && typeof root.body === 'object' ? root.body : root;
const get = (k) => String(body[k] || '').trim();
const row = {
  ok: true,
  chat_id: get('chat_id'),
  canal: get('canal') || 'telegram',
  nombre: get('nombre'),
  telefono: get('telefono'),
  email: get('email'),
  fecha: get('fecha'),
  horario: get('horario'),
  zona_propiedad: get('zona_propiedad'),
  comentario: get('comentario'),
  recibido_at: new Date().toISOString(),
};
if (!row.nombre || !row.fecha || !row.horario) {
  return [{ json: { ok: false, error: 'faltan_campos', ...row } }];
}
return [{ json: row }];`;

const THANKS_HTML = `const ok = $json.ok !== false;
const html = ok
  ? \`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Listo</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f1ec;display:grid;place-items:center;min-height:100vh;margin:0}.c{background:#fff;padding:28px;border-radius:14px;max-width:420px;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.08)}h1{color:#0f766e}</style></head>
<body><div class="c"><h1>¡Recibido!</h1><p>Ya nos llegó tu pedido de visita. Te contactamos para confirmar día y hora.</p></div></body></html>\`
  : \`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Error</title></head><body style="font-family:system-ui;padding:2rem"><h1>Faltan datos</h1><p>Volvé atrás y completá nombre, fecha y horario.</p></body></html>\`;
return [{ json: { html, ...($json) } }];`;

const workflow = {
  name: 'CITA-01 Formulario Visita',
  settings: { executionOrder: 'v1' },
  nodes: [
    {
      id: 'cita-get',
      name: 'Webhook Form GET',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 200],
      webhookId: 'cita-form',
      parameters: {
        httpMethod: 'GET',
        path: 'cita-form',
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'cita-build',
      name: 'Armar HTML Form',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [420, 200],
      parameters: { jsCode: FORM_HTML_CODE },
    },
    {
      id: 'cita-resp-get',
      name: 'Responder HTML Form',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [640, 200],
      parameters: {
        respondWith: 'text',
        responseBody: '={{ $json.html }}',
        options: {
          responseHeaders: {
            entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          },
        },
      },
    },
    {
      id: 'cita-post',
      name: 'Webhook Form POST',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 480],
      webhookId: 'cita-submit',
      parameters: {
        httpMethod: 'POST',
        path: 'cita-submit',
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'cita-parse',
      name: 'Parsear Submit',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [420, 480],
      parameters: { jsCode: PARSE_SUBMIT },
    },
    {
      id: 'cita-if',
      name: 'IF Submit OK',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [640, 480],
      parameters: {
        conditions: {
          combinator: 'and',
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 2,
          },
          conditions: [
            {
              id: 'ok',
              leftValue: '={{ $json.ok }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: 'cita-mail',
      name: 'Email Cita Gmail',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [880, 400],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: `https://formsubmit.co/ajax/${NOTIFY}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Accept', value: 'application/json' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ name: $json.nombre || 'Lead', email: $json.email || 'noreply@nodopropiedades.local', _subject: 'CITA VISITA — ' + ($json.nombre || '') + ' — ' + ($json.fecha || ''), message: 'Nueva solicitud de visita\\n\\nNombre: ' + ($json.nombre||'') + '\\nTel: ' + ($json.telefono||'') + '\\nEmail: ' + ($json.email||'') + '\\nFecha: ' + ($json.fecha||'') + '\\nHorario: ' + ($json.horario||'') + '\\nZona/Propiedad: ' + ($json.zona_propiedad||'') + '\\nComentario: ' + ($json.comentario||'') + '\\nChat: ' + ($json.chat_id||'') + '\\nCanal: ' + ($json.canal||'') + '\\nRecibido: ' + ($json.recibido_at||'') }) }}`,
        options: {
          timeout: 15000,
          response: { response: { neverError: true } },
        },
      },
    },
    {
      id: 'cita-sheet',
      name: 'Marcar Lead Cita',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [880, 560],
      onError: 'continueRegularOutput',
      credentials: CRED,
      parameters: {
        operation: 'appendOrUpdate',
        documentId: { __rl: true, mode: 'id', value: SHEET },
        sheetName: { __rl: true, mode: 'name', value: 'Leads_Bot' },
        columns: {
          mappingMode: 'defineBelow',
          matchingColumns: ['chat_id'],
          schema: [],
          value: {
            chat_id: "={{ $('Parsear Submit').first().json.chat_id }}",
            estado_seguimiento: 'respondido',
            status: 'cita_pendiente',
            temperature: 'caliente',
            last_message: "={{ 'Cita pedida: ' + $('Parsear Submit').first().json.fecha + ' ' + $('Parsear Submit').first().json.horario }}",
            ultima_actualizacion: "={{ $('Parsear Submit').first().json.recibido_at }}",
            updated_at: "={{ $('Parsear Submit').first().json.recibido_at }}",
            phone: "={{ $('Parsear Submit').first().json.telefono }}",
          },
        },
        options: {},
      },
    },
    {
      id: 'cita-thanks',
      name: 'HTML Gracias',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1120, 480],
      parameters: { jsCode: THANKS_HTML },
    },
    {
      id: 'cita-resp-post',
      name: 'Responder HTML Gracias',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1340, 480],
      parameters: {
        respondWith: 'text',
        responseBody: '={{ $json.html }}',
        options: {
          responseHeaders: {
            entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          },
        },
      },
    },
    {
      id: 'cita-emit',
      name: 'Emit Lead Cita',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1120, 640],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: 'http://127.0.0.1:5678/webhook/panel-realtime-emit',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ type: 'lead.updated', payload: { chatId: String($('Parsear Submit').first().json.chat_id||''), status: 'cita_pendiente', source: 'cita-form' } }) }}`,
        options: { timeout: 3000, response: { response: { neverError: true } } },
      },
    },
  ],
  connections: {
    'Webhook Form GET': {
      main: [[{ node: 'Armar HTML Form', type: 'main', index: 0 }]],
    },
    'Armar HTML Form': {
      main: [[{ node: 'Responder HTML Form', type: 'main', index: 0 }]],
    },
    'Webhook Form POST': {
      main: [[{ node: 'Parsear Submit', type: 'main', index: 0 }]],
    },
    'Parsear Submit': {
      main: [[{ node: 'IF Submit OK', type: 'main', index: 0 }]],
    },
    'IF Submit OK': {
      main: [
        [
          { node: 'Email Cita Gmail', type: 'main', index: 0 },
          { node: 'Marcar Lead Cita', type: 'main', index: 0 },
        ],
        [{ node: 'HTML Gracias', type: 'main', index: 0 }],
      ],
    },
    'Email Cita Gmail': {
      main: [[{ node: 'HTML Gracias', type: 'main', index: 0 }]],
    },
    'Marcar Lead Cita': {
      main: [
        [
          { node: 'HTML Gracias', type: 'main', index: 0 },
          { node: 'Emit Lead Cita', type: 'main', index: 0 },
        ],
      ],
    },
    'HTML Gracias': {
      main: [[{ node: 'Responder HTML Gracias', type: 'main', index: 0 }]],
    },
  },
};

async function main() {
  // delete existing by name if any
  const list = await request('GET', '/api/v1/workflows?limit=50');
  const existing = (list.data || list).find?.(
    (w) => w.name === workflow.name,
  ) || (Array.isArray(list.data) ? list.data.find((w) => w.name === workflow.name) : null);
  let id;
  if (existing) {
    id = existing.id;
    await request('PUT', `/api/v1/workflows/${id}`, {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings,
    });
    console.log('updated', id);
  } else {
    const created = await request('POST', '/api/v1/workflows', workflow);
    id = created.id;
    console.log('created', id);
  }
  await request('POST', `/api/v1/workflows/${id}/activate`);
  console.log('activated', id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
