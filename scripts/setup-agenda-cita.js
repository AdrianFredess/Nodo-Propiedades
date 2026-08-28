/**
 * Crea/actualiza hoja Agenda_Visitas (seed) y reescribe CITA-01
 * para ofrecer solo turnos libres → a_confirmar + Gmail.
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
const SHEET = '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ';
const CRED = {
  googleSheetsOAuth2Api: {
    id: 'WBM00QjQj4q8xjLF',
    name: 'Cuenta de Google Sheets',
  },
};
const NOTIFY = 'adrianfredes12@gmail.com';
const CITA_ID = 'BV13GbhJrIjzBpKf';

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
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            reject(new Error(data.slice(0, 400)));
            return;
          }
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `${res.statusCode} ${JSON.stringify(json).slice(0, 700)}`,
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

function loadSeed() {
  const raw = fs.readFileSync(
    path.join(__dirname, '..', 'csv', 'Agenda_Visitas.csv'),
    'utf8',
  );
  const lines = raw.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const o = {};
    headers.forEach((h, i) => {
      o[h] = cols[i] || '';
    });
    return o;
  });
}

const BUILD_HTML = `const q = $('Webhook Form GET').first().json.query || {};
const chatId = String(q.chat_id || q.chatId || '').trim();
const nombre = String(q.nombre || '').trim();
const zona = String(q.zona || '').trim();
const canal = String(q.canal || 'telegram').trim();

const rows = $input.all().map((i) => i.json).filter((r) => r && !r.error);
const libres = rows
  .filter((r) => String(r.estado || '').toLowerCase() === 'libre')
  .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora).localeCompare(String(b.hora)));

const options = libres.length
  ? libres
      .map((r) => {
        const id = String(r.slot_id || '').trim();
        const label = String(r.fecha || '') + ' · ' + String(r.hora || '');
        return '<option value=\"' + id.replace(/\"/g, '') + '\">' + label + '</option>';
      })
      .join('')
  : '<option value=\"\">Sin turnos libres por ahora</option>';

const action = 'https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-submit';
const html = \`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Coordinar visita — Nodo Propiedades</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;background:#f4f1ec;margin:0;padding:24px;color:#1c1917}
.card{max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:22px;box-shadow:0 8px 28px rgba(0,0,0,.08)}
h1{font-size:1.25rem;margin:0 0 6px}p{margin:0 0 14px;color:#57534e;line-height:1.45}
label{display:block;font-size:.85rem;margin:12px 0 4px;font-weight:600}
input,select,textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d6d3d1;border-radius:8px;font:inherit}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
.hint{font-size:.8rem;color:#78716c;margin-top:10px}
</style></head><body>
<div class="card">
<h1>Coordinemos la visita</h1>
<p>Elegí un turno libre. Queda <strong>a confirmar</strong> por el asesor (si ese horario ya se ocupó, te ofrecemos otro).</p>
<form method="POST" action="\${action}">
<input type="hidden" name="chat_id" value="\${chatId.replace(/"/g,'')}"/>
<input type="hidden" name="canal" value="\${canal.replace(/"/g,'')}"/>
<label>Nombre</label>
<input name="nombre" required value="\${nombre.replace(/"/g,'')}"/>
<label>Teléfono / WhatsApp</label>
<input name="telefono" required placeholder="261…"/>
<label>Email</label>
<input name="email" type="email" placeholder="opcional"/>
<label>Turno disponible</label>
<select name="slot_id" required \${libres.length ? '' : 'disabled'}>
<option value="">Elegí…</option>
\${options}
</select>
<label>Zona / propiedad</label>
<input name="zona_propiedad" value="\${zona.replace(/"/g,'')}"/>
<label>Comentario</label>
<textarea name="comentario" rows="3" placeholder="Ej. me interesa el PH de Godoy Cruz"></textarea>
<button type="submit" \${libres.length ? '' : 'disabled'}>Pedir turno</button>
<p class="hint">Nodo Propiedades · Mendoza · confirmación del asesor</p>
</form>
</div></body></html>\`;
return [{ json: { html, libres: libres.length } }];`;

const PARSE_SUBMIT = `const root = $input.first().json;
const body = root.body && typeof root.body === 'object' ? root.body : root;
const get = (k) => String(body[k] || '').trim();
const slot_id = get('slot_id');
const row = {
  ok: Boolean(slot_id && get('nombre') && get('telefono')),
  slot_id,
  chat_id: get('chat_id'),
  canal: get('canal') || 'telegram',
  nombre: get('nombre'),
  telefono: get('telefono'),
  email: get('email'),
  zona_propiedad: get('zona_propiedad'),
  comentario: get('comentario'),
  recibido_at: new Date().toISOString(),
  error: !slot_id ? 'slot_requerido' : (!get('nombre') || !get('telefono') ? 'faltan_campos' : ''),
};
return [{ json: row }];`;

const CHECK_SLOT = `const prep = $('Parsear Submit').first().json;
if (!prep.ok) return [{ json: { ...prep, ok: false } }];
const rows = $input.all().map((i) => i.json).filter((r) => r && !r.error);
const slot = rows.find((r) => String(r.slot_id || '').trim() === prep.slot_id);
if (!slot) return [{ json: { ...prep, ok: false, error: 'slot_inexistente' } }];
const estado = String(slot.estado || '').toLowerCase();
if (estado !== 'libre') {
  return [{ json: { ...prep, ok: false, error: 'slot_ocupado', fecha: slot.fecha, hora: slot.hora } }];
}
return [{
  json: {
    ...prep,
    ok: true,
    fecha: slot.fecha,
    hora: slot.hora,
    estado: 'a_confirmar',
    creado_at: prep.recibido_at,
  },
}];`;

const THANKS = `const j = $json;
const ok = j.ok !== false && !j.error;
const html = ok
  ? \`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pedido recibido</title>
<style>body{font-family:system-ui;background:#f4f1ec;display:grid;place-items:center;min-height:100vh;margin:0}.c{background:#fff;padding:28px;border-radius:14px;max-width:420px;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.08)}h1{color:#0f766e}</style></head>
<body><div class="c"><h1>¡Listo!</h1><p>Pediste el turno <strong>\${String(j.fecha||'')} · \${String(j.hora||'')}</strong>.</p><p>Queda <strong>a confirmar</strong> por el asesor. Te escribimos para cerrarlo.</p></div></body></html>\`
  : \`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>No se pudo</title></head>
<body style="font-family:system-ui;padding:2rem"><h1>Ese turno ya no está</h1><p>Volvé atrás y elegí otro horario libre. (\${String(j.error||'error')})</p></body></html>\`;
return [{ json: { ...j, html } }];`;

async function seedAgenda() {
  // One-shot workflow execute is hard; use temporary workflow create+run via webhook
  const seed = loadSeed();
  const wf = {
    name: '_TMP Seed Agenda_Visitas',
    settings: { executionOrder: 'v1' },
    nodes: [
      {
        id: 'm1',
        name: 'Manual',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      {
        id: 'c1',
        name: 'Seed Rows',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [220, 0],
        parameters: {
          jsCode: `return ${JSON.stringify(seed)}.map((r) => ({ json: r }));`,
        },
      },
      {
        id: 's1',
        name: 'Append Agenda',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.7,
        position: [440, 0],
        credentials: CRED,
        parameters: {
          operation: 'append',
          documentId: { __rl: true, mode: 'id', value: SHEET },
          sheetName: { __rl: true, mode: 'name', value: 'Agenda_Visitas' },
          columns: {
            mappingMode: 'autoMapInputData',
            value: {},
          },
          options: {},
        },
      },
    ],
    connections: {
      Manual: { main: [[{ node: 'Seed Rows', type: 'main', index: 0 }]] },
      'Seed Rows': {
        main: [[{ node: 'Append Agenda', type: 'main', index: 0 }]],
      },
    },
  };

  // delete old tmp if exists
  const list = await request('GET', '/api/v1/workflows?limit=100');
  const data = list.data || [];
  const old = data.find((w) => w.name === wf.name);
  let id = old && old.id;
  if (id) {
    await request('PUT', `/api/v1/workflows/${id}`, {
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings,
    });
  } else {
    const created = await request('POST', '/api/v1/workflows', wf);
    id = created.id;
  }
  // try run
  try {
    await request('POST', `/api/v1/workflows/${id}/run`);
    console.log('seed run ok', id);
  } catch (e) {
    console.log('seed run via API failed (manual in n8n):', String(e.message || e).slice(0, 200));
    console.log('TMP workflow id', id, '— ejecutalo Manual una vez en n8n');
  }
}

async function rewriteCita() {
  const nodes = [
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
      id: 'cita-read',
      name: 'Leer Agenda Libre',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [420, 200],
      credentials: CRED,
      onError: 'continueRegularOutput',
      alwaysOutputData: true,
      parameters: {
        operation: 'read',
        documentId: { __rl: true, mode: 'id', value: SHEET },
        sheetName: { __rl: true, mode: 'name', value: 'Agenda_Visitas' },
        options: {},
      },
    },
    {
      id: 'cita-build',
      name: 'Armar HTML Form',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [640, 200],
      parameters: { jsCode: BUILD_HTML },
    },
    {
      id: 'cita-resp-get',
      name: 'Responder HTML Form',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [860, 200],
      parameters: {
        respondWith: 'text',
        responseBody: '={{ $json.html }}',
        options: {
          responseHeaders: {
            entries: [
              { name: 'Content-Type', value: 'text/html; charset=utf-8' },
            ],
          },
        },
      },
    },
    {
      id: 'cita-post',
      name: 'Webhook Form POST',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 520],
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
      position: [420, 520],
      parameters: { jsCode: PARSE_SUBMIT },
    },
    {
      id: 'cita-read2',
      name: 'Leer Agenda Check',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [640, 520],
      credentials: CRED,
      onError: 'continueRegularOutput',
      alwaysOutputData: true,
      parameters: {
        operation: 'read',
        documentId: { __rl: true, mode: 'id', value: SHEET },
        sheetName: { __rl: true, mode: 'name', value: 'Agenda_Visitas' },
        options: {},
      },
    },
    {
      id: 'cita-check',
      name: 'Validar Slot Libre',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [860, 520],
      parameters: { jsCode: CHECK_SLOT },
    },
    {
      id: 'cita-if',
      name: 'IF Slot OK',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1080, 520],
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
              operator: {
                type: 'boolean',
                operation: 'true',
                singleValue: true,
              },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: 'cita-upd',
      name: 'Reservar Slot a_confirmar',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [1320, 400],
      credentials: CRED,
      onError: 'continueRegularOutput',
      parameters: {
        operation: 'appendOrUpdate',
        documentId: { __rl: true, mode: 'id', value: SHEET },
        sheetName: { __rl: true, mode: 'name', value: 'Agenda_Visitas' },
        columns: {
          mappingMode: 'defineBelow',
          matchingColumns: ['slot_id'],
          schema: [],
          value: {
            slot_id: '={{ $json.slot_id }}',
            fecha: '={{ $json.fecha }}',
            hora: '={{ $json.hora }}',
            estado: 'a_confirmar',
            chat_id: '={{ $json.chat_id }}',
            nombre: '={{ $json.nombre }}',
            telefono: '={{ $json.telefono }}',
            zona_propiedad: '={{ $json.zona_propiedad }}',
            comentario: '={{ $json.comentario }}',
            creado_at: '={{ $json.recibido_at }}',
          },
        },
        options: {},
      },
    },
    {
      id: 'cita-mail',
      name: 'Email Cita Gmail',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1320, 560],
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
        jsonBody: `={{ JSON.stringify({ name: $json.nombre || 'Lead', email: $json.email || 'noreply@nodopropiedades.local', _subject: 'VISITA A CONFIRMAR — ' + ($json.fecha||'') + ' ' + ($json.hora||'') + ' — ' + ($json.nombre||''), message: 'Pedido de visita (a confirmar)\\n\\nTurno: ' + ($json.fecha||'') + ' ' + ($json.hora||'') + '\\nSlot: ' + ($json.slot_id||'') + '\\nNombre: ' + ($json.nombre||'') + '\\nTel: ' + ($json.telefono||'') + '\\nEmail: ' + ($json.email||'') + '\\nZona/Prop: ' + ($json.zona_propiedad||'') + '\\nComentario: ' + ($json.comentario||'') + '\\nChat: ' + ($json.chat_id||'') + '\\nCanal: ' + ($json.canal||'') + '\\n\\nEn Agenda_Visitas quedó estado=a_confirmar. Confirmá o liberá el slot.' }) }}`,
        options: {
          timeout: 15000,
          response: { response: { neverError: true } },
        },
      },
    },
    {
      id: 'cita-lead',
      name: 'Marcar Lead Cita',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [1540, 480],
      credentials: CRED,
      onError: 'continueRegularOutput',
      parameters: {
        operation: 'appendOrUpdate',
        documentId: { __rl: true, mode: 'id', value: SHEET },
        sheetName: { __rl: true, mode: 'name', value: 'Leads_Bot' },
        columns: {
          mappingMode: 'defineBelow',
          matchingColumns: ['chat_id'],
          schema: [],
          value: {
            chat_id: "={{ $('Validar Slot Libre').first().json.chat_id }}",
            estado_seguimiento: 'respondido',
            status: 'cita_a_confirmar',
            temperature: 'caliente',
            phone: "={{ $('Validar Slot Libre').first().json.telefono }}",
            last_message:
              "={{ 'Visita a confirmar: ' + $('Validar Slot Libre').first().json.fecha + ' ' + $('Validar Slot Libre').first().json.hora }}",
            ultima_actualizacion:
              "={{ $('Validar Slot Libre').first().json.recibido_at }}",
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
      position: [1760, 520],
      parameters: { jsCode: THANKS },
    },
    {
      id: 'cita-resp-post',
      name: 'Responder HTML Gracias',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1980, 520],
      parameters: {
        respondWith: 'text',
        responseBody: '={{ $json.html }}',
        options: {
          responseHeaders: {
            entries: [
              { name: 'Content-Type', value: 'text/html; charset=utf-8' },
            ],
          },
        },
      },
    },
  ];

  const connections = {
    'Webhook Form GET': {
      main: [[{ node: 'Leer Agenda Libre', type: 'main', index: 0 }]],
    },
    'Leer Agenda Libre': {
      main: [[{ node: 'Armar HTML Form', type: 'main', index: 0 }]],
    },
    'Armar HTML Form': {
      main: [[{ node: 'Responder HTML Form', type: 'main', index: 0 }]],
    },
    'Webhook Form POST': {
      main: [[{ node: 'Parsear Submit', type: 'main', index: 0 }]],
    },
    'Parsear Submit': {
      main: [[{ node: 'Leer Agenda Check', type: 'main', index: 0 }]],
    },
    'Leer Agenda Check': {
      main: [[{ node: 'Validar Slot Libre', type: 'main', index: 0 }]],
    },
    'Validar Slot Libre': {
      main: [[{ node: 'IF Slot OK', type: 'main', index: 0 }]],
    },
    'IF Slot OK': {
      main: [
        [
          { node: 'Reservar Slot a_confirmar', type: 'main', index: 0 },
          { node: 'Email Cita Gmail', type: 'main', index: 0 },
        ],
        [{ node: 'HTML Gracias', type: 'main', index: 0 }],
      ],
    },
    'Reservar Slot a_confirmar': {
      main: [[{ node: 'Marcar Lead Cita', type: 'main', index: 0 }]],
    },
    'Email Cita Gmail': {
      main: [[{ node: 'HTML Gracias', type: 'main', index: 0 }]],
    },
    'Marcar Lead Cita': {
      main: [[{ node: 'HTML Gracias', type: 'main', index: 0 }]],
    },
    'HTML Gracias': {
      main: [[{ node: 'Responder HTML Gracias', type: 'main', index: 0 }]],
    },
  };

  await request('PUT', `/api/v1/workflows/${CITA_ID}`, {
    name: 'CITA-01 Formulario Visita',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  });
  await request('POST', `/api/v1/workflows/${CITA_ID}/activate`);
  console.log('CITA-01 rewritten');
}

async function main() {
  await seedAgenda();
  await rewriteCita();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
