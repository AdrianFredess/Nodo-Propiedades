/**
 * Genera data/propiedad-media.json — 4 fotos coherentes por propiedad (Unsplash).
 * Uso: node scripts/generate-propiedad-media.js
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { publicFichaUrl, shareToken } = require('./lib/share-token');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'csv', 'Simulacion_30_Propiedades_Mendoza.csv');
const OUT = path.join(ROOT, 'data', 'propiedad-media.json');
const OUT_FRONT = path.join(ROOT, 'front', 'src', 'data', 'propiedadMedia.json');

/** URLs estables para Telegram (Unsplash devolvía 404). */
function picsum(seed, w = 900, h = 600) {
  return (
    'https://picsum.photos/seed/' +
    encodeURIComponent(seed) +
    '/' +
    w +
    '/' +
    h +
    '.jpg'
  );
}

const POOL_SEEDS = {
  depto: ['depto-i1', 'depto-i2', 'depto-l1', 'depto-l2'],
  casa: ['casa-f1', 'casa-f2', 'casa-j1', 'casa-j2'],
  ph: ['ph-f1', 'ph-f2', 'ph-i1', 'ph-i2'],
  local: ['local-f1', 'local-f2', 'local-i1', 'local-i2'],
  terreno: ['lote-a1', 'lote-a2', 'lote-v1', 'lote-v2'],
  cochera: ['garage-1', 'garage-2', 'garage-3', 'garage-4'],
  default: ['prop-a1', 'prop-a2', 'prop-a3', 'prop-a4'],
};

function poolForTipo(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('cochera') || t.includes('garage') || t.includes('estacionamiento')) return POOL_SEEDS.cochera;
  if (t.includes('depto') || t.includes('depart') || t.includes('mono') || t.includes('loft') || t.includes('oficina')) return POOL_SEEDS.depto;
  if (t.includes('casa') || t.includes('duplex') || t.includes('dúplex') || t.includes('quinta') || t.includes('quincho')) return POOL_SEEDS.casa;
  if (t.includes('ph')) return POOL_SEEDS.ph;
  if (t.includes('local') || t.includes('galpon') || t.includes('galpón')) return POOL_SEEDS.local;
  if (t.includes('lote') || t.includes('terreno')) return POOL_SEEDS.terreno;
  return POOL_SEEDS.default;
}

function extractAmbientes(tipo) {
  const t = String(tipo || '');
  const m = t.match(/(\d+)\s*amb/i);
  if (m) return m[1];
  if (/mono/i.test(t)) return '1';
  return '';
}

function rotate(seeds, id) {
  const n = seeds.length;
  const off = Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % n;
  return [0, 1, 2, 3].map((i) => picsum(seeds[(off + i) % n] + '-' + id));
}

const catalogBase =
  process.env.CATALOG_PUBLIC_BASE_URL ||
  process.env.VITE_PUBLIC_CATALOG_URL ||
  'http://localhost:5173';

const raw = fs.readFileSync(CSV, 'utf8');
const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
const out = {};

for (const row of rows) {
  const id = String(row.id || '').trim();
  if (!id) continue;
  const tipo = row.tipo || '';
  const zona = row.zona || '';
  const precio = row.precio || '';
  const descripcion = (row.descripcion || '').split('|')[0].trim();
  const fotos = rotate(poolForTipo(tipo), id);
  const precioMatch = String(precio).replace(/\./g, '').match(/(\d+)/);
  const precioUsd = precioMatch ? parseInt(precioMatch[1], 10) : null;
  const ambientes = extractAmbientes(tipo);
  const token = shareToken(id);
  out[id] = {
    fotos,
    shareToken: token,
    linkFicha: publicFichaUrl(catalogBase, id),
    caption: `${tipo} · ${zona} · ${precio}`.trim(),
    titulo: `${tipo} en ${zona}`,
    tipo,
    zona,
    precio,
    precioUsd,
    operacion: 'Venta',
    ambientes,
    descripcion,
  };
}

const json = JSON.stringify(out, null, 2);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json, 'utf8');
fs.mkdirSync(path.dirname(OUT_FRONT), { recursive: true });
fs.writeFileSync(OUT_FRONT, json, 'utf8');
console.log(`OK ${Object.keys(out).length} propiedades → ${OUT}`);
