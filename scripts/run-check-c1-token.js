/**
 * Curl de los webhooks del panel, sin token y con token. No imprime el token.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const OUT = path.join(__dirname, '..', 'docs', 'validacion', 'c1-panel-token-2026-09-28.md');

function token() {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = raw.match(/^PANEL_API_TOKEN=(.*)$/m);
  if (!m || !String(m[1]).trim()) throw new Error('Falta PANEL_API_TOKEN en .env');
  return String(m[1]).trim().replace(/^["']|["']$/g, '');
}

function call(method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: urlPath,
        method,
        headers: Object.assign({}, headers || {}, data ? { 'Content-Length': data.length } : {}),
        timeout: 60000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: buf.slice(0, 180) }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const tok = token();
  const sinLeads = await call('GET', '/webhook/panel-leads');
  const conLeads = await call('GET', '/webhook/panel-leads', { 'X-Panel-Token': tok });
  const sinEmit = await call('POST', '/webhook/panel-realtime-emit', { 'Content-Type': 'application/json' }, '{}');
  const conEmit = await call(
    'POST',
    '/webhook/panel-realtime-emit',
    { 'Content-Type': 'application/json', 'X-Panel-Token': tok },
    JSON.stringify({ type: 'leads.refresh', payload: { origen: 'check-c1' } }),
  );
  const mal = await call('GET', '/webhook/panel-leads', { 'X-Panel-Token': 'token-incorrecto' });
  const md = [
    '# C1 — Token en los webhooks del panel',
    '',
    'El valor del token no está en este archivo.',
    '',
    '- GET `/webhook/panel-leads` sin header: **' + sinLeads.status + '** ' + sinLeads.body.replace(/\s+/g, ' '),
    '- GET `/webhook/panel-leads` con token incorrecto: **' + mal.status + '**',
    '- GET `/webhook/panel-leads` con `X-Panel-Token`: **' + conLeads.status + '**',
    '- POST `/webhook/panel-realtime-emit` sin header: **' + sinEmit.status + '** ' + sinEmit.body.replace(/\s+/g, ' '),
    '- POST `/webhook/panel-realtime-emit` con `X-Panel-Token`: **' + conEmit.status + '**',
    '',
  ].join('\n');
  fs.writeFileSync(OUT, md);
  console.log(md);
  if (sinLeads.status !== 401 || mal.status !== 401 || sinEmit.status !== 401) process.exit(1);
  if (conLeads.status === 401 || conEmit.status === 401) process.exit(1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
