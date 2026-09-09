/**
 * Embellece TODOS los workflows activos: más separación + sticky notes claras.
 *
 *   node scripts/beautify-all-canvases.js --deploy
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEPLOY = process.argv.includes('--deploy');
const ROOT = path.join(__dirname, '..');

const DX = 300; // más aire horizontal
const DY = 200; // más aire vertical
const Y0 = 480; // eje principal

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

function loadEnvValue(key, fallback = '') {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
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
  } catch {}
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

function applyLayout(wf, pos, stickies) {
  const stickyIds = new Set(stickies.map((s) => s.id));
  wf.nodes = (wf.nodes || []).filter(
    (n) =>
      !(
        n.type === 'n8n-nodes-base.stickyNote' &&
        String(n.name || '').startsWith('NOTE ·')
      ) && !stickyIds.has(n.id),
  );
  const missing = [];
  for (const n of wf.nodes) {
    if (pos[n.name]) n.position = [...pos[n.name]];
    else if (n.type !== 'n8n-nodes-base.stickyNote') missing.push(n.name);
  }
  wf.nodes.push(...stickies);
  return missing;
}

function col(i) {
  return 80 + i * DX;
}
function row(j) {
  return Y0 + j * DY;
}

/** ——— LAYOUTS ——— */

function layoutTg() {
  const pos = {
    'Telegram Trigger': [col(0), row(0)],
    'Set Variables': [col(1), row(0)],
    'Transcribir Audio TG': [col(2), row(0)],

    'Leer Stock Propiedades': [col(3.5), row(-1.5)],
    'Leer Historial': [col(3.5), row(-0.5)],
    'Leer Politicas Pago': [col(3.5), row(0.5)],
    'Leer Aprendizaje Matias TG': [col(3.5), row(1.5)],
    'Esperar Lecturas': [col(5), row(0)],

    'Construir Prompt': [col(6.2), row(0)],
    'IF Llamar IA TG': [col(7.4), row(0)],
    'HTTP Groq': [col(8.6), row(-0.8)],
    'Stub Groq Skip': [col(8.6), row(0.8)],
    'Parsear Respuesta': [col(10), row(0)],

    'IF Temperatura Caliente': [col(11.5), row(-3.2)],
    'Email Lead Caliente': [col(12.8), row(-3.8)],
    'Telegram Alerta Owner': [col(12.8), row(-2.6)],
    'IF Lead Completo': [col(11.5), row(-2)],
    'Guardar Lead': [col(12.8), row(-2)],
    'Actualizar Historial': [col(11.5), row(-0.9)],
    'Registrar Consulta Telegram': [col(11.5), row(0)],
    'Sync Leads_Bot': [col(11.5), row(0.9)],
    'Emit Lead Updated': [col(12.8), row(0.9)],
    'Emit Panel Realtime': [col(11.5), row(1.8)],
    'IF Registrar Aprendizaje TG': [col(11.5), row(2.7)],
    'Registrar Aprendizaje Matias TG': [col(12.8), row(2.7)],
    'IF Advisor Action': [col(11.5), row(3.6)],
    'Emit Advisor Action': [col(12.8), row(3.6)],

    'IF Debe Responder TG': [col(14.5), row(0)],
    'Telegram Responder': [col(15.7), row(0)],
    'Preparar Fotos Propiedad': [col(16.9), row(0)],
    'IF Tiene Fotos': [col(18.1), row(0)],
    'Telegram Enviar Foto': [col(19.3), row(-0.7)],
    'IF Ultima Foto': [col(20.5), row(-0.7)],
    'IF Tiene Cierre': [col(20.5), row(0.5)],
    'Telegram Mensaje Cierre': [col(21.7), row(0.5)],

    'IF Programar Reenvio RL': [col(14.5), row(2)],
    'Wait Reenvio Rate Limit': [col(15.7), row(2)],
    'Preparar Reenvio Rate Limit': [col(16.9), row(2)],
    'IF Reenvio Rate Limit': [col(18.1), row(2)],
    'IF Reenvio Son Fichas': [col(19.3), row(2)],
    'Override Fotos Reenvio RL': [col(20.5), row(1.4)],
    'Telegram Reenvio Texto RL': [col(20.5), row(2.6)],

    'Code - Preparar Registro Revision TG': [col(11.5), row(4.6)],
    'IF Registrar Conversaciones_Revision TG': [col(12.8), row(4.6)],
    'Google Sheets - Conversaciones_Revision TG': [col(14.1), row(4.6)],
  };
  const stickies = [
    sticky('sticky-titulo', 'NOTE · Mapa Matías', -60, row(-5), 640, 220, 4,
      `## Bot Telegram — mapa conceptual
Leé **izquierda → derecha**.
Cada color = una etapa. Zoom to Fit para ver todo.`),
    sticky('sticky-entrada', 'NOTE · 1 Entrada', col(0) - 40, row(-1.2), DX * 3.2, DY * 2.4, 5,
      `## 1 · Entrada
Telegram → variables → audio a texto.`),
    sticky('sticky-contexto', 'NOTE · 2 Contexto', col(3.2) - 20, row(-2.2), DX * 2.6, DY * 4.2, 3,
      `## 2 · Contexto
Stock · historial · políticas · aprendizaje → merge.`),
    sticky('sticky-ia', 'NOTE · 3 IA', col(6) - 20, row(-1.6), DX * 4.6, DY * 3.2, 6,
      `## 3 · IA (Groq)
Prompt → Groq **o** skip si bot pausado → parsear.`),
    sticky('sticky-persist', 'NOTE · 4 Guardar + Panel', col(11.2) - 20, row(-4.4), DX * 2.8, DY * 9.6, 2,
      `## 4 · Guardar y panel
Sheets · realtime · lead caliente · **alerta asesor**.`),
    sticky('sticky-salida', 'NOTE · 5 Respuesta', col(14.2) - 20, row(-1.4), DX * 8, DY * 2.8, 4,
      `## 5 · Respuesta al cliente
Texto → fotos de fichas → cierre.`),
    sticky('sticky-rescate', 'NOTE · 6 Rescate 429', col(14.2) - 20, row(1.3), DX * 7.2, DY * 2.4, 1,
      `## 6 · Rescate rate-limit
Espera ~60s y reenvía ficha/link si el cliente no escribió.`),
    sticky('sticky-revision', 'NOTE · 7 Revisión', col(11.2) - 20, row(4.1), DX * 3.5, DY * 1.6, 7,
      `## 7 · Revisión humana
Conversaciones_Revision para mejorar el tono.`),
  ];
  return { pos, stickies, file: 'workflows/Bot Telegram Inmobiliaria.json' };
}

