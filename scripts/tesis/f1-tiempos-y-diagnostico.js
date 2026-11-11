#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseCsv, rowsToCsv, csvEscape } = require('./lib/campana-utils');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'docs', 'validacion', 'campana-flujo-3f132c3-2026-11-11');
const ESTADO = path.join(OUT_DIR, 'estado-corrida.json');
const SMOKE = path.join(OUT_DIR, 'smoke-row.json');
const PROD_ID = '8JoSfkcn3pE1f0av';
const TODAY = new Date().toISOString().slice(0, 10);

function apiKey() {
  const code =
    "import sqlite3\n" +
    "c=sqlite3.connect(r'file:C:/Users/adrian/.n8n/database.sqlite?mode=ro', uri=True)\n" +
    "row=c.execute(\"SELECT apiKey FROM user_api_keys WHERE label='n8n'\").fetchone()\n" +
    "print(row[0] if row else '')\n";
  return execFileSync('py', ['-3', '-c', code], { encoding: 'utf8' }).trim();
}

function request(method, urlPath, key) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: { 'X-N8N-API-KEY': key },
        timeout: 120000,
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
          resolve({ status: res.statusCode, json, raw: buf });
        });
      },
    );
    r.on('error', reject);
    r.end();
  });
}

function docId(p) {
  const d = p?.documentId;
  if (d == null) return null;
  if (typeof d === 'string') return d;
  return d.value ?? null;
}
function sheetName(p) {
  const s = p?.sheetName;
  if (s == null) return null;
  if (typeof s === 'string') return s;
  return s.value ?? null;
}
function mappedCols(p) {
  const v = p?.columns?.value;
  if (!v || typeof v !== 'object') return [];
  return Object.keys(v);
}
function matchingCols(p) {
  return p?.columns?.matchingColumns || [];
}

async function fetchExec(key, id) {
  const r = await request('GET', `/api/v1/executions/${id}?includeData=true`, key);
  if (r.status === 404) return null;
  if (r.status >= 400) return { error: r.status, raw: r.raw.slice(0, 200) };
  return r.json;
}

function tHastaRespuesta(exec) {
  const started = Date.parse(exec.startedAt);
  const parse = exec.data?.resultData?.runData?.['Parsear Respuesta']?.[0];
  if (!parse || !Number.isFinite(started)) return { t: '', notas: 'sin Parsear Respuesta' };
  const start = Number(parse.startTime);
  const dur = Number(parse.executionTime);
  if (!Number.isFinite(start) || !Number.isFinite(dur)) {
    return { t: '', notas: 'sin startTime/executionTime Parsear' };
  }
  return { t: String(start + dur - started), notas: '' };
}

function tTelegramInicio(exec) {
  const started = Date.parse(exec.startedAt);
  const node =
    exec.data?.resultData?.runData?.['Telegram Responder']?.[0] ||
    exec.data?.resultData?.runData?.['Telegram Responder']?.[0];
  // disabled nodes may still appear
  const run = exec.data?.resultData?.runData || {};
  const tg = run['Telegram Responder']?.[0];
  if (!tg || !Number.isFinite(started)) return '';
  const st = Number(tg.startTime);
  if (!Number.isFinite(st)) return '';
  return String(st - started);
}

async function f11(key) {
  const estado = JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  const smoke = JSON.parse(fs.readFileSync(SMOKE, 'utf8'));
  const cases = [{ id: 'SMOKE', exec_id: smoke.exec_id }, ...estado.rows.map((r) => ({ id: r.id, exec_id: r.exec_id }))];

  const out = [];
  let missing = 0;
  for (const c of cases) {
    const exec = await fetchExec(key, c.exec_id);
    if (!exec || exec.error) {
      missing += 1;
      out.push({
        id: c.id,
        exec_id: c.exec_id,
        t_hasta_respuesta_ms: '',
        t_telegram_responder_inicio_ms: '',
        notas: exec?.error ? `http_${exec.error}` : 'ejecucion_no_disponible',
      });
      continue;
    }
    const tr = tHastaRespuesta(exec);
    out.push({
      id: c.id,
      exec_id: String(c.exec_id),
      t_hasta_respuesta_ms: tr.t,
      t_telegram_responder_inicio_ms: tTelegramInicio(exec),
      notas: tr.notas,
    });
  }

  const csvPath = path.join(OUT_DIR, 'tiempos-respuesta.csv');
  const header = ['id', 'exec_id', 't_hasta_respuesta_ms', 't_telegram_responder_inicio_ms', 'notas'];
  const lines = [header.join(',')];
  for (const r of out) lines.push(header.map((h) => csvEscape(r[h])).join(','));
  fs.writeFileSync(csvPath, lines.join('\n') + '\n');
  return { csvPath, n: out.length, missing, sample: out.slice(0, 3) };
}

