/**
 * Validación live A/B/C derivación — mismo patrón que criterio 5 / rubro.
 * node scripts/run-validacion-derivacion-abc.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'validacion');
const WF_ID = '8JoSfkcn3pE1f0av';
const SECRET = `${WF_ID}_a1b2c3d4-0001-0001-0001-000000000001`;
const WH_PATH = '/webhook/f0e1d2c3-b4a5-9687-8765-inmobiliaria01/webhook';
const CHAT_ID = Number(process.env.VALIDACION_CHAT_ID || '999888801');

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

function pick(run, name) {
  const arr = run[name];
  if (!arr?.[0]?.data?.main?.[0]?.[0]) return null;
  return arr[0].data.main[0][0].json || null;
}

/** Recorre todos los items de un nodo (por si hay branches). */
function pickAllTexts(run, name) {
  const arr = run[name];
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const attempt of arr) {
    const mains = attempt?.data?.main || [];
    for (const branch of mains) {
      if (!Array.isArray(branch)) continue;
      for (const item of branch) {
        const j = item?.json;
        if (!j) continue;
        const t =
          j.text ||
          j.result?.text ||
          (j.body && (j.body.text || j.body)) ||
          '';
        if (t) out.push(String(t));
      }
    }
  }
  return out;
}

function extract(exec) {
  const run = exec?.data?.resultData?.runData || {};
  const parsear = pick(run, 'Parsear Respuesta');
  const set = pick(run, 'Set Variables');
  const tgCliente = pick(run, 'Telegram Responder');
  const ownerTexts = [];
  const ownerOk = [];
  for (const name of ['Telegram Alerta Owner', 'Telegram Alerta Owner RL']) {
    const arr = run[name];
    if (!Array.isArray(arr)) continue;
    for (const attempt of arr) {
      const mains = attempt?.data?.main || [];
      for (const branch of mains) {
        if (!Array.isArray(branch)) continue;
        for (const item of branch) {
          const j = item?.json;
          if (!j) continue;
          if (j.error) {
            ownerOk.push({ ok: false, error: String(j.error.message || j.error) });
            continue;
          }
          const t =
            j.text ||
            j.message?.text ||
            j.result?.text ||
            (j.body && j.body.text) ||
            '';
          const delivered = Boolean(
            j.ok === true ||
              j.message_id ||
              j.result?.message_id ||
              (j.message && j.message.message_id),
          );
          if (t) ownerTexts.push(String(t));
          ownerOk.push({
            ok: delivered,
            message_id:
              j.message_id || j.result?.message_id || j.message?.message_id || null,
            text: t || String(parsear?.aviso_vendedor_texto || ''),
          });
        }
      }
    }
  }
  return {
    texto_usuario: String(parsear?.texto_usuario || set?.texto_usuario || ''),
    respuesta_bot: String(parsear?.respuesta_bot || ''),
    telegram_cliente: String(
      tgCliente?.result?.text || tgCliente?.text || parsear?.respuesta_bot || '',
    ),
    bot_paused: String(parsear?.bot_paused || ''),
    handoff: String(parsear?.handoff || ''),
    aviso_vendedor: Boolean(parsear?.aviso_vendedor),
    aviso_vendedor_texto: String(parsear?.aviso_vendedor_texto || ''),
    notif_resumen: String(parsear?.notif_resumen || ''),
    derivacion_categoria: String(parsear?.derivacion_categoria || ''),
    derivacion_motivo: String(parsear?.derivacion_motivo || ''),
    owner_telegram_texts: ownerTexts,
    owner_delivery: ownerOk,
    temperatura: String(parsear?.temperatura || ''),
    status: exec?.status,
    startedAt: exec?.startedAt,
    stoppedAt: exec?.stoppedAt,
    id: exec?.id,
  };
}

