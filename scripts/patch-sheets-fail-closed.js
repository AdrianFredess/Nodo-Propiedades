/**
 * Aplica fail-closed de Sheets sobre los JSON de TG y WA.
 * Con --live también hace PUT del workflow activo en n8n (no toca la copia de tesis).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HELPER = fs.readFileSync(path.join(__dirname, 'snippets', 'sheets-fail-closed.js'), 'utf8');

const TG_STOCK_NEW = `const lecturaStock = leerFilasSheets('Leer Stock Propiedades');
const sheetsError = !lecturaStock.ok;
const sheetsErrorNodo = sheetsError ? 'Leer Stock Propiedades' : '';
const sheetsErrorMsg = sheetsError ? lecturaStock.error : '';
let stockItems = lecturaStock.rows;
if (
  !sheetsError &&
  !stockItems.length &&
  demoModeActivo() &&
  Array.isArray(STOCK_FALLBACK) &&
  STOCK_FALLBACK.length
) {
  stockItems = STOCK_FALLBACK;
}
let alertarSheets = false;
if (sheetsError && typeof $getWorkflowStaticData === 'function') {
  alertarSheets = debeAlertarSheets($getWorkflowStaticData('global'), Date.now());
}
`;

const WA_STOCK_NEW = TG_STOCK_NEW.replace(/Leer Stock Propiedades/g, 'Leer Stock Propiedades WA').replace(
  /stockItems/g,
  'stockItemsEarly',
);

function mustReplace(code, re, next, label) {
  if (!re.test(code)) throw new Error('No encontre el bloque: ' + label);
  return code.replace(re, next);
}

function prependHelper(code) {
  if (code.includes('function clasificarLecturaSheets')) return code;
  return HELPER + '\n' + code;
}

function patchPrompt(code, kind) {
  if (code.includes('const lecturaStock = leerFilasSheets')) return prependHelper(code);
  const re =
    kind === 'tg'
      ? /let stockItems = \[\];[\s\S]*?if \(!stockItems\.length && Array\.isArray\(STOCK_FALLBACK\)[\s\S]*?\{\s*stockItems = STOCK_FALLBACK;\s*\}/
      : /let stockItemsEarly = \[\];[\s\S]*?if \(!stockItemsEarly\.length && Array\.isArray\(STOCK_FALLBACK\)[\s\S]*?\{\s*stockItemsEarly = STOCK_FALLBACK;\s*\}/;
  let out = mustReplace(code, re, kind === 'tg' ? TG_STOCK_NEW : WA_STOCK_NEW, 'stock ' + kind);
  out = prependHelper(out);
  if (kind === 'tg') {
    if (!out.includes('sheets_error: sheetsError')) {
      out = out.replace(
        'derivacion_pausar: Boolean(clasif.derivacion_pausar),',
        `derivacion_pausar: Boolean(clasif.derivacion_pausar),
      sheets_error: sheetsError,
      sheets_error_nodo: sheetsErrorNodo,
      sheets_error_msg: sheetsErrorMsg,
      alertar_sheets: alertarSheets,
      respuesta_fija: sheetsError ? RESPUESTA_SHEETS_CAIDO : '',`,
      );
    }
    out = out.replace(
      /sugerencias_ids: JSON\.stringify\(sugerenciasIds\),/,
      "sugerencias_ids: sheetsError ? '[]' : JSON.stringify(sugerenciasIds),",
    );
    out = out.replace(
      /debe_mostrar_propiedades:\s*debeMostrarPropiedades &&\s*!esOffTopic &&\s*\(!esAlquilerPresupuestoAlto \|\| pideOpciones\),/,
      `debe_mostrar_propiedades: sheetsError
        ? false
        : debeMostrarPropiedades &&
          !esOffTopic &&
          (!esAlquilerPresupuestoAlto || pideOpciones),`,
    );
  } else if (!out.includes('sheets_error: sheetsError')) {
    out = out.replace(
      'ya_aclaro_compra_alquiler: Boolean(clasif.ya_aclaro_compra_alquiler),',
      `ya_aclaro_compra_alquiler: Boolean(clasif.ya_aclaro_compra_alquiler),
      sheets_error: sheetsError,
      sheets_error_nodo: sheetsErrorNodo,
      sheets_error_msg: sheetsErrorMsg,
      alertar_sheets: alertarSheets,
      respuesta_fija: sheetsError ? RESPUESTA_SHEETS_CAIDO : '',`,
    );
    out = out.replace(
      /sugerencias_ids: JSON\.stringify\(sugerenciasIds\),/,
      "sugerencias_ids: sheetsError ? '[]' : JSON.stringify(sugerenciasIds),",
    );
    out = out.replace(
      'debe_mostrar_propiedades: debeMostrarPropiedades && !respuesta_forzada,',
      'debe_mostrar_propiedades: sheetsError ? false : debeMostrarPropiedades && !respuesta_forzada,',
    );
  }
  return out;
}

function patchParsear(code) {
  let out = code;
  if (!out.includes("motivo: 'sheets_error'")) {
    out = mustReplace(
      out,
      /let derivacion =\s*typeof clasificarDerivacionHumano === 'function'[\s\S]*?pausar: Boolean\(promptData\.derivacion_pausar\),\s*\};/,
      (m) =>
        m +
        `
if (promptData.sheets_error) {
  derivacion = {
    categoria: 'C',
    motivo: 'sheets_error',
    alertar: Boolean(promptData.alertar_sheets),
    pausar: true,
  };
}
`,
      'derivacion tg',
    );
  }
  out = out.replace(
    `if (derivacion.categoria === 'C' && !skipReply) {
  respuestaBot = mensajeDerivacionTxt;`,
    `if (derivacion.categoria === 'C' && !skipReply) {
  respuestaBot =
    derivacion.motivo === 'sheets_error'
      ? 'Dame un rato que chequeo disponibilidad y te confirmo'
      : mensajeDerivacionTxt;`,
  );
  if (!out.includes('Sheets caído:')) {
    out = out.replace('const avisoVendedorTexto =', 'let avisoVendedorTexto =');
    out = out.replace(
      ': String(scoreTemp.notif_resumen || \'\');\n',
      `: String(scoreTemp.notif_resumen || '');
if (promptData.sheets_error) {
  avisoVendedorTexto =
    'Sheets caído: ' +
    String(promptData.sheets_error_nodo || 'Leer Stock') +
    ' ' +
    String(promptData.sheets_error_msg || '').slice(0, 160) +
    (avisoVendedorTexto ? '\\n' + avisoVendedorTexto : '');
}
`,
    );
  }
  if (!out.includes('sheets_error: Boolean(promptData.sheets_error)')) {
    out = out.replace(
      "derivacion_motivo: derivacion.motivo || 'auto',",
      "derivacion_motivo: derivacion.motivo || 'auto',\n      sheets_error: Boolean(promptData.sheets_error),",
    );
  }
  if (!out.includes("respuestaBot = 'Dame un rato que chequeo disponibilidad y te confirmo';")) {
    out = out.replace(
      'return [\n  {\n    json: {\n      chat_id: chatId,',
      `if (promptData.sheets_error) {
  respuestaBot = 'Dame un rato que chequeo disponibilidad y te confirmo';
  propiedadesMostrar = [];
  mensajesExtra = [];
  mensajeCierre = '';
}

return [
  {
    json: {
      chat_id: chatId,`,
    );
  }
  return out;
}

function patchProcesar(code) {
  let out = code;
  if (!out.includes("motivo: 'sheets_error'")) {
    out = out.replace(
      `: { categoria: 'A', motivo: 'auto', alertar: false, pausar: false };`,
      `: { categoria: 'A', motivo: 'auto', alertar: false, pausar: false };
if (prep.sheets_error) {
  derivacionWa = {
    categoria: 'C',
    motivo: 'sheets_error',
    alertar: Boolean(prep.alertar_sheets),
    pausar: true,
  };
  respuesta = 'Dame un rato que chequeo disponibilidad y te confirmo';
  propiedadesMostrar = [];
}`,
    );
  }
  out = out.replace(
    "if (derivacionWa.categoria === 'C') {",
    "if (derivacionWa.categoria === 'C' && derivacionWa.motivo !== 'sheets_error') {",
  );
  if (!out.includes('let avisoSheets')) {
    out = out.replace(
      "if (derivacionWa.categoria === 'C' && derivacionWa.motivo !== 'sheets_error') {",
      `let avisoSheets = avisoWa;
if (prep.sheets_error) {
  avisoSheets =
    'Sheets caído: ' +
    String(prep.sheets_error_nodo || 'Leer Stock') +
    ' ' +
    String(prep.sheets_error_msg || '').slice(0, 160) +
    (avisoWa ? '\\n' + avisoWa : '');
}
if (derivacionWa.categoria === 'C' && derivacionWa.motivo !== 'sheets_error') {`,
    );
    out = out.replace(
      'if (derivacionWa.alertar && avisoWa) scoreTemp.notif_resumen = avisoWa;',
      'if (derivacionWa.alertar && avisoSheets) scoreTemp.notif_resumen = avisoSheets;',
    );
    out = out.replace('aviso_vendedor_texto: avisoWa || \'\',', 'aviso_vendedor_texto: avisoSheets || \'\',');
  }
  if (!out.includes('sheets_error: Boolean(prep.sheets_error)')) {
    out = out.replace(
      "derivacion_motivo: derivacionWa.motivo || 'auto',",
      "derivacion_motivo: derivacionWa.motivo || 'auto',\n      sheets_error: Boolean(prep.sheets_error),",
    );
  }
  if (!out.includes("if (prep.sheets_error) {\n  respuesta = 'Dame un rato")) {
    out = out.replace(
      'const regAprendizaje = prepararRegistroAprendizaje(aprendizajeOpts);\n\nreturn [',
      `const regAprendizaje = prepararRegistroAprendizaje(aprendizajeOpts);

if (prep.sheets_error) {
  respuesta = 'Dame un rato que chequeo disponibilidad y te confirmo';
  propiedadesMostrar = [];
  mensajesExtra = [];
  mensajeCierre = '';
}

return [`,
    );
  }
  return out;
}

function patchRevision(code) {
  if (code.includes("motivo = 'sheets_error'")) return code;
  return code.replace(
    "let motivo = '';\nif (rateLimit) motivo = 'rate_limit';",
    "let motivo = '';\nif ($json.sheets_error) motivo = 'sheets_error';\nelse if (rateLimit) motivo = 'rate_limit';",
  );
}

function patchWorkflow(wf) {
  const byName = (n) => wf.nodes.find((x) => x.name === n);
  const tgPrompt = byName('Construir Prompt');
  const waPrompt = byName('Code - Armar Prompt');
  if (tgPrompt) tgPrompt.parameters.jsCode = patchPrompt(tgPrompt.parameters.jsCode, 'tg');
  if (waPrompt && wf.nodes.some((n) => n.name === 'Leer Stock Propiedades WA')) {
    waPrompt.parameters.jsCode = patchPrompt(waPrompt.parameters.jsCode, 'wa');
  }
  const parsear = byName('Parsear Respuesta');
  if (parsear) parsear.parameters.jsCode = patchParsear(parsear.parameters.jsCode);
  const procesar = byName('Code - Procesar IA');
  if (procesar && waPrompt) procesar.parameters.jsCode = patchProcesar(procesar.parameters.jsCode);
  for (const n of wf.nodes) {
    if (n.name && n.name.startsWith('Code - Preparar Registro Revision')) {
      n.parameters.jsCode = patchRevision(n.parameters.jsCode);
    }
  }
  const ifIa = byName('IF Llamar IA TG');
  if (ifIa) {
    const cond = ifIa.parameters.conditions.conditions[0];
    cond.leftValue = '={{ Boolean($json.skip_reply) || Boolean($json.sheets_error) }}';
  }
  if (waPrompt && byName('IF - Debe Responder')) {
    ensureWaSheetsGate(wf);
  }
  return wf;
}

function ensureWaSheetsGate(wf) {
  if (wf.nodes.some((n) => n.name === 'IF Sheets Caido WA')) return;
  wf.nodes.push({
    id: 'wa-if-sheets-caido',
    name: 'IF Sheets Caido WA',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [900, 200],
    parameters: {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: 'sheets',
            leftValue: '={{ Boolean($json.sheets_error) }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          },
        ],
        options: { version: 2, typeValidation: 'loose' },
      },
    },
  });
  wf.nodes.push({
    id: 'wa-stub-sheets-caido',
    name: 'Stub Sheets Caido WA',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1120, 80],
    parameters: {
      jsCode:
        "const p = $input.first().json || {};\nreturn [{ json: { text: '', sheets_error: true, ...p } }];",
    },
  });
  const armar = wf.connections['Code - Armar Prompt'];
  if (armar && armar.main && armar.main[0] && armar.main[0][0] && armar.main[0][0].node === 'IF - Debe Responder') {
    armar.main[0][0].node = 'IF Sheets Caido WA';
  }
  wf.connections['IF Sheets Caido WA'] = {
    main: [
      [{ node: 'Stub Sheets Caido WA', type: 'main', index: 0 }],
      [{ node: 'IF - Debe Responder', type: 'main', index: 0 }],
    ],
  };
  wf.connections['Stub Sheets Caido WA'] = {
    main: [[{ node: 'Code - Procesar IA', type: 'main', index: 0 }]],
  };
}

function writeJson(file, wf) {
  fs.writeFileSync(path.join(ROOT, 'workflows', file), JSON.stringify(wf, null, 2) + '\n');
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
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
        timeout: 180000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try {
            json = buf ? JSON.parse(buf) : null;
          } catch (_) {
            json = { raw: buf.slice(0, 400) };
          }
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 400)));
            return;
          }
          resolve(json);
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
    patchWorkflow(wf);
    writeJson(file, wf);
    console.log('json', file);
  }
  if (!process.argv.includes('--live')) return;
  const key = apiKey();
  const ids = [
    ['8JoSfkcn3pE1f0av', 'tg'],
    ['npq6sC6YLaUBpHac', 'wa'],
  ];
  for (const [id] of ids) {
    const live = await request('GET', '/api/v1/workflows/' + id, key);
    patchWorkflow(live);
    await request('PUT', '/api/v1/workflows/' + id, key, putBody(live));
    console.log('live', id, live.name);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