function layoutWa() {
  const pos = {
    'Webhook WhatsApp Verify': [col(0), row(1.5)],
    'Respond - Verify Meta': [col(1), row(1.5)],
    'Webhook WhatsApp': [col(0), row(0)],
    'Code - Normalizar WhatsApp': [col(1), row(0)],
    'Transcribir Audio WA': [col(2), row(0)],
    'IF - Tiene Mensaje': [col(3), row(0)],

    'Google Sheets - Buscar Lead': [col(4.5), row(-0.8)],
    'Leer Stock Propiedades WA': [col(4.5), row(0.4)],
    'Leer Aprendizaje Matias': [col(4.5), row(1.6)],
    'IF - Lead Existe': [col(5.8), row(0)],
    'Google Sheets - Actualizar Lead': [col(7), row(-0.9)],
    'Google Sheets - Crear Lead': [col(7), row(0.9)],

    'Code - Armar Prompt': [col(8.5), row(0)],
    'IF - Debe Responder': [col(9.7), row(0)],
    'Basic LLM Chain': [col(10.9), row(-0.4)],
    'Groq Chat Model': [col(10.9), row(1)],
    'Code - Procesar IA': [col(12.1), row(0)],

    'IF - Interes Alto': [col(13.6), row(-2.4)],
    'HTTP - Email Lead Caliente': [col(14.8), row(-3)],
    'HTTP - Telegram Alerta Owner': [col(14.8), row(-1.8)],
    'Google Sheets - Actualizar Temperatura': [col(13.6), row(-0.9)],
    'Google Sheets - Registrar Consulta': [col(13.6), row(0.1)],
    'Emit Panel Realtime': [col(13.6), row(1.1)],
    'Emit Lead Updated': [col(14.8), row(1.1)],
    'IF Solicitud Visita WA': [col(13.6), row(2.1)],
    'Email Solicitud Visita WA': [col(14.8), row(2.1)],
    'IF Registrar Aprendizaje': [col(13.6), row(3.1)],
    'Registrar Aprendizaje Matias': [col(14.8), row(3.1)],

    'HTTP Request - Enviar WhatsApp': [col(16.3), row(0)],
    'Preparar Burbujas WA': [col(17.5), row(-1.1)],
    'IF Tiene Burbujas WA': [col(18.7), row(-1.1)],
    'Meta Enviar Burbuja': [col(19.9), row(-1.5)],
    'IF Ultima Burbuja WA': [col(21.1), row(-1.5)],
    'Preparar Fotos WA': [col(17.5), row(0.2)],
    'IF Tiene Fotos WA': [col(18.7), row(0.2)],
    'Meta Enviar Imagen': [col(19.9), row(0.2)],
    'IF Ultima Foto WA': [col(21.1), row(0.2)],
    'IF Tiene Cierre WA': [col(21.1), row(1.3)],
    'Meta Mensaje Cierre': [col(22.3), row(1.3)],

    'Code - Preparar Registro Revision WA': [col(13.6), row(4.2)],
    'IF Registrar Conversaciones_Revision WA': [col(14.8), row(4.2)],
    'Google Sheets - Conversaciones_Revision WA': [col(16), row(4.2)],
  };
  const stickies = [
    sticky('wa-sticky-titulo', 'NOTE · Mapa WhatsApp', -60, row(-4.2), 620, 200, 4,
      `## WhatsApp (Meta)
Mismo mapa que Telegram. Izquierda → derecha.`),
    sticky('wa-sticky-entrada', 'NOTE · 1 Entrada', col(0) - 40, row(-1), DX * 4, DY * 3.2, 5,
      `## 1 · Entrada
Webhook + verify · normalizar · audio.`),
    sticky('wa-sticky-contexto', 'NOTE · 2 Lead + Stock', col(4.2) - 20, row(-1.6), DX * 3.6, DY * 4, 3,
      `## 2 · Contexto
Buscar/crear lead · stock · aprendizaje.`),
    sticky('wa-sticky-ia', 'NOTE · 3 IA', col(8.3) - 20, row(-1.2), DX * 4.4, DY * 3, 6,
      `## 3 · IA
Prompt → Groq → procesar.`),
    sticky('wa-sticky-persist', 'NOTE · 4 Guardar', col(13.3) - 20, row(-3.6), DX * 2.8, DY * 8.2, 2,
      `## 4 · Persistencia
Temperatura · panel · visitas · aprendizaje.`),
    sticky('wa-sticky-salida', 'NOTE · 5 Envío', col(16) - 20, row(-2.2), DX * 7, DY * 4.2, 4,
      `## 5 · Envío Meta
Texto · burbujas · fotos · cierre.`),
    sticky('wa-sticky-rev', 'NOTE · 6 Revisión', col(13.3) - 20, row(3.7), DX * 3.5, DY * 1.5, 7,
      `## 6 · Revisión
Conversaciones_Revision.`),
  ];
  return { pos, stickies, file: 'workflows/SIMPLE-02 WhatsApp Bot.json' };
}