async function waitMatch(expectedText, afterIso, usedIds, timeoutMs = 180000) {
  const t0 = Date.now();
  const probed = new Set();
  while (Date.now() - t0 < timeoutMs) {
    const list = await api(
      'GET',
      `/api/v1/executions?workflowId=${WF_ID}&limit=30&includeData=false`,
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
    await new Promise((r) => setTimeout(r, 2500));
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
        last_name: 'ABC',
        username: 'validacion_abc_nodo',
      },
      chat: {
        id: CHAT_ID,
        first_name: 'Validacion',
        last_name: 'ABC',
        username: 'validacion_abc_nodo',
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
  const wh = await postWebhook(payload);
  const matched = await waitMatch(text, afterIso, usedIds);
  return {
    ok: Boolean(matched),
    text,
    webhookStatus: wh.status,
    sentAt: afterIso,
    ...(matched || { error: 'sin_match_texto_usuario' }),
  };
}

const CASES = [
  { cat: 'A', text: 'que es una seña' },
  { cat: 'B', text: 'quiero agendar visita' },
  { cat: 'C', text: 'quiero hablar con una persona' },
];

async function main() {
  console.log('chat', CHAT_ID);
  try {
    await api('POST', `/api/v1/workflows/${WF_ID}/activate`);
  } catch (_) {}

  const usedIds = new Set();
  const results = [];
  let msgId = Date.now() % 1e7;
  for (const c of CASES) {
    console.log('→', c.cat, c.text);
    const r = await send(c.text, msgId++, usedIds);
    results.push({ ...c, ...r });
    console.log(
      '  ok',
      r.ok,
      'cat',
      r.derivacion_categoria,
      'aviso',
      r.aviso_vendedor,
      'ownerDelivered',
      (r.owner_delivery || []).some((d) => d.ok),
      'ownerMsgs',
      (r.owner_telegram_texts || []).length,
    );
    await new Promise((r) => setTimeout(r, 8000));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(OUT_DIR, `derivacion-abc-live-${stamp}.md`);
  const lines = [
    '# Transcripciones live — Derivación A/B/C',
    '',
    `- Fecha: ${new Date().toISOString()}`,
    `- chat_id: ${CHAT_ID}`,
    `- workflow: ${WF_ID}`,
    '',
  ];
  for (const r of results) {
    lines.push(`## Categoría ${r.cat} — \`${r.text}\``);
    lines.push('');
    lines.push(`- exec_id: ${r.id || '—'}`);
    lines.push(`- startedAt: ${r.startedAt || r.sentAt || '—'}`);
    lines.push(`- stoppedAt: ${r.stoppedAt || '—'}`);
    lines.push(`- derivacion_categoria (parsear): ${r.derivacion_categoria || '—'}`);
    lines.push(`- derivacion_motivo: ${r.derivacion_motivo || '—'}`);
    lines.push(`- bot_paused: ${r.bot_paused || '—'}`);
    lines.push(`- aviso_vendedor flag: ${r.aviso_vendedor}`);
    lines.push('');
    lines.push('### Cliente → Bot (Telegram)');
    lines.push('');
    lines.push(`**[${r.startedAt || r.sentAt || ''}] Cliente:** ${r.text}`);
    lines.push('');
    lines.push(
      `**[${r.stoppedAt || ''}] Bot:** ${r.telegram_cliente || r.respuesta_bot || '(sin texto)'}`,
    );
    lines.push('');
    lines.push('### Aviso al vendedor (Telegram Owner)');
    lines.push('');
    const delivered = (r.owner_delivery || []).filter((d) => d.ok);
    const failed = (r.owner_delivery || []).filter((d) => !d.ok);
    if (delivered.length) {
      lines.push(`**ENTREGA CONFIRMADA** (message_id: ${delivered.map((d) => d.message_id).join(', ')})`);
      lines.push('');
      for (const d of delivered) {
        lines.push('```');
        lines.push(d.text || r.aviso_vendedor_texto || '');
        lines.push('```');
        lines.push('');
      }
    } else if (r.owner_telegram_texts && r.owner_telegram_texts.length) {
      lines.push('_Nodo respondió texto pero sin message_id:_');
      lines.push('');
      for (const t of r.owner_telegram_texts) {
        lines.push('```');
        lines.push(t);
        lines.push('```');
        lines.push('');
      }
    } else if (failed.length) {
      lines.push('**FALLO ENTREGA:**');
      lines.push('```');
      lines.push(failed.map((f) => f.error || JSON.stringify(f)).join('\n'));
      lines.push('```');
      lines.push('');
      lines.push('_Payload que se intentó:_');
      lines.push('```');
      lines.push(r.aviso_vendedor_texto || '(vacío)');
      lines.push('```');
      lines.push('');
    } else if (r.aviso_vendedor_texto && r.aviso_vendedor) {
      lines.push('_Flag aviso true pero nodo Owner no corrió / sin data:_');
      lines.push('```');
      lines.push(r.aviso_vendedor_texto);
      lines.push('```');
      lines.push('');
    } else {
      lines.push('_Sin aviso al vendedor en esta ejecución._');
      lines.push('');
    }
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('OUT', outPath);
  console.log(JSON.stringify(results.map((r) => ({
    cat: r.cat,
    ok: r.ok,
    derivacion_categoria: r.derivacion_categoria,
    aviso: r.aviso_vendedor,
    bot: (r.telegram_cliente || r.respuesta_bot || '').slice(0, 120),
    owner: (r.owner_telegram_texts && r.owner_telegram_texts[0] || r.aviso_vendedor_texto || '').slice(0, 200),
  })), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
