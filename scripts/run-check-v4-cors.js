/**
 * V4: los 6 webhooks sin token dan 401. Pega la salida, sin imprimir el token.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const OUT = path.join(__dirname, '..', 'docs', 'validacion', 'v4-cors-ngrok-2026-09-28.md');
const PATHS = [
  ['GET', '/webhook/panel-leads'],
  ['POST', '/webhook/envio-masivo'],
  ['POST', '/webhook/panel-stock-update'],
  ['POST', '/webhook/panel-realtime-emit'],
  ['POST', '/webhook/panel-lead-actions'],
  ['POST', '/webhook/panel-assistant'],
];

function publicBase() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = raw.match(/^(?:WEBHOOK_URL|PUBLIC_BASE_URL)=(.*)$/m);
  return m ? String(m[1]).trim().replace(/\/$/, '') : '';
}

function curl(base, urlPath, method, headers) {
  return new Promise((resolve) => {
    const url = new URL(base + urlPath);
    const lib = url.protocol === 'https:' ? https : http;
    const r = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method,
        headers: headers || {},
        timeout: 20000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          const acao = res.headers['access-control-allow-origin'] || '';
          const allowHeaders = res.headers['access-control-allow-headers'] || '';
          resolve(method + ' ' + urlPath + ' -> ' + res.statusCode + ' origin=' + acao + ' allow-headers=' + allowHeaders + ' body=' + buf.slice(0, 80).replace(/\s+/g, ' '));
        });
      },
    );
    r.on('error', (e) => resolve(method + ' ' + urlPath + ' -> ERROR ' + e.message));
    r.on('timeout', () => {
      r.destroy();
      resolve(method + ' ' + urlPath + ' -> TIMEOUT');
    });
    r.end();
  });
}

(async () => {
  const base = publicBase();
  const lines = ['# V4 — CORS y webhooks sin token', '', 'ngrok en `.env`: `' + base + '` (si está caído, queda marcado).', ''];
  for (const host of [base, 'http://127.0.0.1:5678']) {
    lines.push('## ' + host, '');
    for (const [method, p] of PATHS) {
      lines.push(await curl(host, p, method, { 'Content-Type': 'application/json' }));
      lines.push(
        await curl(host, p, 'OPTIONS', {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': method,
          'Access-Control-Request-Headers': 'X-Panel-Token',
        }),
      );
    }
    lines.push('');
  }
  const md = lines.join('\n');
  fs.writeFileSync(OUT, md);
  console.log(md);
})();
