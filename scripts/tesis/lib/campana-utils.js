'use strict';

const crypto = require('crypto');

const EXPECTED_HASHES = {
  construir_prompt: 'dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22',
  parsear_respuesta: 'f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97',
  http_groq_body: '3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f',
};

const DISABLE_EFFECT = new Set([
  'Telegram Responder',
  'Email Lead Caliente',
  'Telegram Alerta Owner',
  'Emit Panel Realtime',
  'Emit Lead Updated',
]);

const RESCATE_SNIPPETS = [
  'Perdón, no pude leer la respuesta del asistente',
  'Dame un segundo que se me trabo',
];

const CSV_COLUMNS = [
  'id',
  'perfil_esperado',
  'mensaje_usuario',
  'chat_id',
  'intento',
  'exec_id',
  'timestamp_utc',
  'http_status_groq',
  'tokens_usage',
  'estado_actual_crudo',
  'temperatura_estado_actual',
  'lead_block_crudo',
  'lead_completo',
  'temperatura_lead_block',
  'respuesta_completa',
  'es_rescate',
  't_total_ms',
  't_groq_ms',
  't_leer_stock_ms',
  't_leer_historial_ms',
  't_leer_politicas_ms',
  'stock_leido',
  'historial_ok',
  'leads_bot_ok',
  'guardar_lead_ok',
  'campos_distintos',
  'notas',
];

