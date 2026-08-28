/**
 * Bridge realtime Nodo Propiedades
 * - WS  : ws://HOST:PORT/ws  (clientes del panel)
 * - HTTP: POST /emit         (n8n / bots → broadcast)
 * - GET /health
 *
 * Eventos típicos: lead.updated | chat.message | stock.updated | leads.refresh
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { synthesizeArgentine, ttsInfo } from './tts.js';

const PORT = Number(process.env.WS_BRIDGE_PORT || 3099);
const HOST = process.env.WS_BRIDGE_HOST || '0.0.0.0';
const TOKEN = String(process.env.WS_BRIDGE_TOKEN || '').trim();

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set();

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bridge-Token',
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function tokenOk(req, body) {
  if (!TOKEN) return true;
  const header =
    req.headers['x-bridge-token'] ||
    (String(req.headers.authorization || '').startsWith('Bearer ')
      ? String(req.headers.authorization).slice(7)
      : '');
  const fromBody = body && typeof body.token === 'string' ? body.token : '';
  return String(header || fromBody).trim() === TOKEN;
}

function broadcast(event) {
  const msg = JSON.stringify(event);
  let sent = 0;
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(msg);
      sent += 1;
    }
  }
  return sent;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      clients: clients.size,
      port: PORT,
      auth: Boolean(TOKEN),
      tts: ttsInfo(),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/tts') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      json(res, 400, { ok: false, error: 'json_invalido' });
      return;
    }
    const text = String(body.text || '').trim();
    if (!text) {
      json(res, 400, { ok: false, error: 'text_requerido' });
      return;
    }
    try {
      const audio = await synthesizeArgentine(text, {
        voice: body.voice,
        rate: typeof body.rate === 'number' ? body.rate : undefined,
        pitch: typeof body.pitch === 'string' ? body.pitch : undefined,
      });
      res.writeHead(200, {
        'Content-Type': 'audio/webm',
        'Content-Length': audio.length,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bridge-Token',
        'Cache-Control': 'no-store',
      });
      res.end(audio);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'tts_error';
      console.error('[tts]', msg);
      json(res, 500, { ok: false, error: msg });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/emit') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      json(res, 400, { ok: false, error: 'json_invalido' });
      return;
    }
    if (!tokenOk(req, body)) {
      json(res, 401, { ok: false, error: 'token_invalido' });
      return;
    }
    const type = String(body.type || body.event || '').trim();
    if (!type) {
      json(res, 400, { ok: false, error: 'type_requerido' });
      return;
    }
    const payload =
      body.payload !== undefined
        ? body.payload
        : (() => {
            const { type: _t, event: _e, token: _tok, payload: _p, ...rest } =
              body;
            return rest;
          })();
    const event = {
      type,
      payload,
      at: new Date().toISOString(),
    };
    const sent = broadcast(event);
    console.log(`[emit] ${type} → ${sent} client(s)`);
    json(res, 200, { ok: true, type, sent, at: event.at });
    return;
  }

  json(res, 404, { ok: false, error: 'not_found' });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(
    JSON.stringify({
      type: 'bridge.hello',
      payload: { clients: clients.size },
      at: new Date().toISOString(),
    }),
  );
  ws.on('message', (data) => {
    const text = String(data || '');
    if (text === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
    }
  });
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

server.listen(PORT, HOST, () => {
  console.log(`[ws-bridge] http://${HOST}:${PORT}/health`);
  console.log(`[ws-bridge] ws://${HOST}:${PORT}/ws`);
  console.log(`[ws-bridge] POST /emit  auth=${TOKEN ? 'on' : 'off'}`);
  console.log(`[ws-bridge] POST /tts   voz=${ttsInfo().voice}`);
});