function layoutMs() {
  const pos = {
    'Webhook Messenger Verify': [col(0), row(1.5)],
    'Respond - Verify Meta': [col(1), row(1.5)],
    'Webhook Messenger': [col(0), row(0)],
    'Code - Normalizar Messenger': [col(1), row(0)],
    'IF - Tiene Mensaje': [col(2), row(0)],
    'Respond - OK': [col(3), row(1.2)],

    'Google Sheets - Buscar Lead': [col(3.5), row(-0.6)],
    'Leer Stock Propiedades MS': [col(3.5), row(0.8)],
    'IF - Lead Existe': [col(4.8), row(0)],
    'Google Sheets - Actualizar Lead': [col(6), row(-0.9)],
    'Google Sheets - Crear Lead': [col(6), row(0.9)],
    Merge: [col(7.2), row(0)],

    'Code - Armar Prompt': [col(8.5), row(0)],
    'Basic LLM Chain': [col(9.7), row(-0.3)],
    'Groq Chat Model': [col(9.7), row(1)],
    'Code - Procesar IA': [col(11), row(0)],

    'Google Sheets - Actualizar Temperatura': [col(12.5), row(-0.6)],
    'Emit Panel Realtime': [col(12.5), row(0.5)],
    'Emit Lead Updated': [col(13.7), row(0.5)],
    'IF Solicitud Visita MS': [col(12.5), row(1.6)],
    'Email Solicitud Visita MS': [col(13.7), row(1.6)],

    'HTTP Request - Enviar Messenger': [col(15.2), row(0)],
    'Preparar Burbujas MS': [col(16.4), row(-1.1)],
    'IF Tiene Burbujas MS': [col(17.6), row(-1.1)],
    'Meta Enviar Burbuja MS': [col(18.8), row(-1.5)],
    'IF Ultima Burbuja MS': [col(20), row(-1.5)],
    'Preparar Fotos MS': [col(16.4), row(0.2)],
    'IF Tiene Fotos MS': [col(17.6), row(0.2)],
    'Meta Enviar Caption MS': [col(18.8), row(0.9)],
    'Meta Enviar Imagen MS': [col(18.8), row(0)],
    'IF Ultima Foto MS': [col(20), row(0)],
    'IF Tiene Cierre MS': [col(20), row(1.2)],
    'Meta Mensaje Cierre MS': [col(21.2), row(1.2)],
    'Respond - Enviado OK': [col(22.4), row(0.4)],
  };
  const stickies = [
    sticky('ms-sticky-titulo', 'NOTE · Mapa Messenger', -60, row(-3.8), 600, 180, 4,
      `## Messenger (Meta)
Mismo mapa conceptual que WA/TG.`),
    sticky('ms-sticky-entrada', 'NOTE · 1 Entrada', col(0) - 40, row(-1), DX * 3.4, DY * 3.2, 5,
      `## 1 · Entrada
Webhook + verify · normalizar.`),
    sticky('ms-sticky-contexto', 'NOTE · 2 Lead', col(3.2) - 20, row(-1.6), DX * 4.6, DY * 3.4, 3,
      `## 2 · Lead + stock
Buscar/crear · merge.`),
    sticky('ms-sticky-ia', 'NOTE · 3 IA', col(8.3) - 20, row(-1.2), DX * 3.4, DY * 2.8, 6,
      `## 3 · IA Groq`),
    sticky('ms-sticky-persist', 'NOTE · 4 Panel', col(12.2) - 20, row(-1.4), DX * 2.6, DY * 3.8, 2,
      `## 4 · Guardar + panel`),
    sticky('ms-sticky-salida', 'NOTE · 5 Envío', col(15) - 20, row(-2.2), DX * 8, DY * 4.2, 4,
      `## 5 · Respuesta Messenger
Burbujas · fotos · cierre.`),
  ];
  return { pos, stickies, file: 'workflows/SIMPLE-03 Messenger Bot.json' };
}

