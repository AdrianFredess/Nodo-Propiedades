'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const TAG = 'tesis-evaluacion-3f132c3';
const ANEXO_PATH = path.join(ROOT, 'docs', 'tesis', 'anexo-F-SYSTEM_MIN.md');
const BATCH_PATH = path.join(ROOT, 'scripts', 'run_validacion_batch.py');

const EXPECTED_PARSEAR_BASE =
  'f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97';
const EXPECTED_CONSTRUIR =
  'dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22';
const EXPECTED_GROQ_BODY =
  '3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f';

function sha256(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function loadTagWorkflow() {
  const raw = execFileSync('git', ['show', `${TAG}:workflows/Bot Telegram Inmobiliaria.json`], {
    encoding: 'utf8',
    maxBuffer: 80e6,
    cwd: ROOT,
  });
  return JSON.parse(raw);
}

/** SYSTEM_MIN byte-a-byte desde el bloque del Anexo F (LF, como la constante Python). */
function systemMinFromAnexo() {
  const md = fs.readFileSync(ANEXO_PATH, 'utf8');
  const m = md.match(/```\r?\n([\s\S]*?)\r?\n```/);
  if (!m) throw new Error('no se encontró bloque SYSTEM_MIN en anexo-F');
  // El .md en Windows puede traer CRLF dentro del fence; la canónica es LF (batch.py).
  return m[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** SYSTEM_MIN reconstruido desde la constante Python en 3f132c3. */
function systemMinFromBatchAtTag() {
  let py;
  try {
    py = execFileSync('git', ['show', `${TAG}:scripts/run_validacion_batch.py`], {
      encoding: 'utf8',
      maxBuffer: 10e6,
      cwd: ROOT,
    });
  } catch (_) {
    py = fs.readFileSync(BATCH_PATH, 'utf8');
  }
  const m = py.match(/SYSTEM_MIN\s*=\s*\(([\s\S]*?)\)\s*\n\s*\n/);
  if (!m) throw new Error('no se encontró SYSTEM_MIN en run_validacion_batch.py');
  const parts = [...m[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((x) =>
    x[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\'),
  );
  // También literales con comillas simples del JSON embebido
  const single = [...m[1].matchAll(/'((?:\\.|[^'\\])*)'/g)].map((x) =>
    x[1]
      .replace(/\\n/g, '\n')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\'),
  );
  // La constante mezcla "..." y '{"...}' — reconstruir en orden de aparición
  const ordered = [];
  const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  let mm;
  while ((mm = re.exec(m[1]))) {
    const raw = mm[1];
    if (raw.startsWith('"')) {
      ordered.push(
        raw
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\'),
      );
    } else {
      ordered.push(
        raw
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\'),
      );
    }
  }
  void parts;
  void single;
  return ordered.join('');
}

function normalizeTemp(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Parser validado del bloque LEAD (mismo regex + JSON.parse).
 * @returns {{ ok: boolean, temperatura: string, cruda: string, error: string }}
 */
function parseClasificadorTemperatura(httpJson) {
  if (httpJson == null) {
    return { ok: false, temperatura: '', cruda: '', error: 'sin_respuesta_http' };
  }
  if (httpJson.error != null) {
    const msg =
      typeof httpJson.error === 'string'
        ? httpJson.error
        : httpJson.error.message || JSON.stringify(httpJson.error);
    return { ok: false, temperatura: '', cruda: '', error: `http_error:${msg}` };
  }
  const msg = httpJson.choices?.[0]?.message || {};
  let text = msg.content == null ? '' : String(msg.content);
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const re = /###LEAD_COMPLETO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_LEAD###/;
  const m = text.match(re);
  if (!m) {
    return { ok: false, temperatura: '', cruda: '', error: 'sin_bloque' };
  }
  let lead;
  try {
    lead = JSON.parse(m[1].trim());
  } catch (e) {
    return { ok: false, temperatura: '', cruda: '', error: `json_roto:${e.message}` };
  }
  const cruda = lead?.temperatura == null ? '' : String(lead.temperatura);
  const norm = normalizeTemp(cruda);
  if (norm === 'frio' || norm === 'tibio' || norm === 'caliente') {
    return { ok: true, temperatura: norm, cruda, error: '' };
  }
  return { ok: false, temperatura: '', cruda, error: `temperatura_invalida:${cruda}` };
}

function tokensFromUsage(httpJson) {
  const usage = httpJson?.usage || {};
  if (usage.total_tokens != null) return Number(usage.total_tokens);
  if (usage.prompt_tokens != null && usage.completion_tokens != null) {
    return Number(usage.prompt_tokens) + Number(usage.completion_tokens);
  }
  return '';
}

function jsPrepararClasificacion(systemMin) {
  const lit = JSON.stringify(systemMin);
  return [
    'const SYSTEM_MIN = ' + lit + ';',
    'const base = $(\'Parsear Respuesta Base\').first().json || {};',
    'let hist = [];',
    'try {',
    '  const parsed = JSON.parse(base.historial_json || \'[]\');',
    '  hist = Array.isArray(parsed) ? parsed : [];',
    '} catch (e) {',
    '  hist = [];',
    '}',
    'const userMsgs = hist',
    '  .filter((m) => m && String(m.role || \'\') === \'user\')',
    '  .map((m) => String(m.content == null ? \'\' : m.content));',
    'const last6 = userMsgs.slice(-6);',
    'const content = last6.join(\'\\n\');',
    'return [{',
    '  json: {',
    '    messages: [',
    '      { role: \'system\', content: SYSTEM_MIN },',
    '      { role: \'user\', content: content },',
    '    ],',
    '  },',
    '}];',
    '',
  ].join('\n');
}

function jsParsearRespuestaClasificador() {
  return [
    'function normalizeTemp(v) {',
    '  return String(v || \'\')',
    '    .toLowerCase()',
    '    .normalize(\'NFD\')',
    '    .replace(/[\\u0300-\\u036f]/g, \'\')',
    '    .trim();',
    '}',
    '',
    'function parseClasificadorTemperatura(httpJson) {',
    '  if (httpJson == null) {',
    '    return { ok: false, temperatura: \'\', cruda: \'\', error: \'sin_respuesta_http\' };',
    '  }',
    '  if (httpJson.error != null) {',
    '    const msg =',
    '      typeof httpJson.error === \'string\'',
    '        ? httpJson.error',
    '        : httpJson.error.message || JSON.stringify(httpJson.error);',
    '    return { ok: false, temperatura: \'\', cruda: \'\', error: \'http_error:\' + msg };',
    '  }',
    '  const msg = (httpJson.choices && httpJson.choices[0] && httpJson.choices[0].message) || {};',
    '  let text = msg.content == null ? \'\' : String(msg.content);',
    '  text = text.replace(/<think>[\\s\\S]*?<\\/think>/gi, \'\').trim();',
    '  const re = /###LEAD_COMPLETO###[\\s\\S]*?({[\\s\\S]*?})[\\s\\S]*?###FIN_LEAD###/;',
    '  const m = text.match(re);',
    '  if (!m) {',
    '    return { ok: false, temperatura: \'\', cruda: \'\', error: \'sin_bloque\' };',
    '  }',
    '  let lead;',
    '  try {',
    '    lead = JSON.parse(m[1].trim());',
    '  } catch (e) {',
    '    return { ok: false, temperatura: \'\', cruda: \'\', error: \'json_roto:\' + e.message };',
    '  }',
    '  const cruda = lead && lead.temperatura == null ? \'\' : String(lead.temperatura);',
    '  const norm = normalizeTemp(cruda);',
    '  if (norm === \'frio\' || norm === \'tibio\' || norm === \'caliente\') {',
    '    return { ok: true, temperatura: norm, cruda: cruda, error: \'\' };',
    '  }',
    '  return { ok: false, temperatura: \'\', cruda: cruda, error: \'temperatura_invalida:\' + cruda };',
    '}',
    '',
    'function tokensFromUsage(httpJson) {',
    '  const usage = (httpJson && httpJson.usage) || {};',
    '  if (usage.total_tokens != null) return Number(usage.total_tokens);',
    '  if (usage.prompt_tokens != null && usage.completion_tokens != null) {',
    '    return Number(usage.prompt_tokens) + Number(usage.completion_tokens);',
    '  }',
    '  return \'\';',
    '}',
    '',
    'const base = Object.assign({}, $(\'Parsear Respuesta Base\').first().json || {});',
    'const temperatura_prompt_principal = base.temperatura;',
    'const httpJson = $json || {};',
    'const parsed = parseClasificadorTemperatura(httpJson);',
    'const tokens_clasificador = tokensFromUsage(httpJson);',
    'const out = Object.assign({}, base);',
    'out.temperatura_prompt_principal = temperatura_prompt_principal;',
    'out.temperatura_clasificador_cruda = parsed.cruda;',
    'out.tokens_clasificador = tokens_clasificador;',
    'if (parsed.ok) {',
    '  out.temperatura = parsed.temperatura;',
    '  out.clasificacion_fuente = \'clasificador\';',
    '  delete out.clasificacion_error;',
    '} else {',
    '  out.temperatura = temperatura_prompt_principal;',
    '  out.clasificacion_fuente = \'fallback_prompt_principal\';',
    '  out.clasificacion_error = parsed.error;',
    '}',
    'return [{ json: out }];',
    '',
  ].join('\n');
}

/**
 * Extrae user messages de historial_json (igual lógica que el nodo).
 */
function prepararClasificacionFromHistorial(historialJson, systemMin) {
  let hist = [];
  try {
    const parsed = JSON.parse(historialJson || '[]');
    hist = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    hist = [];
  }
  const userMsgs = hist
    .filter((m) => m && String(m.role || '') === 'user')
    .map((m) => String(m.content == null ? '' : m.content));
  const last6 = userMsgs.slice(-6);
  const content = last6.join('\n');
  return {
    messages: [
      { role: 'system', content: systemMin },
      { role: 'user', content: content },
    ],
    content,
  };
}

module.exports = {
  ROOT,
  TAG,
  ANEXO_PATH,
  EXPECTED_PARSEAR_BASE,
  EXPECTED_CONSTRUIR,
  EXPECTED_GROQ_BODY,
  sha256,
  deepClone,
  loadTagWorkflow,
  systemMinFromAnexo,
  systemMinFromBatchAtTag,
  normalizeTemp,
  parseClasificadorTemperatura,
  tokensFromUsage,
  jsPrepararClasificacion,
  jsParsearRespuestaClasificador,
  prepararClasificacionFromHistorial,
};