function sha256(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function hashesFromWorkflow(wf) {
  const by = (name) => (wf.nodes || []).find((n) => n.name === name);
  return {
    construir_prompt: sha256(by('Construir Prompt')?.parameters?.jsCode),
    parsear_respuesta: sha256(by('Parsear Respuesta')?.parameters?.jsCode),
    http_groq_body: sha256(by('HTTP Groq')?.parameters?.jsonBody),
  };
}

function assertExpectedHashes(h) {
  const bad = [];
  for (const k of Object.keys(EXPECTED_HASHES)) {
    if (h[k] !== EXPECTED_HASHES[k]) bad.push(`${k}: got ${h[k]} expected ${EXPECTED_HASHES[k]}`);
  }
  return bad;
}

/**
 * Parsea mensajes de rate limit de Groq.
 * @returns {{ kind: 'tpm'|'tpd'|'unknown', waitMs: number|null, raw: string }}
 */
function parseGroqRetry(bodyOrText) {
  const raw = typeof bodyOrText === 'string' ? bodyOrText : JSON.stringify(bodyOrText || '');
  const lower = raw.toLowerCase();
  const isDay =
    /tokens per day|tpd|daily|per day|día|dia/.test(lower) ||
    /limit.*day|day.*limit/.test(lower);
  const isMin = /tokens per minute|tpm|per minute|por minuto/.test(lower) || /try again in/.test(lower);

  let waitMs = null;
  const m = raw.match(/try again in\s*([\d.]+)\s*(ms|s|sec|secs|seconds)?/i);
  if (m) {
    const n = Number(m[1]);
    const unit = (m[2] || 's').toLowerCase();
    waitMs = unit.startsWith('ms') ? Math.ceil(n) : Math.ceil(n * 1000);
  }

  if (isDay && !/try again in/i.test(raw) && !isMin) {
    return { kind: 'tpd', waitMs: null, raw };
  }
  if (isDay && /per day|tpd|daily/.test(lower)) {
    return { kind: 'tpd', waitMs, raw };
  }
  if (isMin || waitMs != null) {
    return { kind: 'tpm', waitMs: waitMs ?? 60000, raw };
  }
  if (/429/.test(raw)) return { kind: 'unknown', waitMs: waitMs ?? 60000, raw };
  return { kind: 'unknown', waitMs: null, raw };
}

function isRescate(text) {
  const t = String(text || '');
  return RESCATE_SNIPPETS.some((s) => t.includes(s)) ? 'si' : 'no';
}

function normalizeSpace(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEstadoActual(rawText) {
  const text = String(rawText || '');
  const m = text.match(/###ESTADO_ACTUAL:(frio|tibio|caliente)###/i);
  if (!m) {
    return { estado_actual_crudo: '', temperatura_estado_actual: 'sin_tag' };
  }
  return {
    estado_actual_crudo: m[0],
    temperatura_estado_actual: m[1].toLowerCase(),
  };
}

function extractLeadBlock(rawText) {
  const text = String(rawText || '');
  const m = text.match(/###LEAD_COMPLETO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_LEAD###/);
  if (!m) {
    return { lead_block_crudo: '', lead_completo: 'no', temperatura_lead_block: '', leadObj: null };
  }
  let leadObj = null;
  try {
    leadObj = JSON.parse(m[1]);
  } catch (_) {
    leadObj = null;
  }
  return {
    lead_block_crudo: m[0],
    lead_completo: 'si',
    temperatura_lead_block: String(leadObj?.temperatura || '').toLowerCase(),
    leadObj,
  };
}

function groqVisibleText(httpJson) {
  if (!httpJson) return '';
  const msg = httpJson.choices?.[0]?.message;
  if (!msg) return '';
  let text = msg.content == null ? '' : String(msg.content);
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  return text.trim();
}

function nodeExecTimeMs(runData, name) {
  const arr = runData?.[name];
  if (!arr?.[0]) return '';
  const t = arr[0].executionTime;
  return t == null ? '' : String(t);
}

function nodeMainItems(runData, name) {
  const arr = runData?.[name]?.[0]?.data?.main?.[0];
  return Array.isArray(arr) ? arr : [];
}

function nodeHasError(runData, name) {
  const items = nodeMainItems(runData, name);
  if (!items.length) {
    const err = runData?.[name]?.[0]?.error;
    if (err) return String(err.message || err);
    return 'sin_salida';
  }
  for (const it of items) {
    const j = it.json || {};
    if (j.error) {
      const e = j.error;
      return typeof e === 'string' ? e : e.message || e.description || JSON.stringify(e);
    }
  }
  return null;
}

function stockCount(runData) {
  const items = nodeMainItems(runData, 'Leer Stock Propiedades');
  let n = 0;
  for (const it of items) {
    const j = it.json || {};
    if (j.error) continue;
    const keys = Object.keys(j);
    if (keys.length === 1 && keys[0] === 'error') continue;
    n += 1;
  }
  return n;
}

function compareLeadFields(leadObj, sheetRow) {
  if (!leadObj || !sheetRow) return { ok: false, campos_distintos: 'sin_datos' };
  const fields = ['nombre', 'zona', 'presupuesto', 'tipo_operacion', 'temperatura', 'resumen'];
  const bad = [];
  for (const f of fields) {
    const a = normalizeSpace(leadObj[f]);
    const b = normalizeSpace(sheetRow[f]);
    if (a !== b) bad.push(`${f}:${a}|${b}`);
  }
  return { ok: bad.length === 0, campos_distintos: bad.join(';') };
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows, columns = CSV_COLUMNS) {
  const lines = [columns.join(',')];
  for (const r of rows) {
    lines.push(columns.map((c) => csvEscape(r[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] || '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Control proactivo de tokens (TPM + TPD) para no disparar 429.
 * Usa uso real de respuestas cuando está disponible; si no, estima 5200.
 */
function createTokenGovernor(opts = {}) {
  const tpmBudget = opts.tpmBudget ?? 7500; // headroom bajo 8000
  const tpdBudget = opts.tpdBudget ?? 190000; // headroom bajo 200000
  const estTokens = opts.estTokens ?? 5200;
  const minGapMs = opts.minGapMs ?? 75000;
  const safetyMs = opts.safetyMs ?? 5000;

  const window = []; // { t, tokens }
  let dayUsed = 0;
  let lastSentAt = 0;

  function prune(now) {
    while (window.length && now - window[0].t > 60000) window.shift();
  }

  function usedInWindow(now) {
    prune(now);
    return window.reduce((a, x) => a + x.tokens, 0);
  }

  function record(tokens) {
    const n = Math.max(0, Number(tokens) || estTokens);
    const now = Date.now();
    window.push({ t: now, tokens: n });
    dayUsed += n;
    lastSentAt = now;
  }

  function canAfford(est = estTokens) {
    const now = Date.now();
    if (dayUsed + est > tpdBudget) {
      return { ok: false, kind: 'tpd', waitMs: null, dayUsed, tpdBudget };
    }
    const used = usedInWindow(now);
    if (used + est > tpmBudget) {
      const oldest = window[0];
      const waitMs = oldest ? Math.max(0, 60000 - (now - oldest.t)) + safetyMs : minGapMs;
      return { ok: false, kind: 'tpm', waitMs, used, tpmBudget };
    }
    const since = now - lastSentAt;
    if (lastSentAt && since < minGapMs) {
      return { ok: false, kind: 'gap', waitMs: minGapMs - since };
    }
    return { ok: true, waitMs: 0 };
  }

  async function waitUntilReady(sleepFn, est = estTokens) {
    for (;;) {
      const c = canAfford(est);
      if (c.ok) return c;
      if (c.kind === 'tpd') return c;
      await sleepFn(Math.max(c.waitMs || minGapMs, 1000));
    }
  }

  return {
    record,
    canAfford,
    waitUntilReady,
    snapshot: () => ({ dayUsed, tpmBudget, tpdBudget, window: usedInWindow(Date.now()) }),
    setDayUsed: (n) => {
      dayUsed = Number(n) || 0;
    },
  };
}

function emptyResultRow(base = {}) {
  const row = {};
  for (const c of CSV_COLUMNS) row[c] = '';
  return { ...row, ...base };
}

function rowFromExecution({ guion, chatId, intento, exec }) {
  const run = exec?.data?.resultData?.runData || {};
  const httpItems = nodeMainItems(run, 'HTTP Groq');
  const httpJson = httpItems[0]?.json || null;
  const rawGroq = groqVisibleText(httpJson);
  const parsear = nodeMainItems(run, 'Parsear Respuesta')[0]?.json || {};
  const estado = extractEstadoActual(rawGroq);
  const lead = extractLeadBlock(rawGroq);
  const respuesta = String(parsear.respuesta_bot || '');
  const es_rescate = isRescate(respuesta);
  const started = exec.startedAt ? Date.parse(exec.startedAt) : NaN;
  const stopped = exec.stoppedAt ? Date.parse(exec.stoppedAt) : NaN;
  const t_total_ms =
    Number.isFinite(started) && Number.isFinite(stopped) ? String(stopped - started) : '';

  const usage = httpJson?.usage || {};
  const tokens =
    usage.total_tokens ??
    (usage.prompt_tokens != null && usage.completion_tokens != null
      ? Number(usage.prompt_tokens) + Number(usage.completion_tokens)
      : '');

  const histErr = nodeHasError(run, 'Actualizar Historial');
  const leadsErr = nodeHasError(run, 'Sync Leads_Bot');
  const guardarErr = nodeHasError(run, 'Guardar Lead');

  const notas = [];
  if (exec.status === 'error') notas.push('exec_error');
  if (histErr) notas.push(`historial:${histErr}`);
  if (leadsErr) notas.push(`leads_bot:${leadsErr}`);
  if (guardarErr && lead.lead_completo === 'si') notas.push(`guardar_lead:${guardarErr}`);

  let temperatura = estado.temperatura_estado_actual;
  if (es_rescate === 'si') temperatura = 'sin_tag';

  return emptyResultRow({
    id: guion.id,
    perfil_esperado: guion.perfil_esperado,
    mensaje_usuario: guion.mensaje_usuario,
    chat_id: String(chatId),
    intento: String(intento),
    exec_id: String(exec.id || ''),
    timestamp_utc: exec.startedAt || '',
    http_status_groq: httpJson?.error?.code || httpJson?.status || (httpJson ? '200' : ''),
    tokens_usage: tokens === '' ? '' : String(tokens),
    estado_actual_crudo: estado.estado_actual_crudo,
    temperatura_estado_actual: temperatura,
    lead_block_crudo: lead.lead_block_crudo,
    lead_completo: lead.lead_completo,
    temperatura_lead_block: lead.temperatura_lead_block,
    respuesta_completa: respuesta,
    es_rescate,
    t_total_ms,
    t_groq_ms: nodeExecTimeMs(run, 'HTTP Groq'),
    t_leer_stock_ms: nodeExecTimeMs(run, 'Leer Stock Propiedades'),
    t_leer_historial_ms: nodeExecTimeMs(run, 'Leer Historial'),
    t_leer_politicas_ms: nodeExecTimeMs(run, 'Leer Politicas Pago'),
    stock_leido: String(stockCount(run)),
    historial_ok: histErr ? 'no' : 'si',
    leads_bot_ok: leadsErr ? 'no' : 'si',
    guardar_lead_ok: lead.lead_completo === 'si' ? (guardarErr ? 'no' : 'si') : '',
    campos_distintos: '',
    notas: notas.join(' | '),
    _leadObj: lead.leadObj,
  });
}

module.exports = {
  EXPECTED_HASHES,
  DISABLE_EFFECT,
  RESCATE_SNIPPETS,
  CSV_COLUMNS,
  sha256,
  hashesFromWorkflow,
  assertExpectedHashes,
  parseGroqRetry,
  isRescate,
  normalizeSpace,
  extractEstadoActual,
  extractLeadBlock,
  groqVisibleText,
  nodeExecTimeMs,
  nodeMainItems,
  nodeHasError,
  stockCount,
  compareLeadFields,
  csvEscape,
  rowsToCsv,
  parseCsv,
  createTokenGovernor,
  emptyResultRow,
  rowFromExecution,
};