async function sheetMeta(key, cred, spreadsheetId) {
  // Use temporary workflow via existing probe pattern is heavy; use HTTP through n8n as before
  // Simpler: call google via a one-shot workflow helper inline
  return null;
}

async function f12(key) {
  const prod = await request('GET', `/api/v1/workflows/${PROD_ID}`, key);
  const wf = prod.json;
  const stockNode = (wf.nodes || []).find((n) => n.name === 'Leer Stock Propiedades');
  const cred = stockNode?.credentials?.googleSheetsOAuth2Api;

  const writers = (wf.nodes || []).filter((n) => {
    if (n.type !== 'n8n-nodes-base.googleSheets') return false;
    const op = n.parameters?.operation || '';
    return /append|update|appendOrUpdate/i.test(op) || n.name.match(/Guardar|Actualizar|Sync|Registrar/i);
  });

  // Also include tag Guardar Lead destination for diagnosis
  const lines = [
    `# Diagnóstico planillas de producción — ${TODAY}`,
    '',
    `- Workflow: \`${PROD_ID}\` (solo lectura)`,
    `- Credencial Sheets: \`${cred?.name || '?'}\``,
    '',
  ];

  // Helper HTTP via n8n
  async function gget(url) {
    const pathWh = 'diag-' + crypto.randomUUID().slice(0, 8);
    const body = {
      name: '_TMP Diag Sheets',
      nodes: [
        {
          id: 'wh',
          name: 'Webhook',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2,
          position: [0, 0],
          webhookId: crypto.randomUUID(),
          parameters: {
            httpMethod: 'GET',
            path: pathWh,
            responseMode: 'lastNode',
            options: {},
          },
        },
        {
          id: 'http',
          name: 'HTTP',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.2,
          position: [260, 0],
          credentials: { googleSheetsOAuth2Api: { id: cred.id, name: cred.name } },
          parameters: {
            method: 'GET',
            url,
            authentication: 'predefinedCredentialType',
            nodeCredentialType: 'googleSheetsOAuth2Api',
            options: {},
          },
          onError: 'continueRegularOutput',
        },
      ],
      connections: { Webhook: { main: [[{ node: 'HTTP', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' },
    };
    const created = await new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const r = http.request(
        {
          hostname: '127.0.0.1',
          port: 5678,
          path: '/api/v1/workflows',
          method: 'POST',
          headers: {
            'X-N8N-API-KEY': key,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }));
        },
      );
      r.on('error', reject);
      r.write(data);
      r.end();
    });
    const id = created.json.id;
    try {
      await request('POST', `/api/v1/workflows/${id}/activate`, key);
      await new Promise((resolve, reject) => {
        const r = http.request(
          { hostname: '127.0.0.1', port: 5678, path: '/webhook/' + pathWh, method: 'GET', timeout: 60000 },
          (res) => {
            res.resume();
            res.on('end', resolve);
          },
        );
        r.on('error', reject);
        r.end();
      });
      for (let i = 0; i < 30; i++) {
        const listEx = await request(
          'GET',
          `/api/v1/executions?workflowId=${id}&limit=2&includeData=true`,
          key,
        );
        const ex = listEx.json?.data?.[0];
        if (ex && (ex.status === 'success' || ex.status === 'error')) {
          return ex.data?.resultData?.runData?.HTTP?.[0]?.data?.main?.[0]?.[0]?.json || { error: 'empty' };
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      return { error: 'timeout' };
    } finally {
      try {
        await request('POST', `/api/v1/workflows/${id}/deactivate`, key);
      } catch (_) {}
      await request('DELETE', `/api/v1/workflows/${id}`, key);
    }
  }

  // Recent executions for errors
  const execList = await request(
    'GET',
    `/api/v1/executions?workflowId=${PROD_ID}&limit=30&includeData=false`,
    key,
  );

  for (const n of writers) {
    const idDoc = docId(n.parameters);
    const sh = sheetName(n.parameters);
    const cols = mappedCols(n.parameters);
    const match = matchingCols(n.parameters);
    lines.push(`## ${n.name}`);
    lines.push('');
    lines.push(`- operation: \`${n.parameters?.operation || ''}\``);
    lines.push(`- documentId: \`${idDoc}\``);
    lines.push(`- sheetName: \`${sh}\``);
    lines.push(`- matchingColumns: ${match.map((c) => '`' + c + '`').join(', ') || '(ninguna)'}`);
    lines.push(`- columnas mapeadas: ${cols.map((c) => '`' + c + '`').join(', ') || '(ninguna)'}`);

    let tabs = [];
    let headers = [];
    let tabExists = null;
    if (idDoc && !String(idDoc).includes('__SET_')) {
      const meta = await gget(
        `https://sheets.googleapis.com/v4/spreadsheets/${idDoc}?fields=properties.title,sheets.properties.title`,
      );
      tabs = (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean);
      lines.push(`- título planilla: \`${meta.properties?.title || '?'}\``);
      lines.push(`- pestañas: ${tabs.map((t) => '`' + t + '`').join(', ') || '(ninguna)'}`);
      tabExists = sh ? tabs.includes(sh) : null;
      lines.push(`- pestaña destino existe: **${tabExists === null ? 'n/d' : tabExists ? 'sí' : 'no'}**`);
      if (sh && tabExists) {
        const enc = encodeURIComponent(sh);
        const vals = await gget(
          `https://sheets.googleapis.com/v4/spreadsheets/${idDoc}/values/${enc}!1:1`,
        );
        headers = vals.values?.[0] || [];
        lines.push(`- encabezados reales: ${headers.map((h) => '`' + h + '`').join(' | ') || '(vacío)'}`);
        const missing = cols.filter((c) => !headers.includes(c));
        const matchMissing = match.filter((c) => !headers.includes(c));
        lines.push(
          `- columnas mapeadas ausentes en encabezados: ${missing.map((c) => '`' + c + '`').join(', ') || '(ninguna)'}`,
        );
        lines.push(
          `- matching ausente: ${matchMissing.map((c) => '`' + c + '`').join(', ') || '(ninguna)'}`,
        );
      }
    } else {
      lines.push('- documentId placeholder o vacío: no se consultó Drive');
    }

    // last error for this node in recent execs (sample up to 10 full)
    let lastErr = '(no encontrado en las últimas 10 ejecuciones muestreadas)';
    const sample = (execList.json?.data || []).slice(0, 10);
    for (const row of sample) {
      const full = await fetchExec(key, row.id);
      if (!full || full.error) continue;
      const items = full.data?.resultData?.runData?.[n.name]?.[0]?.data?.main?.[0] || [];
      for (const it of items) {
        if (it.json?.error) {
          const e = it.json.error;
          lastErr = `exec ${row.id}: ${typeof e === 'string' ? e : e.message || JSON.stringify(e)}`;
          break;
        }
      }
      if (!lastErr.startsWith('(no')) break;
      const top = full.data?.resultData?.error?.message;
      if (top && /sheet|google|grant|invalid/i.test(top)) {
        lastErr = `exec ${row.id} (error top): ${top}`;
        break;
      }
    }
    lines.push(`- última evidencia de error del nodo: ${lastErr}`);
    lines.push('');
  }

  // Extra: tag Guardar Lead 18eZ Sheet1
  lines.push('## Extra — planilla del tag Guardar Lead (`18eZ…` / `Sheet1`)');
  lines.push('');
  const tagId = '18eZ-ryGdRC4jVbzfd11ttITl3VwuW00HPxbAzU0LimQ';
  const metaTag = await gget(
    `https://sheets.googleapis.com/v4/spreadsheets/${tagId}?fields=properties.title,sheets.properties.title`,
  );
  const tabsTag = (metaTag.sheets || []).map((s) => s.properties?.title);
  lines.push(`- título: \`${metaTag.properties?.title || '?'}\``);
  lines.push(`- pestañas: ${tabsTag.map((t) => '`' + t + '`').join(', ')}`);
  lines.push(`- existe \`Sheet1\`: **${tabsTag.includes('Sheet1') ? 'sí' : 'no'}**`);
  if (tabsTag.includes('Hoja 1')) {
    const h = await gget(
      `https://sheets.googleapis.com/v4/spreadsheets/${tagId}/values/Hoja%201!1:1`,
    );
    lines.push(
      `- encabezados \`Hoja 1\`: ${(h.values?.[0] || []).map((x) => '`' + x + '`').join(' | ') || '(vacío)'}`,
    );
  }
  lines.push('');

  // Consultas on prod CRM
  const crmId = docId(
    (wf.nodes || []).find((n) => n.name === 'Registrar Consulta Telegram')?.parameters,
  );
  lines.push('## Extra — hoja `Consultas` (prod)');
  lines.push('');
  if (crmId) {
    const h = await gget(
      `https://sheets.googleapis.com/v4/spreadsheets/${crmId}/values/Consultas!1:1`,
    );
    lines.push(`- documentId: \`${crmId}\``);
    lines.push(
      `- encabezados: ${(h.values?.[0] || []).map((x) => '`' + x + '`').join(' | ') || '(vacío/error)'}`,
    );
    if (h.error) lines.push(`- error: ${JSON.stringify(h.error).slice(0, 300)}`);
  }
  lines.push('');

  const outPath = path.join(
    ROOT,
    'docs',
    'validacion',
    `diagnostico-planillas-produccion-${TODAY}.md`,
  );
  fs.writeFileSync(outPath, lines.join('\n'));
  return { outPath, writers: writers.map((w) => w.name) };
}

async function main() {
  const key = apiKey();
  console.log('F1.1…');
  const t = await f11(key);
  console.log(JSON.stringify(t, null, 2));
  console.log('F1.2…');
  const d = await f12(key);
  console.log(JSON.stringify(d, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