function layoutS04() {
  const pos = {
    'Webhook Test': [col(0), row(-1.2)],
    'Schedule Trigger': [col(0), row(0)],
    'Manual Trigger': [col(0), row(1.2)],
    'Google Sheets - Read': [col(1.5), row(0)],
    'Filtrar Candidatos': [col(2.8), row(0)],
    'IF Hay Candidatos': [col(4), row(0)],
    'Split In Batches': [col(5.3), row(0)],
    'Switch Canal': [col(6.6), row(0)],
    'Enviar Telegram': [col(8), row(-1.2)],
    'Meta Enviar WhatsApp': [col(8), row(0)],
    'Enviar Messenger': [col(8), row(1.2)],
    'Google Sheets - Update': [col(9.4), row(0)],
    'Emit Panel Realtime': [col(10.7), row(0.9)],
  };
  const stickies = [
    sticky('s04-sticky-titulo', 'NOTE · Seguimiento', -40, row(-2.6), 520, 160, 4,
      `## SIMPLE-04 — Follow-up automático
Cron → candidatos tibios → mensaje por canal.`),
    sticky('s04-sticky-1', 'NOTE · 1 Disparadores', col(0) - 40, row(-1.8), DX * 1.8, DY * 3.8, 5,
      `## 1 · Disparadores
Schedule · manual · webhook test.`),
    sticky('s04-sticky-2', 'NOTE · 2 Filtrar', col(1.3) - 20, row(-1), DX * 4.4, DY * 2.4, 3,
      `## 2 · Selección
Lee Leads_Bot → filtra inactivos tibios.`),
    sticky('s04-sticky-3', 'NOTE · 3 Enviar', col(6.4) - 20, row(-2), DX * 5, DY * 4, 4,
      `## 3 · Envío por canal
TG · WA · Messenger → update Sheets → panel.`),
  ];
  return { pos, stickies, file: 'workflows/SIMPLE-04 Seguimiento Automatico.json' };
}

