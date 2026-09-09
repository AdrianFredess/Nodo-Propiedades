/**
 * Reordena SIMPLE-02 WhatsApp Bot como mapa conceptual (mismas 7 zonas que TG).
 *   node scripts/beautify-wa-canvas.js --deploy
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEPLOY = process.argv.includes('--deploy');
const WF_ID = 'npq6sC6YLaUBpHac';
const WF_PATH = path.join(__dirname, '..', 'workflows', 'SIMPLE-02 WhatsApp Bot.json');
const Y = 420;
const DX = 240;

const POS = {
  'Webhook WhatsApp Verify': [80, Y + 220],
  'Respond - Verify Meta': [80 + DX, Y + 220],

  'Webhook WhatsApp': [80, Y],
  'Code - Normalizar WhatsApp': [80 + DX, Y],
  'Transcribir Audio WA': [80 + DX * 2, Y],
  'IF - Tiene Mensaje': [80 + DX * 3, Y],

  'Google Sheets - Buscar Lead': [80 + DX * 4.2, Y - 80],
  'Leer Stock Propiedades WA': [80 + DX * 4.2, Y + 80],
  'Leer Aprendizaje Matias': [80 + DX * 4.2, Y + 240],
  'IF - Lead Existe': [80 + DX * 5.4, Y],
  'Google Sheets - Actualizar Lead': [80 + DX * 6.6, Y - 120],
  'Google Sheets - Crear Lead': [80 + DX * 6.6, Y + 120],

  'Code - Armar Prompt': [80 + DX * 8, Y],
  'IF - Debe Responder': [80 + DX * 9.2, Y],
  'Basic LLM Chain': [80 + DX * 10.4, Y - 40],
  'Groq Chat Model': [80 + DX * 10.4, Y + 140],
  'Code - Procesar IA': [80 + DX * 11.6, Y],

  'Google Sheets - Actualizar Temperatura': [80 + DX * 13, Y - 280],
  'Google Sheets - Registrar Consulta': [80 + DX * 13, Y - 120],
  'Emit Panel Realtime': [80 + DX * 13, Y + 40],
  'Emit Lead Updated': [80 + DX * 14.2, Y + 40],
  'IF - Interes Alto': [80 + DX * 13, Y - 440],
  'HTTP - Email Lead Caliente': [80 + DX * 14.2, Y - 520],
  'HTTP - Telegram Alerta Owner': [80 + DX * 14.2, Y - 360],
  'IF Solicitud Visita WA': [80 + DX * 13, Y + 200],
  'Email Solicitud Visita WA': [80 + DX * 14.2, Y + 200],
  'IF Registrar Aprendizaje': [80 + DX * 13, Y + 360],
  'Registrar Aprendizaje Matias': [80 + DX * 14.2, Y + 360],

  'HTTP Request - Enviar WhatsApp': [80 + DX * 15.6, Y],
  'Preparar Burbujas WA': [80 + DX * 16.8, Y - 160],
  'IF Tiene Burbujas WA': [80 + DX * 18, Y - 160],
  'Meta Enviar Burbuja': [80 + DX * 19.2, Y - 200],
  'IF Ultima Burbuja WA': [80 + DX * 20.4, Y - 200],
  'Preparar Fotos WA': [80 + DX * 16.8, Y],
  'IF Tiene Fotos WA': [80 + DX * 18, Y],
  'Meta Enviar Imagen': [80 + DX * 19.2, Y],
  'IF Ultima Foto WA': [80 + DX * 20.4, Y],
  'IF Tiene Cierre WA': [80 + DX * 20.4, Y + 140],
  'Meta Mensaje Cierre': [80 + DX * 21.6, Y + 140],

  'Code - Preparar Registro Revision WA': [80 + DX * 13, Y + 540],
  'IF Registrar Conversaciones_Revision WA': [80 + DX * 14.2, Y + 540],
  'Google Sheets - Conversaciones_Revision WA': [80 + DX * 15.4, Y + 540],
};

function sticky(id, name, x, y, width, height, color, content) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [x, y],
    parameters: { content, width, height, color },
  };
}

const STICKIES = [
  sticky('wa-sticky-titulo', 'NOTE · Mapa WhatsApp', -40, Y - 720, 560, 180, 4,
    `## WhatsApp (Meta Cloud API)
Misma lógica conceptual que Telegram.
Izquierda → derecha: entrada → lead/stock → IA → guardar → enviar.`),
  sticky('wa-sticky-entrada', 'NOTE · 1 Entrada WA', 40, Y - 140, 900, 280, 5,
    `## 1 · Entrada
Webhook Meta + verify. Normaliza mensaje y transcribe audio.`),
  sticky('wa-sticky-contexto', 'NOTE · 2 Lead + Stock', 1000, Y - 220, 720, 560, 3,
    `## 2 · Contexto
Busca/crea lead, lee stock y aprendizaje.`),
  sticky('wa-sticky-ia', 'NOTE · 3 IA WA', 1920, Y - 200, 720, 420, 6,
    `## 3 · IA (Groq)
Prompt → LLM → procesar respuesta (fichas, temperatura).`),
  sticky('wa-sticky-persist', 'NOTE · 4 Guardar + Alertas', 3080, Y - 680, 720, 1320, 2,
    `## 4 · Persistencia
Temperatura, consultas, realtime al panel, lead caliente, aprendizaje.`),
  sticky('wa-sticky-salida', 'NOTE · 5 Envío Meta', 3700, Y - 280, 1400, 520, 4,
    `## 5 · Respuesta al cliente
Texto + burbujas + fotos + cierre vía Meta Cloud API.`),
  sticky('wa-sticky-rev', 'NOTE · 6 Revisión', 3080, Y + 460, 900, 220, 7,
    `## 6 · Revisión humana
Conversaciones_Revision para mejorar tono.`),
];

function loadEnvValue(key, fallback = '') {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* ignore */ }
  return process.env[key] || fallback;
}

