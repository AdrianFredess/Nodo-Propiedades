/**
 * Healthcheck básico del stack Nodo Propiedades.
 * Uso: node scripts/doctor.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');

function check(name, ok, detail) {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, { headers, timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        resolve({ ok: res.statusCode < 500, status: res.statusCode, body });
      });
    });
    req.on('error', () => resolve({ ok: false, status: 0, body: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: '' });
    });
  });
}

async function main() {
  console.log('Nodo Propiedades — doctor\n');
  let allOk = true;

  const mediaPath = path.join(ROOT, 'data', 'propiedad-media.json');
  if (fs.existsSync(mediaPath)) {
    const media = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
    const count = Object.keys(media).length;
    const withToken = Object.values(media).filter((m) => m?.shareToken).length;
    allOk =
      check('Media stock', count >= 30, `${count} propiedades`) && allOk;
    allOk =
      check(
        'Tokens ficha pública',
        withToken === count && count > 0,
        `${withToken}/${count} con shareToken`,
      ) && allOk;
    const sample = Object.entries(media)[0];
    if (sample) {
      const [id, rec] = sample;
      const link = rec?.linkFicha || '';
      allOk =
        check(
          'Link ficha privada',
          link.includes('/p/') && link.includes(rec.shareToken),
          `${id} → /p/…/${rec.shareToken?.slice(0, 6)}…`,
        ) && allOk;
    }
  } else {
    allOk = check('Media stock', false, 'falta data/propiedad-media.json') && allOk;
  }

  const csvPath = path.join(ROOT, 'csv', 'Simulacion_30_Propiedades_Mendoza.csv');
  allOk = check('CSV stock', fs.existsSync(csvPath)) && allOk;

  const n8n = await httpGet('http://localhost:5678/healthz');
  allOk = check('n8n', n8n.ok, n8n.ok ? `HTTP ${n8n.status}` : 'no responde en :5678') && allOk;

  const ws = await httpGet('http://localhost:3099/health');
  allOk =
    check('ws-bridge', ws.ok, ws.ok ? `HTTP ${ws.status}` : 'no responde en :3099') &&
    allOk;
  if (ws.ok && ws.body) {
    try {
      const health = JSON.parse(ws.body);
      check(
        'ws-bridge rate limit',
        Boolean(health.emitRate?.max),
        `${health.emitRate?.max}/min`,
      );
    } catch {
      /* ignore */
    }
  }

  const front = await httpGet('http://localhost:5173/');
  check('Front dev', front.ok, front.ok ? 'corriendo :5173' : 'no detectado (opcional)');

  const pgSchema = path.join(ROOT, 'supabase', 'migrations', '001_leads_schema.sql');
  check(
    'Postgres schema',
    fs.existsSync(pgSchema),
    fs.existsSync(pgSchema) ? '001_leads_schema.sql listo (sin migrar)' : 'falta migration',
  );

  check(
    'Script perf-test',
    fs.existsSync(path.join(ROOT, 'scripts', 'perf-test.js')),
    'node scripts/perf-test.js',
  );

  console.log(allOk ? '\nEstado: OK' : '\nEstado: revisar ítems marcados ✗');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