function layoutCita() {
  const pos = {
    'Webhook Form GET': [col(0), row(-1.2)],
    'Leer Agenda Libre': [col(1.3), row(-1.2)],
    'Armar HTML Form': [col(2.6), row(-1.2)],
    'Responder HTML Form': [col(3.9), row(-1.2)],

    'Webhook Form POST': [col(0), row(1)],
    'Parsear Submit': [col(1.3), row(1)],
    'Leer Agenda Check': [col(2.6), row(1)],
    'Validar Slot Libre': [col(3.9), row(1)],
    'IF Slot OK': [col(5.2), row(1)],
    'Reservar Slot a_confirmar': [col(6.6), row(0.2)],
    'Email Cita Gmail': [col(6.6), row(1.4)],
    'Marcar Lead Cita': [col(8), row(0.2)],
    'HTML Gracias': [col(8), row(1.4)],
    'Responder HTML Gracias': [col(9.4), row(1.4)],
  };
  const stickies = [
    sticky('cita-sticky-titulo', 'NOTE · Citas', -40, row(-2.8), 480, 140, 4,
      `## CITA-01 — Formulario de visita`),
    sticky('cita-sticky-get', 'NOTE · A Mostrar form', col(0) - 40, row(-2), DX * 4.6, DY * 1.8, 5,
      `## A · GET — mostrar formulario
Lee agenda libre → HTML.`),
    sticky('cita-sticky-post', 'NOTE · B Reservar', col(0) - 40, row(0.2), DX * 10.2, DY * 2.8, 3,
      `## B · POST — reservar turno
Valida slot → reserva → email → actualiza lead.`),
  ];
  return { pos, stickies, file: null };
}

function layoutP01() {
  const pos = {
    'Webhook Leads': [col(0), row(0)],
    'Check Panel Auth': [col(1.2), row(0)],
    'IF Panel Auth OK': [col(2.4), row(0)],
    'Responder Auth Fail': [col(2.4), row(1.4)],
    'Payload Cache Gate': [col(3.7), row(0)],
    'IF Cache Hit': [col(5), row(0)],
    'Leer Leads_Bot': [col(6.3), row(-0.9)],
    'Leer Consultas': [col(7.5), row(-0.9)],
    'Leer Historial Chat': [col(8.7), row(-0.9)],
    'Stock Cache Gate': [col(10), row(0)],
    'IF Need Stock Read': [col(11.2), row(0)],
    'Leer Stock Propiedades': [col(12.4), row(-0.9)],
    'Armar Payload Panel': [col(12.4), row(0.8)],
    'Responder JSON': [col(13.8), row(0)],
  };
  const stickies = [
    sticky('p01-sticky', 'NOTE · PANEL-01', -40, row(-2.2), 520, 160, 4,
      `## PANEL-01 — API del panel
Auth → cache → Sheets → JSON para el front.`),
    sticky('p01-sticky-auth', 'NOTE · 1 Auth', col(0) - 30, row(-0.9), DX * 3.2, DY * 2.8, 5,
      `## 1 · Auth`),
    sticky('p01-sticky-data', 'NOTE · 2 Datos', col(3.5) - 20, row(-1.7), DX * 10.8, DY * 3.4, 3,
      `## 2 · Lectura Sheets + cache
Leads · consultas · historial · stock → payload.`),
  ];
  return { pos, stickies, file: null };
}

