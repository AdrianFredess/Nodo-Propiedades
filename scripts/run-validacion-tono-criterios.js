/**
 * Validación tesis — criterios tono + criterio 10.
 * Empareja por texto_usuario exacto (+ usedIds para mensajes repetidos).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'validacion');
const WF_ID = '8JoSfkcn3pE1f0av';
const SECRET = `${WF_ID}_a1b2c3d4-0001-0001-0001-000000000001`;
const WH_PATH = '/webhook/f0e1d2c3-b4a5-9687-8765-inmobiliaria01/webhook';
const CHAT_ID = Number(process.env.VALIDACION_CHAT_ID || '999888777');

function loadApiKey() {
  const mcp = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.cursor', 'mcp.json'), 'utf8'),
  );
  for (const s of Object.values(mcp.mcpServers || {})) {
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  }
  throw new Error('Sin N8N_API_KEY');
}
const API_KEY = loadApiKey();

function api(method, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: { 'X-N8N-API-KEY': API_KEY },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null });
          } catch {
            resolve({ status: res.statusCode, raw: buf });
          }
        });
      },
    );
    r.on('error', reject);
    r.end();
  });
}

function postWebhook(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: WH_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-Telegram-Bot-Api-Secret-Token': SECRET,
        },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, raw: buf }));
      },
    );
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

function extract(exec) {
  const run = exec?.data?.resultData?.runData || {};
  const pick = (name) => {
    const arr = run[name];
    if (!arr?.[0]?.data?.main?.[0]?.[0]) return null;
    return arr[0].data.main[0][0].json || null;
  };
  const parsear = pick('Parsear Respuesta');
  const tg = pick('Telegram Responder');
  const groq = pick('HTTP Groq');
  const set = pick('Set Variables');
  return {
    texto_usuario: String(parsear?.texto_usuario || set?.texto_usuario || ''),
    respuesta_bot: String(parsear?.respuesta_bot || ''),
    mensaje_cierre: String(parsear?.mensaje_cierre || ''),
    propiedades_mostrar: String(parsear?.propiedades_mostrar || '[]'),
    rate_limit: Boolean(parsear?.rate_limit),
    temperatura: String(parsear?.temperatura || ''),
    telegram_text: String(tg?.result?.text || tg?.text || ''),
    groq_error: groq?.error || null,
    status: exec?.status,
    startedAt: exec?.startedAt,
    id: exec?.id,
  };
}

async function waitMatch(expectedText, afterIso, usedIds, timeoutMs = 150000) {
  const t0 = Date.now();
  const probed = new Set();
  while (Date.now() - t0 < timeoutMs) {
    const list = await api(
      'GET',
      `/api/v1/executions?workflowId=${WF_ID}&limit=25&includeData=false`,
    );
    const rows = list.json?.data || [];
    for (const row of rows) {
      const id = String(row.id);
      if (usedIds.has(id) || probed.has(id)) continue;
      if (afterIso && row.startedAt && row.startedAt < afterIso) continue;
      if (row.status !== 'success' && row.status !== 'error') continue;
      probed.add(id);
      const full = await api('GET', `/api/v1/executions/${row.id}?includeData=true`);
      const ex = extract(full.json);
      if (ex.texto_usuario === expectedText) {
        usedIds.add(id);
        return ex;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function send(text, msgId, usedIds) {
  const afterIso = new Date().toISOString();
  const payload = {
    update_id: Date.now() % 1e9,
    message: {
      message_id: msgId,
      from: {
        id: CHAT_ID,
        is_bot: false,
        first_name: 'Validacion',
        last_name: 'Tesis',
        username: 'validacion_tesis_nodo',
      },
      chat: {
        id: CHAT_ID,
        first_name: 'Validacion',
        last_name: 'Tesis',
        username: 'validacion_tesis_nodo',
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
  const wh = await postWebhook(payload);
  const t0 = Date.now();
  const matched = await waitMatch(text, afterIso, usedIds);
  return {
    ok: Boolean(matched),
    text,
    webhookStatus: wh.status,
    ms: Date.now() - t0,
    ...(matched || { error: 'sin_match_texto_usuario' }),
  };
}

const SCENARIOS = [
  { id: 'criterio-1-saludo', label: 'Criterio 1 — Saludo', messages: ['hola'], gapMs: 28000 },
  {
    id: 'criterio-2-fichas',
    label: 'Criterio 2 — Pedido de fichas',
    messages: ['enviame lo que tengas'],
    gapMs: 28000,
  },
  {
    id: 'criterio-4-recontacto',
    label: 'Criterio 4 — Recontacto (saludo corto)',
    messages: ['hola como andas'],
    gapMs: 28000,
  },
  {
    id: 'criterio-5-repetido',
    label: 'Criterio 5 — Mensaje repetido',
    messages: ['tenes algo en Maipu', 'tenes algo en Maipu'],
    gapMs: 28000,
  },
  {
    id: 'criterio-informal',
    label: 'Criterio informal/grosero',
    messages: ['che boludo mandame deptos baratos'],
    gapMs: 28000,
  },
  {
    id: 'criterio-10-rafaga',
    label: 'Criterio 10 — Rafaga 5 msgs <1 min',
    messages: ['hola', 'busco depto', 'hasta 90 mil', 'en godoy cruz', 'mostrame opciones'],
    gapMs: 2500,
  },
];

async function main() {
  console.log('chat', CHAT_ID);
  console.log('Esperando 40s para bajar TPM Groq…');
  await new Promise((r) => setTimeout(r, 40000));
  try {
    await api('POST', `/api/v1/workflows/${WF_ID}/activate`);
  } catch (_) {}

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(OUT_DIR, `transcripciones-tono-${stamp}.md`);
  const lines = [];
  lines.push('# Transcripciones validacion tono / 429 (match por texto_usuario)');
  lines.push('');
  lines.push(`- Fecha: ${new Date().toISOString()}`);
  lines.push('- n8n: 2.12.3 (npx) + ngrok');
  lines.push(`- Workflow: Bot Telegram Inmobiliaria (${WF_ID})`);
  lines.push(`- chat_id prueba: ${CHAT_ID}`);
  lines.push('');
  lines.push('> Fuente: ejecuciones n8n; emparejado por texto_usuario == mensaje enviado.');
  lines.push('');

  const usedIds = new Set();
  let msgId = 940000 + Math.floor(Math.random() * 1000);
  const burstStart = Date.now();

  for (const sc of SCENARIOS) {
    console.log('\n===', sc.label, '===');
    lines.push(`## ${sc.label}`);
    lines.push('');
    lines.push(`id: \`${sc.id}\``);
    lines.push('');
    for (const m of sc.messages) {
      msgId += 1;
      console.log('->', m);
      const res = await send(m, msgId, usedIds);
      console.log(
        '<-',
        res.ok ? res.respuesta_bot : res.error,
        `(${res.ms}ms) exec=${res.id || '-'}`,
      );
      lines.push('### Turno');
      lines.push('');
      lines.push(`**Cliente:** ${m}`);
      lines.push('');
      if (!res.ok) {
        lines.push(`**Bot:** _(fallo: ${res.error})_`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(res, null, 2));
        lines.push('```');
      } else {
        lines.push(`**Bot (Parsear.respuesta_bot):** ${res.respuesta_bot || '_(vacio)_'}`);
        if (res.mensaje_cierre) {
          lines.push('');
          lines.push(`**Cierre:** ${res.mensaje_cierre}`);
        }
        lines.push('');
        lines.push(`- exec_id: ${res.id}`);
        lines.push(`- status: ${res.status}`);
        lines.push(`- propiedades_mostrar: \`${res.propiedades_mostrar}\``);
        lines.push(`- rate_limit: ${res.rate_limit}`);
        lines.push(`- temperatura: ${res.temperatura || '—'}`);
        if (res.telegram_text) lines.push(`- telegram_enviado: ${res.telegram_text}`);
        if (res.groq_error) {
          lines.push(`- groq_error: \`${JSON.stringify(res.groq_error).slice(0, 350)}\``);
        }
        lines.push(`- latencia_ms: ${res.ms}`);
        lines.push(`- webhook_status: ${res.webhookStatus}`);
      }
      lines.push('');
      await new Promise((r) => setTimeout(r, sc.gapMs || 20000));
    }
    if (sc.id === 'criterio-10-rafaga') {
      lines.push(`Duracion rafaga total: ${Date.now() - burstStart} ms`);
      lines.push('');
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('\nGuardado:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
