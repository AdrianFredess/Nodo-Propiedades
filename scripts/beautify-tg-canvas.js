/**
 * Reordena "Bot Telegram Inmobiliaria" como mapa conceptual:
 * zonas horizontales + sticky notes explicativas.
 *
 *   node scripts/beautify-tg-canvas.js
 *   node scripts/beautify-tg-canvas.js --deploy
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEPLOY = process.argv.includes('--deploy');
const WF_ID = '8JoSfkcn3pE1f0av';
const WF_PATH = path.join(
  __dirname,
  '..',
  'workflows',
  'Bot Telegram Inmobiliaria.json',
);

const Y = 420; // eje principal
const DX = 240;

/** Posiciones: mapa de izquierda a derecha */
const POS = {
  // 1 — ENTRADA
  'Telegram Trigger': [80, Y],
  'Set Variables': [80 + DX, Y],
  'Transcribir Audio TG': [80 + DX * 2, Y],

  // 2 — CONTEXTO (abanico → merge)
  'Leer Stock Propiedades': [80 + DX * 3.2, Y - 240],
  'Leer Historial': [80 + DX * 3.2, Y - 80],
  'Leer Politicas Pago': [80 + DX * 3.2, Y + 80],
  'Leer Aprendizaje Matias TG': [80 + DX * 3.2, Y + 240],
  'Esperar Lecturas': [80 + DX * 4.4, Y],

  // 3 — IA
  'Construir Prompt': [80 + DX * 5.6, Y],
  'IF Llamar IA TG': [80 + DX * 6.8, Y],
  'HTTP Groq': [80 + DX * 8, Y - 120],
  'Stub Groq Skip': [80 + DX * 8, Y + 120],
  'Parsear Respuesta': [80 + DX * 9.2, Y],

  // 4 — PERSISTENCIA / PANEL (columna bajo parsear)
  'Actualizar Historial': [80 + DX * 10.6, Y - 360],
  'IF Lead Completo': [80 + DX * 10.6, Y - 520],
  'Guardar Lead': [80 + DX * 11.8, Y - 520],
  'Registrar Consulta Telegram': [80 + DX * 10.6, Y - 200],
  'Sync Leads_Bot': [80 + DX * 10.6, Y - 40],
  'Emit Lead Updated': [80 + DX * 11.8, Y - 40],
  'Emit Panel Realtime': [80 + DX * 10.6, Y + 120],
  'IF Registrar Aprendizaje TG': [80 + DX * 10.6, Y + 280],
  'Registrar Aprendizaje Matias TG': [80 + DX * 11.8, Y + 280],
  'IF Advisor Action': [80 + DX * 10.6, Y + 440],
  'Emit Advisor Action': [80 + DX * 11.8, Y + 440],
  'IF Temperatura Caliente': [80 + DX * 10.6, Y - 680],
  'Email Lead Caliente': [80 + DX * 11.8, Y - 760],
  'Telegram Alerta Owner': [80 + DX * 11.8, Y - 600],

  // 5 — SALIDA CLIENTE
  'IF Debe Responder TG': [80 + DX * 13.2, Y],
  'Telegram Responder': [80 + DX * 14.4, Y],
  'Preparar Fotos Propiedad': [80 + DX * 15.6, Y],
  'IF Tiene Fotos': [80 + DX * 16.8, Y],
  'Telegram Enviar Foto': [80 + DX * 18, Y - 100],
  'IF Ultima Foto': [80 + DX * 19.2, Y - 100],
  'IF Tiene Cierre': [80 + DX * 19.2, Y + 60],
  'Telegram Mensaje Cierre': [80 + DX * 20.4, Y + 60],

  // 6 — RESCATE RATE LIMIT
  'IF Programar Reenvio RL': [80 + DX * 13.2, Y + 280],
  'Wait Reenvio Rate Limit': [80 + DX * 14.4, Y + 280],
  'Preparar Reenvio Rate Limit': [80 + DX * 15.6, Y + 280],
  'IF Reenvio Rate Limit': [80 + DX * 16.8, Y + 280],
  'IF Reenvio Son Fichas': [80 + DX * 18, Y + 280],
  'Override Fotos Reenvio RL': [80 + DX * 19.2, Y + 200],
  'Telegram Reenvio Texto RL': [80 + DX * 19.2, Y + 360],

  // 7 — REVISIÓN HUMANA
  'Code - Preparar Registro Revision TG': [80 + DX * 10.6, Y + 620],
  'IF Registrar Conversaciones_Revision TG': [80 + DX * 11.8, Y + 620],
  'Google Sheets - Conversaciones_Revision TG': [80 + DX * 13, Y + 620],
};

function sticky(id, name, x, y, width, height, color, content) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [x, y],
    parameters: {
      content,
      width,
      height,
      color,
    },
  };
}