function layoutP02() {
  const pos = {
    'Webhook Envio Masivo': [col(0), row(0)],
    'Check Panel Auth': [col(1.2), row(0)],
    'IF Panel Auth OK': [col(2.4), row(0)],
    'Responder Auth Fail': [col(2.4), row(1.4)],
    'Preparar Destinos': [col(3.7), row(0)],
    'IF Payload Valido': [col(5), row(0)],
    'Responder Error': [col(5), row(1.4)],
    'Telegram sendMessage': [col(6.3), row(-0.6)],
    'Mapear Resultado': [col(7.5), row(-0.6)],
    'Agregar Resultados': [col(8.7), row(-0.6)],
    'Envelope OK': [col(9.9), row(-0.6)],
    'Responder OK': [col(11.1), row(-0.6)],
    'IF Emit OK': [col(7.5), row(1.2)],
    'Leer Historial Panel': [col(8.7), row(1.2)],
    'Append Historial Asesor': [col(9.9), row(1.2)],
    'Actualizar Historial Panel': [col(11.1), row(1.2)],
    'Emit Chat Realtime': [col(12.3), row(1.2)],
  };
  const stickies = [
    sticky('p02-sticky', 'NOTE · PANEL-02', -40, row(-2), 520, 140, 4,
      `## PANEL-02 — Envío masivo Telegram`),
    sticky('p02-sticky-1', 'NOTE · 1 Auth + prep', col(0) - 30, row(-0.9), DX * 5.6, DY * 2.8, 5,
      `## 1 · Auth y destinos`),
    sticky('p02-sticky-2', 'NOTE · 2 Enviar', col(6.1) - 20, row(-1.5), DX * 5.6, DY * 1.8, 4,
      `## 2 · Envío + respuesta`),
    sticky('p02-sticky-3', 'NOTE · 3 Historial', col(7.3) - 20, row(0.6), DX * 5.6, DY * 1.8, 3,
      `## 3 · Historial asesor + realtime`),
  ];
  return { pos, stickies, file: null };
}

function layoutP03() {
  const pos = {
    'Webhook Stock Update': [col(0), row(0)],
    'Check Panel Auth': [col(1.2), row(0)],
    'IF Panel Auth OK': [col(2.4), row(0)],
    'Responder Auth Fail': [col(2.4), row(1.4)],
    'Preparar Patch': [col(3.7), row(0)],
    'IF Patch Valido': [col(5), row(0)],
    'Responder Error': [col(5), row(1.4)],
    'Mapear Fila Input': [col(6.3), row(-0.6)],
    'Actualizar Stock': [col(7.5), row(-0.6)],
    'Emit WS stock.updated': [col(8.7), row(-0.6)],
    'Responder OK': [col(9.9), row(-0.6)],
  };
  const stickies = [
    sticky('p03-sticky', 'NOTE · PANEL-03', -40, row(-2), 480, 140, 4,
      `## PANEL-03 — Actualizar stock desde el panel`),
    sticky('p03-sticky-1', 'NOTE · Flujo', col(0) - 30, row(-1.2), DX * 10.5, DY * 3.2, 3,
      `## Auth → validar patch → Sheets → WS → OK`),
  ];
  return { pos, stickies, file: null };
}

function layoutP04() {
  const pos = {
    'Webhook Realtime Emit': [col(0), row(0)],
    'Normalizar Evento': [col(1.5), row(0)],
    'Forward WS Bridge': [col(3), row(0)],
    'Responder OK': [col(4.5), row(0)],
  };
  const stickies = [
    sticky('p04-sticky', 'NOTE · PANEL-04', -40, row(-1.6), DX * 6, DY * 2.6, 4,
      `## PANEL-04 — Bridge realtime
Webhook → normalizar → ws-bridge (:3099).`),
  ];
  return { pos, stickies, file: null };
}

