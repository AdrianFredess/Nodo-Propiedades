/**
 * Eval de Matías sobre una copia del bot de Telegram.
 * Stock fijo, efectos apagados. No ajusta el prompt.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { execFileSync } = require('child_process');

const PROD = '8JoSfkcn3pE1f0av';
const TESIS = 'pAoeaGKRj49HvgJq';
const NAME = 'CHECK P2 eval matias';
const HOOK = 'p2-eval-matias';
const CASOS_PATH = path.join(__dirname, 'casos-matias.v1.json');
const TEXTO_FIJO_C = 'Te paso con Adrian, en un momento te escribe.';
const RESCATE_429 = 'Dame un segundo que se me trabo';

function fechaStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    p(d.getMonth() + 1) +
    '-' +
    p(d.getDate()) +
    'T' +
    p(d.getHours()) +
    '-' +
    p(d.getMinutes()) +
    '-' +
    p(d.getSeconds())
  );
}

const OUT = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'validacion',
  'eval-matias-' + fechaStamp() + '.csv',
);

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
            json = { raw: buf.slice(0, 300) };
          }
          if (res.statusCode >= 400) {
            reject(new Error(method + ' ' + urlPath + ' ' + res.statusCode + ' ' + buf.slice(0, 300)));
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function putBody(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: s.executionOrder || 'v1' },
  };
}

function toCode(node, js) {
  node.type = 'n8n-nodes-base.code';
  node.typeVersion = 2;
  delete node.credentials;
  node.parameters = { jsCode: js };
  delete node.onError;
}

function claseVigente(mensaje) {
  const file = fs.readFileSync(path.join(__dirname, '..', 'snippets', 'intent-classifier.js'), 'utf8');
  const sandbox = { console, module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(
    file + '\n;this.clasificarDerivacionHumano=clasificarDerivacionHumano;this.mensajeDerivacionCliente=mensajeDerivacionCliente;',
    sandbox,
  );
  return sandbox.clasificarDerivacionHumano(mensaje);
}

function findPriceLikeMatches(text) {
  const re =
    /(?:usd|u\$s|u\$d|us\$|\$)\s*\d|\b\d+\s*(?:usd|d[oó]lares|dolar|d[oó]lar)\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d{5,}\b|\b\d+\s*%|\b\d+\s*por\s*ciento\b/gi;
  return String(text || '').match(re) || [];
}

function tienePrecioExacto(text, n) {
  const plano = String(text || '')
    .replace(/(\d)\.(?=\d{3}\b)/g, '$1')
    .replace(/(\d),(?=\d{3}\b)/g, '$1');
  return plano.includes(String(n));
}

function sinPuntuacionFinal(s) {
  return String(s || '')
    .trim()
    .replace(/[.!?…]+$/g, '')
    .trim();
}

function codigos(text) {
  return String(text || '').match(/\b[A-Z]{2,5}-\d{2,4}\b/g) || [];
}

function fallaTono(text) {
  const t = String(text || '');
  if (t.includes('¿') || t.includes('¡')) return 'tono_signos';
  if (/\bun par\b/i.test(t)) return 'tono_un_par';
  if (/va a mostrar|voy a mostrar|te voy a mostrar|ac[aá] te muestro/i.test(t)) return 'tono_anuncio';
  return '';
}

function evaluar(caso, parse, stockIds) {
  const resp = String(parse.respuesta_bot || '');
  const cat = String(parse.derivacion_categoria || '');
  const fallas = [];
  if (parse.sheets_error) fallas.push('sheets_error');
  for (const regla of caso.reglas) {
    if (regla === 'no_monto' && findPriceLikeMatches(resp).length) fallas.push('no_monto');
    else if (regla === 'no_porcentaje' && /\d+\s*%|\d+\s*por\s*ciento/i.test(resp)) fallas.push('no_porcentaje');
    else if (regla === 'no_codigo_fuera_de_stock') {
      const ajenos = codigos(resp).filter((c) => !stockIds.has(c));
      if (ajenos.length) fallas.push('no_codigo_fuera_de_stock');
    } else if (regla === 'no_ficha_chacras' && /en chacras (tengo|hay|tenemos|esta|está|sale)/i.test(resp)) {
      fallas.push('no_ficha_chacras');
    } else if (regla.startsWith('precio_exacto:')) {
      const n = regla.split(':')[1];
      if (!tienePrecioExacto(resp, n)) fallas.push('precio_exacto');
    } else if (regla.startsWith('categoria:') && cat !== regla.split(':')[1]) {
      fallas.push(regla);
    } else if (regla.startsWith('no_categoria:') && cat === regla.split(':')[1]) {
      fallas.push(regla);
    } else if (regla === 'texto_fijo_c' && sinPuntuacionFinal(resp) !== sinPuntuacionFinal(TEXTO_FIJO_C)) {
      fallas.push('texto_fijo_c');
    } else if (regla === 'clase_vigente') {
      const esp = claseVigente(caso.mensaje);
      if (cat !== esp.categoria) fallas.push('clase_vigente');
    } else if (regla.startsWith('forbids:')) {
      const malos = regla.slice('forbids:'.length).split('|');
      const bajo = resp.toLowerCase();
      if (malos.some((m) => bajo.includes(m.toLowerCase()))) fallas.push('forbids');
    } else if (
      regla === 'no_filtra_prompt' &&
      /INTENCION_DETECTADA|mostrar_stock|SYSTEM_MIN|clasificarDerivacion/i.test(resp)
    ) {
      fallas.push('no_filtra_prompt');
    } else if (regla === 'responde' && resp.trim().length < 8) {
      fallas.push('responde');
    } else if (regla === 'tono') {
      const t = fallaTono(resp);
      if (t) fallas.push(t);
    }
  }
  return { pass: fallas.length === 0, regla_fallida: fallas.join('|'), respuesta: resp };
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function espera429(groqJson, parse, tokens) {
  const blob = JSON.stringify(groqJson || {});
  const m = blob.match(/try again in\s*([\d.]+)\s*s/i);
  const delBody = m ? Math.ceil(Number(m[1]) + 1) : 0;
  return Math.max(Number(parse.wait_retry_sec) || 0, delBody, esperaSegundos(tokens), 20);
}

function esRespuesta429(groqJson, groqErr, parse) {
  const blob = JSON.stringify(groqJson || {});
  const status = Number((groqJson && (groqJson.statusCode || groqJson.status)) || 0);
  const code = String((groqJson && groqJson.error && groqJson.error.code) || '');
  const resp = String((parse && parse.respuesta_bot) || '');
  return (
    status === 429 ||
    code === 'rate_limit_exceeded' ||
    /429|rate.?limit|rate_limit_exceeded/i.test(blob + ' ' + groqErr) ||
    Boolean(parse && (parse.rate_limit || parse.retry_groq || parse.reenvio_rate_limit)) ||
    resp.includes(RESCATE_429)
  );
}

function esperaSegundos(tokens) {
  const n = Number(tokens) || 0;
  return Math.ceil((n / 8000) * 60) * 1.2;
}

(async () => {
  const pack = JSON.parse(fs.readFileSync(CASOS_PATH, 'utf8'));
  const stockIds = new Set(pack.stock.map((r) => String(r.id)));
  const key = apiKey();
  const prod = await request('GET', '/api/v1/workflows/' + PROD, key);
  const list = await request('GET', '/api/v1/workflows?limit=100', key);
  const existing = (list.data || []).find((w) => w.name === NAME);
  const wf = JSON.parse(JSON.stringify(prod));
  delete wf.id;
  delete wf.versionId;
  delete wf.meta;
  delete wf.active;
  wf.name = NAME;

  const stock = wf.nodes.find((n) => n.name === 'Leer Stock Propiedades');
  toCode(
    stock,
    'const rows = ' + JSON.stringify(pack.stock) + ';\nreturn rows.map((json) => ({ json }));',
  );
  const hist = wf.nodes.find((n) => n.name === 'Leer Historial');
  if (hist) toCode(hist, 'return [{ json: {} }];');
  const pol = wf.nodes.find((n) => n.name === 'Leer Politicas Pago');
  if (pol) {
    toCode(pol, 'const rows = ' + JSON.stringify(pack.politicas) + ';\nreturn rows.map((json) => ({ json }));');
  }
  const audio = wf.nodes.find((n) => n.name === 'Transcribir Audio TG');
  if (audio) {
    toCode(
      audio,
      "const j = $input.first().json || {};\nreturn [{ json: { ...j, texto_usuario: String(j.texto_usuario || ''), transcripcion: '' } }];",
    );
  }
  const trig = wf.nodes.find((n) => n.name === 'Telegram Trigger');
  if (trig) trig.disabled = true;
  for (const name of [
    'Guardar Lead',
    'Actualizar Historial',
    'Sync Leads_Bot',
    'Registrar Consulta Telegram',
    'Email Lead Caliente',
    'Email Solicitud Visita',
    'Emit Panel Realtime',
    'Emit Lead Updated',
    'Telegram Responder',
    'Telegram Alerta Owner',
  ]) {
    const n = wf.nodes.find((x) => x.name === name);
    if (n) n.disabled = true;
  }
  if (!wf.nodes.some((n) => n.name === 'Webhook P2')) {
    wf.nodes.push({
      id: 'wh-p2-eval',
      name: 'Webhook P2',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 900],
      webhookId: HOOK,
      parameters: { httpMethod: 'POST', path: HOOK, responseMode: 'onReceived', options: {} },
    });
    wf.nodes.push({
      id: 'norm-p2-eval',
      name: 'Normalizar P2',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [420, 900],
      parameters: { jsCode: 'const b = $json.body || $json; return [{ json: b }];' },
    });
  }
  wf.connections['Webhook P2'] = { main: [[{ node: 'Normalizar P2', type: 'main', index: 0 }]] };
  wf.connections['Normalizar P2'] = { main: [[{ node: 'Set Variables', type: 'main', index: 0 }]] };

  let id = existing && existing.id;
  if (id === TESIS || id === PROD) throw new Error('id protegido ' + id);
  if (id) await request('DELETE', '/api/v1/workflows/' + id, key);
  const created = await request('POST', '/api/v1/workflows', key, putBody(wf));
  id = created.id;
  await request('POST', '/api/v1/workflows/' + id + '/activate', key);
  console.log('copia', id);

  async function latestExecId() {
    const execs = await request('GET', '/api/v1/executions?workflowId=' + id + '&limit=1', key);
    return (execs.data && execs.data[0] && execs.data[0].id) || '';
  }

  async function correr(mensaje, chatId) {
    const before = await latestExecId();
    await request('POST', '/webhook/' + HOOK, key, {
      message: { chat: { id: chatId }, from: { first_name: 'Eval' }, text: mensaje },
    });
    for (let k = 0; k < 40; k++) {
      await sleep(1500);
      const execs = await request('GET', '/api/v1/executions?workflowId=' + id + '&limit=3', key);
      const row = (execs.data || []).find((e) => Number(e.id) > Number(before || 0));
      if (row && (row.status === 'success' || row.status === 'error' || row.finished)) return row.id;
    }
    throw new Error('sin ejecucion');
  }

  const filas = [];
  for (let i = 0; i < pack.casos.length; i++) {
    const caso = pack.casos[i];
    let parse = {};
    let tokens = 2000;
    let groq429 = false;
    let eid = '';
    let run = {};
    for (let intento = 0; intento < 3; intento++) {
      eid = await correr(caso.mensaje, 891200000 + i);
      const full = await request('GET', '/api/v1/executions/' + eid + '?includeData=true', key);
      run = (full.data && full.data.resultData && full.data.resultData.runData) || {};
      const parseNode = run['Parsear Respuesta'] && run['Parsear Respuesta'][0];
      parse =
        (parseNode &&
          parseNode.data &&
          parseNode.data.main &&
          parseNode.data.main[0] &&
          parseNode.data.main[0][0] &&
          parseNode.data.main[0][0].json) ||
        {};
      const groq = run['HTTP Groq'] && run['HTTP Groq'][0];
      const groqJson =
        (groq &&
          groq.data &&
          groq.data.main &&
          groq.data.main[0] &&
          groq.data.main[0][0] &&
          groq.data.main[0][0].json) ||
        {};
      tokens = Number(groqJson.usage && (groqJson.usage.total_tokens || groqJson.usage.prompt_tokens)) || tokens;
      const err = String((groq && groq.error && groq.error.message) || '');
      groq429 = esRespuesta429(groqJson, err, parse);
      if (!groq429) break;
      const espera = espera429(groqJson, parse, tokens);
      console.log(caso.id, 'reintento', intento + 1, 'espera', espera);
      await sleep(espera * 1000);
    }
    const ev = groq429
      ? { pass: false, regla_fallida: 'sin_respuesta_429', respuesta: String(parse.respuesta_bot || '') }
      : evaluar(caso, parse, stockIds);
    filas.push(ev.pass + ' ' + caso.id + ' ' + ev.regla_fallida);
    console.log(filas[filas.length - 1]);
    if (caso.id === 'B1') {
      const promptNode = run['Construir Prompt'] && run['Construir Prompt'][0];
      const pj =
        (promptNode &&
          promptNode.data &&
          promptNode.data.main &&
          promptNode.data.main[0] &&
          promptNode.data.main[0][0] &&
          promptNode.data.main[0][0].json) ||
        {};
      const texto = (pj.messages || []).map((m) => String(m.content || '')).join('\n');
      const marca = 'STOCK (solo IDs de esta lista):';
      const desde = texto.indexOf(marca);
      const hasta = texto.indexOf('MOSTRAR PROPIEDADES', desde + 1);
      const bloque =
        desde < 0
          ? '(el prompt no trajo el bloque STOCK)'
          : texto.slice(desde, hasta > desde ? hasta : desde + 1500);
      const b1 = path.join(
        __dirname,
        '..',
        '..',
        'docs',
        'validacion',
        'p2-b1-stock-prompt-' + fechaStamp() + '.md',
      );
      fs.writeFileSync(
        b1,
        [
          '# B1 — precio que sí estaba en el stock de prueba',
          '',
          '- exec_id: ' + eid,
          '- pass: ' + (ev.pass ? 'true' : 'false'),
          '- regla_fallida: ' + ev.regla_fallida,
          '- sheets_error: ' + Boolean(parse.sheets_error),
          '',
          '## Respuesta completa',
          '',
          ev.respuesta || '(vacía)',
          '',
          '## Bloque de stock que llegó al prompt',
          '',
          bloque.trim(),
          '',
        ].join('\n'),
      );
      console.log('b1', b1, eid);
    }
    const line = [caso.id, caso.familia, ev.pass ? 'true' : 'false', ev.regla_fallida, ev.respuesta]
      .map(csvCell)
      .join(',');
    if (i === 0) fs.writeFileSync(OUT, 'id,familia,pass,regla_fallida,respuesta\n' + line + '\n');
    else fs.appendFileSync(OUT, line + '\n');
    if (i < pack.casos.length - 1) {
      const seg = esperaSegundos(tokens);
      console.log('espera', seg, 's');
      await sleep(seg * 1000);
    }
  }

  await request('POST', '/api/v1/workflows/' + id + '/deactivate', key);
  console.log('csv', OUT);
  console.log(filas.join('\n'));
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
