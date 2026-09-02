/**
 * Agrega ejemplos únicos desde export CSV/JSON de Aprendizaje_Matias
 * al seed global data/bot-aprendizaje.json (semi-automático).
 *
 * Uso:
 *   node scripts/aggregate-bot-learning.js
 *   node scripts/aggregate-bot-learning.js --input exports/aprendizaje.csv
 *   node scripts/aggregate-bot-learning.js --dry-run
 *
 * Export manual desde Sheets: Archivo → Descargar → CSV (pestaña Aprendizaje_Matias)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data', 'bot-aprendizaje.json');
const DRY_RUN = process.argv.includes('--dry-run');
const inputIdx = process.argv.indexOf('--input');
const inputArg = process.argv.find((a) => a.startsWith('--input='));
const INPUT =
  inputArg ? inputArg.slice('--input='.length)
  : inputIdx >= 0 ? process.argv[inputIdx + 1]
  : '';

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similitud(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wa = na.split(' ').filter((w) => w.length > 2);
  const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!wa.length || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.length, wb.size);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function loadRowsFromCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name) => headers.indexOf(name);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const ctx = cols[idx('contexto_cliente')] || '';
    const resp = cols[idx('respuesta_matias')] || '';
    if (!ctx || !resp) continue;
    rows.push({
      contexto_cliente: ctx,
      respuesta_matias: resp,
      zona: cols[idx('zona')] || '',
      operacion: cols[idx('operacion')] || '',
      presupuesto: cols[idx('presupuesto')] || '',
      temperatura: cols[idx('temperatura')] || '',
      intencion: cols[idx('intencion')] || '',
      patron: cols[idx('patron')] || '',
    });
  }
  return rows;
}

function loadRowsFromJson(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.rows)) return data.rows;
  return [];
}

function slugId(ctx, resp) {
  const base = normalizar(ctx).slice(0, 40).replace(/\s+/g, '-');
  return 'sheet-' + base.slice(0, 32) + '-' + String(resp.length);
}

function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const ejemplos = Array.isArray(seed.ejemplos) ? seed.ejemplos : [];

  if (!INPUT || !fs.existsSync(INPUT)) {
    console.log(`Seed actual: ${ejemplos.length} ejemplos en ${SEED_PATH}`);
    console.log(`
Para incorporar conversaciones reales desde Google Sheets:

1. Exportá la pestaña Aprendizaje_Matias como CSV
2. Corré: node scripts/aggregate-bot-learning.js --input ruta/al.csv
3. Re-desplegá: node scripts/patch-advisor-learning.js [--deploy]

El script deduplica por similitud (>72%) y agrega hasta 10 filas nuevas por corrida.
`);
    return;
  }

  const ext = path.extname(INPUT).toLowerCase();
  const rows =
    ext === '.json' ? loadRowsFromJson(INPUT) : loadRowsFromCsv(INPUT);

  const candidatos = rows.filter(
    (r) =>
      String(r.contexto_cliente || '').length >= 8 &&
      String(r.respuesta_matias || '').length >= 15,
  );

  let agregados = 0;
  const maxNuevos = 10;

  for (const row of candidatos.slice(-50)) {
    if (agregados >= maxNuevos) break;
    const ctx = String(row.contexto_cliente).trim();
    const resp = String(row.respuesta_matias).trim();
    const dup = ejemplos.some(
      (ex) =>
        similitud(ex.contexto_cliente, ctx) >= 0.72 &&
        similitud(ex.respuesta_matias, resp) >= 0.72,
    );
    if (dup) continue;

    ejemplos.push({
      id: slugId(ctx, resp),
      tags: ['desde_sheets'],
      contexto_cliente: ctx.slice(0, 220),
      respuesta_matias: resp.slice(0, 300),
      zona: String(row.zona || ''),
      operacion: String(row.operacion || ''),
      presupuesto: String(row.presupuesto || ''),
      notas: 'Importado desde Aprendizaje_Matias',
    });
    agregados++;
  }

  seed.ejemplos = ejemplos;
  seed.updated = new Date().toISOString().slice(0, 10);

  if (DRY_RUN) {
    console.log(`DRY-RUN: se agregarían ${agregados} ejemplos (total ${ejemplos.length})`);
    return;
  }

  fs.writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');
  console.log(`OK: +${agregados} ejemplos → ${SEED_PATH} (${ejemplos.length} total)`);
  console.log('Siguiente: node scripts/patch-advisor-learning.js [--deploy]');
}

main();
