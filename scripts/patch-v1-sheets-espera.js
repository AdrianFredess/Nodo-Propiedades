/**
 * V1: sheets_error no pausa al cliente, junta los chats y avisa la lista.
 * No toca la copia de tesis.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HELPER = fs.readFileSync(path.join(__dirname, 'snippets', 'sheets-fail-closed.js'), 'utf8').replace(/\r\n/g, '\n');
const OLD_HELPER = execFileSync('git', ['show', 'HEAD:scripts/snippets/sheets-fail-closed.js'], {
  cwd: ROOT,
  encoding: 'utf8',
}).replace(/\r\n/g, '\n');

const TG_ALERT_OLD = `let alertarSheets = false;
if (sheetsError && typeof $getWorkflowStaticData === 'function') {
  alertarSheets = debeAlertarSheets($getWorkflowStaticData('global'), Date.now());
}`;

const TG_ALERT_NEW = `let alertarSheets = false;
let sheetsAlertaTexto = '';
let sheetsRecuperacion = '';
if (typeof $getWorkflowStaticData === 'function') {
  const sdSheets = $getWorkflowStaticData('global');
  if (sheetsError) {
    if (typeof registrarClienteSheets === 'function') {
      registrarClienteSheets(sdSheets, {
        chat_id: chatId,
        nombre: nombreUsuario,
        canal: 'telegram',
        mensaje: textoUsuario,
      });
    }
    alertarSheets = debeAlertarSheets(sdSheets, Date.now());
    if (alertarSheets && typeof textoAlertaSheets === 'function') {
      sheetsAlertaTexto = textoAlertaSheets(
        sheetsErrorNodo,
        sheetsErrorMsg,
        sdSheets.sheetsChats,
      );
    }
  } else if (typeof tomarRecuperacionSheets === 'function') {
    sheetsRecuperacion = tomarRecuperacionSheets(sdSheets);
  }
}`;

const WA_ALERT_OLD = `let alertarSheets = false;
if (sheetsError && typeof $getWorkflowStaticData === 'function') {
  alertarSheets = debeAlertarSheets($getWorkflowStaticData('global'), Date.now());
}`;

const WA_ALERT_NEW = `let alertarSheets = false;
let sheetsAlertaTexto = '';
let sheetsRecuperacion = '';
if (typeof $getWorkflowStaticData === 'function') {
  if (sheetsError) {
    if (typeof registrarClienteSheets === 'function') {
      registrarClienteSheets(sd, {
        chat_id: chatKey,
        nombre: prep.lead_name || prep.phone || 'Cliente',
        canal: 'whatsapp',
        mensaje: msg,
      });
    }
    alertarSheets = debeAlertarSheets(sd, Date.now());
    if (alertarSheets && typeof textoAlertaSheets === 'function') {
      sheetsAlertaTexto = textoAlertaSheets(sheetsErrorNodo, sheetsErrorMsg, sd.sheetsChats);
    }
  } else if (typeof tomarRecuperacionSheets === 'function') {
    sheetsRecuperacion = tomarRecuperacionSheets(sd);
  }
}`;

function must(code, oldText, newText, label) {
  if (code.includes(newText)) return code;
  if (!code.includes(oldText)) throw new Error('No encontre: ' + label);
  return code.replace(oldText, newText);
}

function refreshHelper(code) {
  const start = code.indexOf('/**\n * Lectura de Sheets');
  if (start < 0) return code;
  const end = code.indexOf("if (typeof module !== 'undefined' && module.exports)", start);
  if (end < 0) return code;
  const close = code.indexOf('\n}', end);
  if (close < 0) return code;
  return code.slice(0, start) + HELPER.trim() + code.slice(close + 2);
}

function patchCode(code, kind) {
  let out = refreshHelper(code.replace(/\r\n/g, '\n'));
  if (!out.includes('function registrarClienteSheets') && out.includes('function debeAlertarSheets')) {
    throw new Error('Helper viejo no coincide en ' + kind);
  }
  if (kind === 'tg-prompt' || (kind === 'auto' && out.includes('const chatId = String(setVars.chat_id'))) {
    if (!out.includes('let sheetsRecuperacion')) out = must(out, TG_ALERT_OLD, TG_ALERT_NEW, 'alerta tg');
    out = out.replace(
      'alertarSheets = debeAlertarSheets(sdSheets, Date.now());',
      'alertarSheets = (typeof debeAlertarRafagaSheets === \'function\' ? debeAlertarRafagaSheets : debeAlertarSheets)(sdSheets, Date.now());',
    );
    if (!out.includes('sheets_alerta_texto')) {
      out = must(
        out,
        'alertar_sheets: alertarSheets,',
        `alertar_sheets: alertarSheets,
      sheets_alerta_texto: sheetsAlertaTexto,
      sheets_recuperacion: sheetsRecuperacion,`,
        'campos tg',
      );
    }
  }
  if (kind === 'wa-prompt' || (kind === 'auto' && out.includes('const chatKey = String(prep.chat_id'))) {
    if (!out.includes('let sheetsRecuperacion')) out = must(out, WA_ALERT_OLD, WA_ALERT_NEW, 'alerta wa');
    out = out.replace(
      'alertarSheets = debeAlertarSheets(sd, Date.now());',
      'alertarSheets = (typeof debeAlertarRafagaSheets === \'function\' ? debeAlertarRafagaSheets : debeAlertarSheets)(sd, Date.now());',
    );
    if (!out.includes('sheets_alerta_texto')) {
      out = must(
        out,
        'alertar_sheets: alertarSheets,',
        `alertar_sheets: alertarSheets,
      sheets_alerta_texto: sheetsAlertaTexto,
      sheets_recuperacion: sheetsRecuperacion,`,
        'campos wa',
      );
    }
  }
  if (kind === 'tg-parse' || out.includes('promptData.sheets_error')) {
    out = out.replace(
      `if (promptData.sheets_error) {
  derivacion = {
    categoria: 'C',
    motivo: 'sheets_error',
    alertar: Boolean(promptData.alertar_sheets),
    pausar: true,
  };
}`,
      `if (promptData.sheets_error) {
  derivacion = {
    categoria: 'C',
    motivo: 'sheets_error',
    alertar: Boolean(promptData.alertar_sheets),
    pausar: false,
  };
}`,
    );
    out = out.replace(
      `  propiedadesMostrar = [];
  scoreTemp.bot_paused = true;
  scoreTemp.handoff = true;
  scoreTemp.estado_seguimiento = 'respondido';
  if (scoreTemp.temperatura === 'frio') scoreTemp.temperatura = 'tibio';
  temperatura = scoreTemp.temperatura;
} else if (derivacion.categoria === 'B') {`,
      `  propiedadesMostrar = [];
  if (derivacion.pausar) {
    scoreTemp.bot_paused = true;
    scoreTemp.handoff = true;
    scoreTemp.estado_seguimiento = 'respondido';
    if (scoreTemp.temperatura === 'frio') scoreTemp.temperatura = 'tibio';
    temperatura = scoreTemp.temperatura;
  }
} else if (derivacion.categoria === 'B') {`,
    );
    const avisoOld = `if (promptData.sheets_error) {
  avisoVendedorTexto =
    'Sheets caído: ' +
    String(promptData.sheets_error_nodo || 'Leer Stock') +
    ' ' +
    String(promptData.sheets_error_msg || '').slice(0, 160) +
    (avisoVendedorTexto ? '\\n' + avisoVendedorTexto : '');
}`;
    const avisoNew = `if (promptData.sheets_error && promptData.alertar_sheets) {
  avisoVendedorTexto =
    String(promptData.sheets_alerta_texto || '').trim() ||
    'Sheets caído: ' +
      String(promptData.sheets_error_nodo || 'Leer Stock') +
      ' ' +
      String(promptData.sheets_error_msg || '').slice(0, 160);
}
if (promptData.sheets_recuperacion) {
  avisoVendedorTexto =
    String(promptData.sheets_recuperacion) +
    (avisoVendedorTexto ? '\\n' + avisoVendedorTexto : '');
  derivacion.alertar = true;
}`;
    if (out.includes(avisoOld)) out = out.replace(avisoOld, avisoNew);
    else if (!out.includes('sheets_recuperacion')) throw new Error('aviso tg');
  }
  if (kind === 'wa-parse' || out.includes('prep.sheets_error')) {
    out = out.replace(
      `if (prep.sheets_error) {
  derivacionWa = {
    categoria: 'C',
    motivo: 'sheets_error',
    alertar: Boolean(prep.alertar_sheets),
    pausar: true,
  };`,
      `if (prep.sheets_error) {
  derivacionWa = {
    categoria: 'C',
    motivo: 'sheets_error',
    alertar: Boolean(prep.alertar_sheets),
    pausar: false,
  };`,
    );
    const waOld = `let avisoSheets = avisoWa;
if (prep.sheets_error) {
  avisoSheets =
    'Sheets caído: ' +
    String(prep.sheets_error_nodo || 'Leer Stock') +
    ' ' +
    String(prep.sheets_error_msg || '').slice(0, 160) +
    (avisoWa ? '\\n' + avisoWa : '');
}`;
    const waNew = `let avisoSheets = avisoWa;
if (prep.sheets_error && prep.alertar_sheets) {
  avisoSheets =
    String(prep.sheets_alerta_texto || '').trim() ||
    'Sheets caído: ' +
      String(prep.sheets_error_nodo || 'Leer Stock') +
      ' ' +
      String(prep.sheets_error_msg || '').slice(0, 160);
}
if (prep.sheets_recuperacion) {
  avisoSheets = String(prep.sheets_recuperacion) + (avisoSheets ? '\\n' + avisoSheets : '');
  derivacionWa.alertar = true;
}`;
    if (out.includes(waOld)) out = out.replace(waOld, waNew);
    else if (!out.includes('prep.sheets_recuperacion')) throw new Error('aviso wa');
  }
  return out;
}

function kindOf(node) {
  if (node.name === 'Construir Prompt') return 'tg-prompt';
  if (node.name === 'Parsear Respuesta') return 'tg-parse';
  if (node.name === 'Code - Armar Prompt') return 'wa-prompt';
  if (node.name === 'Code - Procesar IA') return 'wa-parse';
  return '';
}

function patchWorkflow(wf) {
  let n = 0;
  for (const node of wf.nodes || []) {
    const kind = kindOf(node);
    const code = node.parameters && node.parameters.jsCode;
    if (!kind || typeof code !== 'string') continue;
    const next = patchCode(code, kind);
    if (next !== code.replace(/\r\n/g, '\n')) n += 1;
    node.parameters.jsCode = next;
  }
  return n;
}

function writeSurgical(file, wf) {
  const full = path.join(ROOT, 'workflows', file);
  let raw = fs.readFileSync(full, 'utf8');
  const prev = JSON.parse(raw);
  for (let i = 0; i < prev.nodes.length; i++) {
    const before = prev.nodes[i].parameters && prev.nodes[i].parameters.jsCode;
    const after = wf.nodes[i].parameters && wf.nodes[i].parameters.jsCode;
    if (typeof before !== 'string' || before === after) continue;
    const from = JSON.stringify(before);
    const to = JSON.stringify(after);
    if (!raw.includes(from)) throw new Error('No pude ubicar el codigo de ' + prev.nodes[i].name + ' en ' + file);
    raw = raw.replace(from, to);
  }
  fs.writeFileSync(full, raw);
}

function apiKey() {
  const code = [
    'import sqlite3',
    'c=sqlite3.connect(r"file:C:/Users/adrian/.n8n/database.sqlite?mode=ro", uri=True)',
    'row=c.execute("SELECT apiKey FROM user_api_keys WHERE label=?", ("n8n",)).fetchone()',
    'print(row[0] if row else "")',
  ].join('; ');
  return execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
}

function request(method, urlPath, key, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: {
          'X-N8N-API-KEY': key,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 300)));
            return;
          }
          resolve(buf ? JSON.parse(buf) : null);
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function putBody(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: s.executionOrder || 'v1',
      ...(s.timezone ? { timezone: s.timezone } : {}),
    },
    staticData: wf.staticData || undefined,
  };
}

async function main() {
  const files = ['Bot Telegram Inmobiliaria.json', 'SIMPLE-02 WhatsApp Bot.json'];
  for (const file of files) {
    const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8'));
    const n = patchWorkflow(wf);
    writeSurgical(file, wf);
    console.log('json', file, n);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  for (const id of ['8JoSfkcn3pE1f0av', 'npq6sC6YLaUBpHac']) {
    const live = await request('GET', '/api/v1/workflows/' + id, key);
    if (id === 'pAoeaGKRj49HvgJq') throw new Error('tesis');
    const n = patchWorkflow(live);
    await request('PUT', '/api/v1/workflows/' + id, key, putBody(live));
    console.log('live', id, n);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