/** Stickies detrás de cada zona (color 1=amarillo … 7=gris) */
const STICKIES = [
  sticky(
    'sticky-titulo',
    'NOTE · Mapa Matías',
    -40,
    Y - 920,
    520,
    200,
    4,
    `## Bot Telegram — mapa del flujo
Canal productivo \`@nodoprop_bot\`.
Leé de izquierda a derecha: **Entrada → Contexto → IA → Guardar → Responder**.
Las ramas de abajo/arriba son soporte (panel, alertas, rescate).`,
  ),
  sticky(
    'sticky-entrada',
    'NOTE · 1 Entrada',
    40,
    Y - 160,
    680,
    280,
    5,
    `## 1 · Entrada
Mensaje de Telegram → variables (\`chat_id\`, texto) → audio a texto si hace falta.`,
  ),
  sticky(
    'sticky-contexto',
    'NOTE · 2 Contexto',
    760,
    Y - 360,
    520,
    720,
    3,
    `## 2 · Contexto (Sheets)
Lee en paralelo: **stock**, **historial**, **políticas de pago**, **aprendizaje**.
\`Esperar Lecturas\` une todo antes del prompt.`,
  ),
  sticky(
    'sticky-ia',
    'NOTE · 3 IA',
    1360,
    Y - 280,
    720,
    520,
    6,
    `## 3 · Inteligencia (Groq)
Arma el prompt → si el bot está pausado **no llama** a Groq (\`Stub\`) → parsea temperatura, fichas, handoff y flags de rescate.`,
  ),
  sticky(
    'sticky-persist',
    'NOTE · 4 Guardar + Panel',
    2480,
    Y - 900,
    720,
    1580,
    2,
    `## 4 · Persistencia y panel
Guarda historial/leads, emite al panel en vivo, alerta lead caliente, y si hace falta avisa al asesor (\`Emit Advisor Action\`).`,
  ),
  sticky(
    'sticky-salida',
    'NOTE · 5 Respuesta',
    3160,
    Y - 200,
    1480,
    400,
    4,
    `## 5 · Respuesta al cliente
Texto → fotos de fichas (si hay) → mensaje de cierre.
Acá se cumple la promesa de “te muestro opciones”.`,
  ),
  sticky(
    'sticky-rescate',
    'NOTE · 6 Rescate 429',
    3160,
    Y + 160,
    1480,
    360,
    1,
    `## 6 · Rescate rate-limit
Si Groq se quedó sin tokens: espera ~60s y **reenvía** ficha o link si el cliente no escribió.`,
  ),
  sticky(
    'sticky-revision',
    'NOTE · 7 Revisión',
    2480,
    Y + 540,
    900,
    220,
    7,
    `## 7 · Revisión humana
Registra turnos raros / rate-limit en \`Conversaciones_Revision\` para mejorar el tono.`,
  ),
];

function loadEnvValue(key, fallback = '') {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    const m = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    /* ignore */
  }
  return process.env[key] || fallback;
}

function loadApiKey() {
  const fromEnv = loadEnvValue('N8N_API_KEY', '');
  if (fromEnv) return fromEnv;
  try {
    const mcp = path.join(
      process.env.USERPROFILE || '',
      '.cursor',
      'mcp.json',
    );
    const j = JSON.parse(fs.readFileSync(mcp, 'utf8'));
    const s = j.mcpServers?.['user-n8n'] || j.mcpServers?.n8n;
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  } catch {
    /* ignore */
  }
  return '';
}

function request(method, urlPath, body, apiKey) {
  const base = loadEnvValue('N8N_API_URL', 'http://127.0.0.1:5678').replace(
    /\/$/,
    '',
  );
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

function beautify(wf) {
  // Quitar stickies viejos de este script
  const stickyIds = new Set(STICKIES.map((s) => s.id));
  wf.nodes = (wf.nodes || []).filter(
    (n) =>
      n.type !== 'n8n-nodes-base.stickyNote' ||
      !String(n.name || '').startsWith('NOTE ·'),
  );
  // También por id
  wf.nodes = wf.nodes.filter((n) => !stickyIds.has(n.id));

  for (const n of wf.nodes) {
    const pos = POS[n.name];
    if (pos) n.position = [...pos];
  }

  const missing = Object.keys(POS).filter(
    (name) => !wf.nodes.some((n) => n.name === name),
  );
  if (missing.length) {
    console.warn('  WARN nodos faltantes:', missing.join(', '));
  }

  wf.nodes.push(...STICKIES);
  return wf;
}

async function main() {
  console.log('→ Beautify canvas Bot Telegram Inmobiliaria');

  let wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  beautify(wf);
  fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('  OK JSON local:', WF_PATH);
  console.log(
    '  Nodos:',
    wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').length,
    '+ stickies',
    STICKIES.length,
  );

  if (!DEPLOY) {
    console.log('  Tip: node scripts/beautify-tg-canvas.js --deploy');
    return;
  }

  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('Sin N8N_API_KEY');

  const remote = await request('GET', `/api/v1/workflows/${WF_ID}`, null, apiKey);
  const wasActive = Boolean(remote.active);
  beautify(remote);
  await request('PUT', `/api/v1/workflows/${WF_ID}`, putSettings(remote), apiKey);
  console.log('  OK deploy n8n', WF_ID, wasActive ? '(sigue activo)' : '');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
