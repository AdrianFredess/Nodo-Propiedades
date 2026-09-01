/**
 * Prueba de rendimiento básica del stack Nodo Propiedades.
 * Uso: node scripts/perf-test.js [--concurrency=10] [--rounds=3]
 *
 * Mide latencia p50/p95 y errores en:
 * - GET panel-leads (n8n)
 * - GET ws-bridge /health
 * - POST ws-bridge /emit
 */
const http = require('http');
const https = require('https');

const LEADS_URL =
  process.env.PERF_LEADS_URL ||
  process.env.VITE_LEADS_API_URL ||
  'http://localhost:5678/webhook/panel-leads';
const BRIDGE_BASE =
  process.env.PERF_BRIDGE_URL ||
  process.env.VITE_WS_EMIT_URL?.replace(/\/emit$/, '') ||
  'http://127.0.0.1:3099';
const CONCURRENCY = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1]) || 10;
const ROUNDS = Number(process.argv.find((a) => a.startsWith('--rounds='))?.split('=')[1]) || 3;

function request(url, options = {}) {
  const started = performance.now();
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    const req = lib.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers,
        timeout: options.timeoutMs || 8000,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            ms: performance.now() - started,
          });
        });
      },
    );
    req.on('error', () =>
      resolve({ ok: false, status: 0, ms: performance.now() - started }),
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, ms: performance.now() - started });
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function bench(name, fn, total) {
  const latencies = [];
  let errors = 0;
  for (let round = 0; round < ROUNDS; round += 1) {
    const batch = Array.from({ length: total }, () => fn());
    const results = await Promise.all(batch);
    for (const r of results) {
      latencies.push(r.ms);
      if (!r.ok) errors += 1;
    }
  }
  latencies.sort((a, b) => a - b);
  return {
    name,
    total: total * ROUNDS,
    errors,
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    max: Math.round(latencies[latencies.length - 1] || 0),
  };
}

async function main() {
  console.log('Nodo Propiedades — perf test\n');
  console.log(`Concurrencia: ${CONCURRENCY} · Rondas: ${ROUNDS}\n`);

  const targets = [
    await bench('panel-leads GET', () => request(LEADS_URL), CONCURRENCY),
    await bench('ws-bridge /health', () => request(`${BRIDGE_BASE}/health`), CONCURRENCY),
    await bench('ws-bridge /emit', () =>
      request(`${BRIDGE_BASE}/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'perf.ping', payload: { ts: Date.now() } }),
      }),
    CONCURRENCY),
  ];

  for (const t of targets) {
    const errPct = t.total ? Math.round((t.errors / t.total) * 100) : 0;
    console.log(`${t.name}`);
    console.log(`  requests: ${t.total} · errores: ${t.errors} (${errPct}%)`);
    console.log(`  latencia ms — p50: ${t.p50} · p95: ${t.p95} · max: ${t.max}\n`);
  }

  console.log('Límites recomendados:');
  console.log('  · panel-leads: ≤5 req/s sostenido (cuota Sheets); polling ≥45s sin WS');
  console.log('  · ws-bridge /emit: ≤60/min por IP (rate limit integrado)');
  console.log('  · Concurrencia panel: ≤20 usuarios con WS + poll 120s');
  console.log('  · Si p95 panel-leads >3000ms o errores >5%: revisar n8n/Sheets\n');

  const bad = targets.some((t) => t.errors / t.total > 0.05);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