function layoutP05() {
  const pos = {
    'Webhook Acciones Lead': [col(0), row(0)],
    'Check Panel Auth': [col(1.2), row(0)],
    'IF Panel Auth OK': [col(2.4), row(0)],
    'Responder Auth Fail': [col(2.4), row(1.4)],
    'Preparar Accion': [col(3.7), row(0)],
    'IF Accion Valida': [col(5), row(0)],
    'Responder Error': [col(5), row(1.4)],
    'IF Send WhatsApp': [col(6.3), row(0)],
    'Meta Enviar WhatsApp': [col(7.6), row(-1)],
    'Envelope WA': [col(8.8), row(-1)],
    'Emit Chat WA': [col(10), row(-1)],
    'Actualizar Seguimiento Sheets': [col(7.6), row(1)],
    'Envelope Seguimiento': [col(8.8), row(1)],
    'Emit Lead Updated': [col(10), row(1)],
    'Responder OK': [col(11.3), row(0)],
  };
  const stickies = [
    sticky('p05-sticky', 'NOTE · PANEL-05', -40, row(-2.4), 520, 140, 4,
      `## PANEL-05 — Acciones del lead`),
    sticky('p05-sticky-1', 'NOTE · 1 Auth', col(0) - 30, row(-0.9), DX * 5.6, DY * 2.8, 5,
      `## 1 · Auth + validar acción`),
    sticky('p05-sticky-2', 'NOTE · 2 Ramas', col(6.1) - 20, row(-1.8), DX * 5.8, DY * 3.8, 3,
      `## 2 · WhatsApp **o** seguimiento Sheets
Ambas terminan en Responder OK.`),
  ];
  return { pos, stickies, file: null };
}

function layoutP06() {
  const pos = {
    'Webhook Assistant': [col(0), row(0)],
    'Armar Prompt': [col(1.5), row(0)],
    'HTTP Groq': [col(3), row(0)],
    'Parsear Speech': [col(4.5), row(0)],
    'Responder JSON': [col(6), row(0)],
  };
  const stickies = [
    sticky('p06-sticky', 'NOTE · PANEL-06', -40, row(-1.6), DX * 7.2, DY * 2.6, 4,
      `## PANEL-06 — Asistente del panel
Webhook → prompt → Groq → speech JSON.`),
  ];
  return { pos, stickies, file: null };
}

const WORKFLOWS = [
  { id: '8JoSfkcn3pE1f0av', label: 'Bot Telegram', layout: layoutTg },
  { id: 'npq6sC6YLaUBpHac', label: 'SIMPLE-02 WA', layout: layoutWa },
  { id: 'XhceE1kxNalCTMw4', label: 'SIMPLE-03 MS', layout: layoutMs },
  { id: 'U7Ec6hIatY4t47Fu', label: 'SIMPLE-04 Seg', layout: layoutS04 },
  { id: 'BV13GbhJrIjzBpKf', label: 'CITA-01', layout: layoutCita },
  { id: 'TfGR4Uhq2TnSBFLw', label: 'PANEL-01', layout: layoutP01 },
  { id: 'ZhesATaZTLCLjscv', label: 'PANEL-02', layout: layoutP02 },
  { id: 'XpgowGRcMck5vTNk', label: 'PANEL-03', layout: layoutP03 },
  { id: 'BFMfcYsVAuZF0Vto', label: 'PANEL-04', layout: layoutP04 },
  { id: '2JCWQgcxk5t9tMEt', label: 'PANEL-05', layout: layoutP05 },
  { id: '2r1VShrbZAxha60T', label: 'PANEL-06', layout: layoutP06 },
];

async function main() {
  console.log('→ Beautify ALL active canvases (más aire + stickies)');
  const apiKey = DEPLOY ? loadApiKey() : '';
  if (DEPLOY && !apiKey) throw new Error('Sin N8N_API_KEY');

  for (const meta of WORKFLOWS) {
    const { pos, stickies, file } = meta.layout();
    console.log(`\n  ${meta.label}`);

    if (file) {
      const localPath = path.join(ROOT, file);
      if (fs.existsSync(localPath)) {
        const local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        const miss = applyLayout(local, pos, stickies);
        fs.writeFileSync(localPath, JSON.stringify(local, null, 2) + '\n', 'utf8');
        console.log('    OK JSON', file, miss.length ? `(sin pos: ${miss.join(', ')})` : '');
      }
    }

    if (!DEPLOY) continue;

    const remote = await request('GET', `/api/v1/workflows/${meta.id}`, null, apiKey);
    const miss = applyLayout(remote, pos, stickies);
    await request('PUT', `/api/v1/workflows/${meta.id}`, putSettings(remote), apiKey);
    console.log(
      '    OK deploy',
      meta.id,
      miss.length ? `(sin pos: ${miss.join(', ')})` : '',
    );
  }

  if (!DEPLOY) console.log('\n  Tip: node scripts/beautify-all-canvases.js --deploy');
  else console.log('\n  Listo. En n8n: Zoom to Fit en cada workflow.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
