#!/usr/bin/env node
'use strict';

/**
 * Fase 6b.2 — demo-fotos/ + CREDITOS + indice.html + fotos en propiedadMedia.json
 * Idempotente. Unsplash. 5 props del guion; slugs únicos entre ellas.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { ROOT } = require('./lib/n8n-http-helper');

const OUT = path.join(ROOT, 'demo-fotos');
const MEDIA = path.join(ROOT, 'front', 'src', 'data', 'propiedadMedia.json');

/** Sets conocidos (misma tipología / serie Unsplash). slug = path photo-... */
const SETS = {
  'MZA-031-casa-chacras': {
    photographer: 'R Architecture / Unsplash',
    profile: 'https://unsplash.com/s/photos/modern-house',
    photos: [
      { slug: '1568605114967-8130f3a36994', file: '1-frente.jpg' },
      { slug: '1600585152220-90363fe7e115', file: '2-living.jpg' },
      { slug: '1556909172-54557c7e4fb7', file: '3-cocina.jpg' },
      { slug: '1616486338812-3dadae4b4ace', file: '4-dormitorio-o-patio.jpg' },
    ],
  },
  'MZA-032-casa-chacras': {
    photographer: 'R Architecture / Unsplash',
    profile: 'https://unsplash.com/s/photos/white-house-interior',
    photos: [
      { slug: '1600585154340-be6161a56a0c', file: '1-frente.jpg' },
      { slug: '1600607687939-ce8a6c25118c', file: '2-living.jpg' },
      { slug: '1600566753190-17f0baa2a6c3', file: '3-cocina.jpg' },
      { slug: '1600210492486-724fe5c67fb0', file: '4-dormitorio-o-patio.jpg' },
    ],
  },
  'MZA-033-depto-godoy-cruz': {
    photographer: 'Unsplash interiors',
    profile: 'https://unsplash.com/s/photos/apartment-interior',
    photos: [
      { slug: '1536376072261-38c75010e6c9', file: '1-frente.jpg' },
      { slug: '1556911220-e15b29be8c8f', file: '2-living.jpg' },
      { slug: '1560185127-6ed189bf02f4', file: '3-cocina.jpg' },
      { slug: '1595526114035-0d45ed16cfbf', file: '4-dormitorio-o-patio.jpg' },
    ],
  },
  'MZA-034-depto-godoy-cruz': {
    photographer: 'Unsplash interiors',
    profile: 'https://unsplash.com/s/photos/bright-apartment',
    photos: [
      { slug: '1545324418-cc1a3fa10c00', file: '1-frente.jpg' },
      { slug: '1522708323590-d24dbb6b0267', file: '2-living.jpg' },
      { slug: '1484154218962-a197022b5858', file: '3-cocina.jpg' },
      { slug: '1505693416388-ac5ce068fe85', file: '4-dormitorio-o-patio.jpg' },
    ],
  },
  'MZA-016-casa-chacras': {
    photographer: 'R Architecture / Unsplash',
    profile: 'https://unsplash.com/s/photos/modern-house-pool',
    photos: [
      { slug: '1600596542815-ffad4c1539a9', file: '1-frente.jpg' },
      { slug: '1600607687920-4e2a09cf159d', file: '2-living.jpg' },
      { slug: '1600566753086-00f18fb6b3ea', file: '3-cocina.jpg' },
      { slug: '1600585152915-d208bec867a1', file: '4-dormitorio-o-patio.jpg' },
    ],
  },
};

const PROP_MAP = {
  'MZA-031-casa-chacras': 'MZA-031',
  'MZA-032-casa-chacras': 'MZA-032',
  'MZA-033-depto-godoy-cruz': 'MZA-033',
  'MZA-034-depto-godoy-cruz': 'MZA-034',
  'MZA-016-casa-chacras': 'MZA-016',
};

function dlUrl(slug) {
  return `https://images.unsplash.com/photo-${slug}?auto=format&fit=crop&w=1600&h=1000&q=80`;
}
function mediaUrl(slug) {
  return `https://images.unsplash.com/photo-${slug}?auto=format&fit=crop&w=1280&h=800&q=80`;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { 'User-Agent': 'NodoPropiedades-demo-fotos/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try {
            fs.unlinkSync(dest);
          } catch (_) {}
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          try {
            fs.unlinkSync(dest);
          } catch (_) {}
          reject(new Error('HTTP ' + res.statusCode + ' ' + url));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', reject);
  });
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const used = new Set();
  for (const set of Object.values(SETS)) {
    for (const ph of set.photos) {
      if (used.has(ph.slug)) throw new Error('slug repetido entre sets: ' + ph.slug);
      used.add(ph.slug);
    }
  }

  const credits = ['# Créditos Unsplash (demo Nodo Propiedades)', ''];
  const indexBlocks = [];

  for (const [folder, set] of Object.entries(SETS)) {
    const dir = path.join(OUT, folder);
    fs.mkdirSync(dir, { recursive: true });
    credits.push(`## ${folder}`);
    credits.push(`Fuente: [${set.photographer}](${set.profile})`);
    const imgs = [];
    for (const ph of set.photos) {
      const dest = path.join(dir, ph.file);
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 2000) {
        await download(dlUrl(ph.slug), dest);
      }
      const buf = fs.readFileSync(dest);
      const size = jpegSize(buf);
      if (size && (size.w < 1600 || size.h < 1000)) {
        throw new Error('size fail ' + ph.slug + ' ' + JSON.stringify(size));
      }
      credits.push(`- ${ph.file}: https://unsplash.com/photos/${ph.slug}`);
      imgs.push(ph.file);
    }
    credits.push('');
    indexBlocks.push({ folder, photographer: set.photographer, imgs });
  }

  fs.writeFileSync(path.join(OUT, 'CREDITOS.md'), credits.join('\n') + '\n');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><title>Demo fotos</title>
<style>
body{font-family:system-ui;margin:24px;background:#111;color:#eee}
h2{margin-top:2rem;font-size:1rem}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
img{width:100%;height:140px;object-fit:cover;border-radius:6px}.meta{opacity:.7;font-size:.85rem}
</style></head><body>
<h1>Demo fotos — revisión rápida</h1>
<p class="meta">${OUT.replace(/\\/g, '/')}</p>
${indexBlocks
  .map(
    (b) =>
      `<h2>${b.folder} <span class="meta">· ${b.photographer}</span></h2><div class="grid">${b.imgs
        .map((f) => `<img src="./${b.folder}/${f}" alt="${f}"/>`)
        .join('')}</div>`,
  )
  .join('\n')}
</body></html>`;
  fs.writeFileSync(path.join(OUT, 'indice.html'), html);

  const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));
  for (const [folder, set] of Object.entries(SETS)) {
    const propId = PROP_MAP[folder];
    if (!media[propId]) media[propId] = { fotos: [] };
    media[propId].fotos = set.photos.map((p) => mediaUrl(p.slug));
  }
  fs.writeFileSync(MEDIA, JSON.stringify(media, null, 2) + '\n');

  console.log(
    JSON.stringify(
      { ok: true, out: OUT, unique: used.size, indice: path.join(OUT, 'indice.html') },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
