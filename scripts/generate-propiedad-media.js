/**
 * Genera data/propiedad-media.json — 4 fotos coherentes por propiedad (Unsplash).
 * Uso: node scripts/generate-propiedad-media.js
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'csv', 'Simulacion_30_Propiedades_Mendoza.csv');
const OUT = path.join(ROOT, 'data', 'propiedad-media.json');
const OUT_FRONT = path.join(ROOT, 'front', 'src', 'data', 'propiedadMedia.json');

const POOLS = {
  depto: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2cd9368?w=900&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=80',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&q=80',
  ],
  casa: [
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=900&q=80',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80',
    'https://images.unsplash.com/photo-1605276374104-dee2afb0f430?w=900&q=80',
  ],
  ph: [
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=80',
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=900&q=80',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=900&q=80',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=80',
  ],
  local: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&q=80',
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&q=80',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=900&q=80',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=900&q=80',
  ],
  terreno: [
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=80',
    'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=900&q=80',
    'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=900&q=80',
  ],
  default: [
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80',
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=900&q=80',
    'https://images.unsplash.com/photo-1600210492496-724fe5c67fb0?w=900&q=80',
    'https://images.unsplash.com/photo-1600607687920-4e2a09ae1599?w=900&q=80',
  ],
};

function poolForTipo(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('depto') || t.includes('depart') || t.includes('mono') || t.includes('loft') || t.includes('oficina') || t.includes('cochera')) return POOLS.depto;
  if (t.includes('casa') || t.includes('duplex') || t.includes('dúplex') || t.includes('quinta') || t.includes('quincho')) return POOLS.casa;
  if (t.includes('ph')) return POOLS.ph;
  if (t.includes('local') || t.includes('galpon') || t.includes('galpón')) return POOLS.local;
  if (t.includes('lote') || t.includes('terreno')) return POOLS.terreno;
  return POOLS.default;
}

function rotate(pool, seed) {
  const n = pool.length;
  const off = Math.abs(seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % n;
  return [0, 1, 2, 3].map((i) => pool[(off + i) % n]);
}

const catalogBase =
  process.env.CATALOG_PUBLIC_BASE_URL ||
  process.env.VITE_PUBLIC_CATALOG_URL ||
  'http://localhost:5173/catalogo';

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
  out[id] = {
    fotos,
    linkFicha: `${catalogBase.replace(/\/$/, '')}/${encodeURIComponent(id)}`,
    caption: `${tipo} · ${zona} · ${precio}`.trim(),
    titulo: `${tipo} en ${zona}`,
    tipo,
    zona,
    precio,
    precioUsd,
    operacion: 'Venta',
    descripcion,
  };
}

const json = JSON.stringify(out, null, 2);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json, 'utf8');
fs.mkdirSync(path.dirname(OUT_FRONT), { recursive: true });
fs.writeFileSync(OUT_FRONT, json, 'utf8');
console.log(`OK ${Object.keys(out).length} propiedades → ${OUT}`);