function loadApiKey() {
  const fromEnv = loadEnvValue('N8N_API_KEY', '');
  if (fromEnv) return fromEnv;
  try {
    const mcp = path.join(process.env.USERPROFILE || '', '.cursor', 'mcp.json');
    const j = JSON.parse(fs.readFileSync(mcp, 'utf8'));
    const s = j.mcpServers?.['user-n8n'] || j.mcpServers?.n8n;
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  } catch { /* ignore */ }
  return '';
}

function request(method, urlPath, body, apiKey) {
  const base = loadEnvValue('N8N_API_URL', 'http://127.0.0.1:5678').replace(/\/$/, '');
  const u = new URL(base + urlPath);
  const lib = u.protocol === 'https:' ? https : http;
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: 'application/json',
          'X-N8N-API-KEY': apiKey,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { reject(new Error(data.slice(0, 400))); return; }
          if (res.statusCode >= 400) reject(new Error(`${res.statusCode} ${JSON.stringify(json).slice(0, 600)}`));
          else resolve(json);
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
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
      ...(s.saveManualExecutions != null ? { saveManualExecutions: s.saveManualExecutions } : {}),
      ...(s.callerPolicy ? { callerPolicy: s.callerPolicy } : {}),
    },
  };
}

function beautify(wf) {
  const stickyIds = new Set(STICKIES.map((s) => s.id));
  wf.nodes = (wf.nodes || []).filter(
    (n) =>
      !(n.type === 'n8n-nodes-base.stickyNote' && String(n.name || '').startsWith('NOTE ·')) &&
      !stickyIds.has(n.id),
  );
  for (const n of wf.nodes) {
    if (POS[n.name]) n.position = [...POS[n.name]];
  }
  wf.nodes.push(...STICKIES);
  return wf;
}

async function main() {
  console.log('→ Beautify canvas SIMPLE-02 WhatsApp');
  let wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  beautify(wf);
  fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('  OK JSON local');

  if (!DEPLOY) {
    console.log('  Tip: node scripts/beautify-wa-canvas.js --deploy');
    return;
  }
  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('Sin N8N_API_KEY');
  const remote = await request('GET', `/api/v1/workflows/${WF_ID}`, null, apiKey);
  beautify(remote);
  await request('PUT', `/api/v1/workflows/${WF_ID}`, putSettings(remote), apiKey);
  console.log('  OK deploy n8n', WF_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
