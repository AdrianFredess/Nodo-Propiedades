#!/usr/bin/env node
'use strict';

/**
 * Fase 6b.1 — agrega MZA-031..034 al stock Sheets + propiedadMedia.json
 * STOP 3 aprobado por Adrián.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ROOT,
  loadEnv,
  apiKey,
  sheetsCred,
  httpSteps,
  valuesToCsv,
} = require('../lib/n8n-http-helper');

const DOC = '1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU';
const MEDIA = path.join(ROOT, 'front', 'src', 'data', 'propiedadMedia.json');

const PROPS = [
  {
    id: 'MZA-031',
    tipo: 'Casa 3 dorm.',
    zona: 'Chacras de Coria',
    operacion: 'Venta',
    precioUsd: 139000,
    ambientes: '4',
    dormitorios: '3',
    detalle:
      '180 m² cubiertos, lote 450 m², pileta, galería con parrilla, a 4 cuadras de la plaza',
  },
  {
    id: 'MZA-032',
    tipo: 'Casa 3 dorm.',
    zona: 'Chacras de Coria',
    operacion: 'Venta',
    precioUsd: 148000,
    ambientes: '4',
    dormitorios: '3',
    detalle: '210 m², jardín con frutales, cochera doble, a estrenar',
  },
  {
    id: 'MZA-033',
    tipo: 'Departamento 2 dorm.',
    zona: 'Godoy Cruz',
    operacion: 'Venta',
    precioUsd: 84000,
    ambientes: '3',
    dormitorios: '2',
    detalle: '68 m², balcón, cochera, a 3 cuadras del Palmares',
  },
  {
    id: 'MZA-034',
    tipo: 'Departamento 2 dorm.',
    zona: 'Godoy Cruz',
    operacion: 'Venta',
    precioUsd: 89500,
    ambientes: '3',
    dormitorios: '2',
    detalle: '74 m², luminoso, amenities, apto crédito',
  },
];

function token() {
  return crypto.randomBytes(6).toString('hex');
}

async function main() {
  loadEnv();
  const key = apiKey();
  const { cred } = await sheetsCred(key);
  const today = new Date().toISOString().slice(0, 10);
  const bak = path.join(ROOT, 'docs', 'ops', `backup-planillas-${today}`);
  fs.mkdirSync(bak, { recursive: true });

  const before = await httpSteps(
    key,
    cred,
    [
      {
        name: 'S',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/${encodeURIComponent('Hoja 1')}`,
      },
    ],
    '_TMP stock bak',
  );
  const values = before.S?.values || [];
  fs.writeFileSync(path.join(bak, 'stock-Hoja1-antes-6b.csv'), valuesToCsv(values));
  fs.copyFileSync(MEDIA, path.join(bak, 'propiedadMedia.json'));

  const header = values[0] || [];
  const idx = Object.fromEntries(header.map((h, i) => [String(h).trim().toLowerCase(), i]));
  const idKey = ['id', 'codigo', 'código', 'code'].find((k) => idx[k] != null);
  if (!idKey) throw new Error('No se encontró columna id/codigo en stock: ' + header.join(','));

  const existing = new Set(
    values.slice(1).map((r) => String(r[idx[idKey]] || '').trim().toUpperCase()),
  );

  const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));
  const added = [];
  for (const p of PROPS) {
    if (existing.has(p.id)) {
      added.push({ id: p.id, sheet: 'already' });
    } else {
      const row = new Array(header.length).fill('');
      const set = (names, v) => {
        for (const n of names) {
          const i = idx[n.toLowerCase()];
          if (i != null) row[i] = v;
        }
      };
      set(['id', 'codigo', 'código', 'code'], p.id);
      set(['tipo', 'tipo_propiedad'], p.tipo);
      set(['zona'], p.zona);
      set(['operacion', 'operación', 'tipo_operacion'], p.operacion);
      set(['precio', 'precio_usd', 'precio usd'], String(p.precioUsd));
      set(['ambientes', 'amb'], p.ambientes);
      set(['dormitorios', 'dorm'], p.dormitorios);
      set(['descripcion', 'descripción', 'detalle'], p.detalle);
      set(['estado'], 'disponible');
      values.push(row);
      added.push({ id: p.id, sheet: 'added' });
    }

    const tok = media[p.id]?.shareToken || token();
    media[p.id] = {
      ...(media[p.id] || {}),
      fotos: media[p.id]?.fotos || [],
      shareToken: tok,
      linkFicha: `http://localhost:5173/p/${p.id}/${tok}`,
      caption: `${p.tipo} · ${p.zona} · ${p.precioUsd} USD`,
      titulo: `${p.tipo} en ${p.zona}`,
      tipo: p.tipo,
      zona: p.zona,
      precio: `${p.precioUsd} USD`,
      precioUsd: p.precioUsd,
      operacion: p.operacion,
      ambientes: p.ambientes,
      dormitorios: p.dormitorios,
      descripcion: p.detalle,
    };
  }

  await httpSteps(
    key,
    cred,
    [
      {
        name: 'Clear',
        method: 'POST',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/${encodeURIComponent('Hoja 1')}:clear`,
        body: {},
      },
      {
        name: 'Put',
        method: 'PUT',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/${encodeURIComponent('Hoja 1!A1')}?valueInputOption=RAW`,
        body: { values },
      },
    ],
    '_TMP stock put',
  );
  fs.writeFileSync(MEDIA, JSON.stringify(media, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        ok: true,
        header,
        idCol: idKey,
        added,
        matchNote:
          'ambientes= dormitorios+1 (depto 2 dorm → 3 amb; casa 3 dorm → 4 amb). Zona "Chacras de Coria" matchea chacras.',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
