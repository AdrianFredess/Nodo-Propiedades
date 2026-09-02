/**
 * Genera data/propiedad-media.json + front/src/data/propiedadMedia.json
 * — 4 fotos por propiedad desde “unidades visuales” reutilizables.
 *
 * Enfoque (stock libre Unsplash/Pexels; no scrapers inmobiliarios):
 * - Preferir misma sesión / mismo fotógrafo / mismo proyecto arquitectónico.
 * - No se garantiza listing MLS real; sí coherencia visual de UNA unidad.
 *
 * Unidades verificadas en navegador (2026-03):
 * - cochera_dave_garcia: Pexels DΛVΞ GΛRCIΛ — misma cochera subterránea
 *   (lobby B1 + pasillos + salida). IDs 36259593 / 602 / 607 / 605.
 * - casa_rarch_*: serie moderna Unsplash (mismo proyecto fachada/living/cocina/dorm).
 * - oficina_nawfal: misma oficina (Nawfal / Unsplash office series).
 *
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

/** Unsplash CDN (estable; source.unsplash.com ya no). */
function unsplash(photoId) {
  return (
    'https://images.unsplash.com/' +
    photoId +
    '?auto=format&fit=crop&w=900&h=600&q=80'
  );
}

/** Pexels CDN. */
function pexels(numericId) {
  return (
    'https://images.pexels.com/photos/' +
    numericId +
    '/pexels-photo-' +
    numericId +
    '.jpeg?auto=compress&cs=tinysrgb&w=900&h=600&fit=crop'
  );
}

/**
 * Unidades visuales reutilizables.
 * Cada set: 4 URLs distintas, misma unidad / sesión / proyecto.
 * Orden: portada, ambiente principal, detalle, cerramiento.
 */
const VISUAL_UNITS = {
  // —— Cochera cubierta (misma estructura subterránea, Dave Garcia / Pexels)
  cochera_dave_garcia: [
    pexels(36259593), // lobby B1 → acceso cochera
    pexels(36259602), // pasillo con autos hacia lobby
    pexels(36259607), // bahía + matafuegos
    pexels(36259605), // salida / pilar circular
  ],

  // —— Casa moderna blanca (proyecto Unsplash R Architecture / Spacejoy-era)
  casa_rarch_blanca: [
    unsplash('photo-1600585154340-be6161a56a0c'), // fachada
    unsplash('photo-1600607687939-ce8a6c25118c'), // living + cocina integrada
    unsplash('photo-1600566753190-17f0baa2a6c3'), // cocina isla
    unsplash('photo-1600210492486-724fe5c67fb0'), // dormitorio
  ],

  // —— Casa premium pileta (mismo lenguaje arquitectónico / serie 16005–16006)
  casa_rarch_pileta: [
    unsplash('photo-1600596542815-ffad4c1539a9'),
    unsplash('photo-1600607687920-4e2a09cf159d'),
    unsplash('photo-1600566753086-00f18fb6b3ea'),
    unsplash('photo-1600585152915-d208bec867a1'),
  ],

  // —— Casa / dúplex ángulos adicionales misma estética proyecto
  casa_rarch_angulos: [
    unsplash('photo-1600585154526-990dced4db0d'),
    unsplash('photo-1600566752355-35792bedcfea'),
    unsplash('photo-1600585152220-90363fe7e115'),
    unsplash('photo-1600607687939-ce8a6c25118c'),
  ],

  // —— Depto / living Spacejoy (misma unidad: wainscoting + piso oscuro + sofá crema)
  depto_spacejoy_wainscot: [
    unsplash('photo-1634547532213-a4b8d7ff8927'),
    unsplash('photo-1634547588713-edd93045b9f1'),
    unsplash('photo-1634547476021-c1155c01616c'),
    unsplash('photo-1632120953531-1654025d5881'),
  ],

  // —— Depto living claro Spacejoy (misma sesión 163212*)
  depto_spacejoy_claro: [
    unsplash('photo-1632120669818-ed5498030e32'),
    unsplash('photo-1632120377007-c2adc3017b1e'),
    unsplash('photo-1632830196000-d8a1abf32691'),
    unsplash('photo-1632829882891-5047ccc421bc'),
  ],

  // —— Depto urbano clásico (misma línea de interiores claros)
  depto_urbano_a: [
    unsplash('photo-1493809842364-78817add7ffb'),
    unsplash('photo-1502672260266-1c1ef2d93688'),
    unsplash('photo-1556912173-46c336c7fd55'),
    unsplash('photo-1560448204-e02f11c3d0e2'),
  ],

  depto_urbano_b: [
    unsplash('photo-1545324418-cc1a3fa10c00'),
    unsplash('photo-1522708323590-d24dbb6b0267'),
    unsplash('photo-1484154218962-a197022b5858'),
    unsplash('photo-1505693416388-ac5ce068fe85'),
  ],

  depto_compacto: [
    unsplash('photo-1460317442991-0ec209397118'),
    unsplash('photo-1586023492125-27b2c045efd7'),
    unsplash('photo-1556909114-f6e7ad7d3136'),
    unsplash('photo-1554995207-c18c203602cb'),
  ],

  depto_loft: [
    unsplash('photo-1536376072261-38c75010e6c9'),
    unsplash('photo-1556911220-e15b29be8c8f'),
    unsplash('photo-1560185127-6ed189bf02f4'),
    unsplash('photo-1595526114035-0d45ed16cfbf'),
  ],

  // —— PH / townhouse
  ph_townhouse: [
    unsplash('photo-1570129477492-45c003edd2be'),
    unsplash('photo-1560185127-6ed189bf02f4'),
    unsplash('photo-1560448075-bb485b067938'),
    unsplash('photo-1616594039964-ae9021a400a0'),
  ],

  ph_patio: [
    unsplash('photo-1580587771525-78b9dba3b914'),
    unsplash('photo-1600585154526-990dced4db0d'),
    unsplash('photo-1600566752355-35792bedcfea'),
    unsplash('photo-1616594039964-ae9021a400a0'),
  ],

  // —— Local comercial (misma tipología retail)
  local_vidriera: [
    unsplash('photo-1441986300917-64674bd600d8'),
    unsplash('photo-1604719312566-8912e9227c6a'),
    unsplash('photo-1555529902-5261145633bf'),
    unsplash('photo-1567401893414-76b7b1e5a7a5'),
  ],

  local_peatonal: [
    unsplash('photo-1441984904996-e0b6ba687e04'),
    unsplash('photo-1604719312566-8912e9227c6a'),
    unsplash('photo-1472851294608-062f824d29cc'),
    unsplash('photo-1556740738-b6a63e27c4df'),
  ],

  // —— Galpón / industrial
  galpon: [
    unsplash('photo-1586528116311-ad8dd3c8310d'),
    unsplash('photo-1553413077-190dd305871c'),
    unsplash('photo-1587293852726-70cdb56c2866'),
    unsplash('photo-1601362840469-51e4d8d58785'),
  ],

  // —— Oficina (serie Nawfal / Unsplash)
  oficina_nawfal: [
    unsplash('photo-1497366216548-37526070297c'),
    unsplash('photo-1497366811353-6870744d04b2'),
    unsplash('photo-1524758631624-e2822e304c36'),
    unsplash('photo-1497366754035-f200968a6e72'),
  ],

  // —— Lote / terreno
  lote_campo: [
    unsplash('photo-1500382017468-9049fed747ef'),
    unsplash('photo-1628624747186-a941c476b7ef'),
    unsplash('photo-1464146072230-91cabc968266'),
    unsplash('photo-1416879595882-3373a0480b5b'),
  ],

  terreno_esquina: [
    unsplash('photo-1628624747186-a941c476b7ef'),
    unsplash('photo-1500382017468-9049fed747ef'),
    unsplash('photo-1472214103451-9374bd1c798e'),
    unsplash('photo-1464146072230-91cabc968266'),
  ],

  // —— Quinta / casa patio
  quinta: [
    unsplash('photo-1564013799919-ab600027ffc6'),
    unsplash('photo-1600047509358-9dc75507daeb'),
    unsplash('photo-1600566752355-35792bedcfea'),
    unsplash('photo-1600210492493-0946911123ea'),
  ],

  casa_suburbana: [
    unsplash('photo-1568605114967-8130f3a36994'),
    unsplash('photo-1600585152220-90363fe7e115'),
    unsplash('photo-1556909172-54557c7e4fb7'),
    unsplash('photo-1616486338812-3dadae4b4ace'),
  ],
};

/** Asignación fija MZA-xxx → unidad visual (4 fotos coherentes). */
const CURATED_SETS = {
  'MZA-001': VISUAL_UNITS.depto_urbano_a,
  'MZA-002': VISUAL_UNITS.depto_urbano_b,
  'MZA-003': VISUAL_UNITS.depto_compacto,
  'MZA-004': VISUAL_UNITS.ph_townhouse,
  'MZA-005': VISUAL_UNITS.casa_rarch_blanca,
  'MZA-006': VISUAL_UNITS.local_vidriera,
  'MZA-007': VISUAL_UNITS.depto_spacejoy_claro,
  'MZA-008': VISUAL_UNITS.lote_campo,
  'MZA-009': VISUAL_UNITS.depto_spacejoy_wainscot,
  'MZA-010': VISUAL_UNITS.casa_rarch_angulos,
  'MZA-011': VISUAL_UNITS.depto_compacto,
  'MZA-012': VISUAL_UNITS.quinta,
  'MZA-013': VISUAL_UNITS.depto_spacejoy_wainscot,
  'MZA-014': VISUAL_UNITS.galpon,
  'MZA-015': VISUAL_UNITS.depto_urbano_b,
  'MZA-016': VISUAL_UNITS.casa_rarch_pileta,
  // FIX: antes mezclaba casa rústica + concesionaria + estacionamientos aéreos
  'MZA-017': VISUAL_UNITS.cochera_dave_garcia,
  'MZA-018': VISUAL_UNITS.depto_spacejoy_claro,
  'MZA-019': VISUAL_UNITS.oficina_nawfal,
  'MZA-020': VISUAL_UNITS.terreno_esquina,
  'MZA-021': VISUAL_UNITS.depto_urbano_a,
  'MZA-022': VISUAL_UNITS.casa_suburbana,
  'MZA-023': VISUAL_UNITS.depto_loft,
  'MZA-024': VISUAL_UNITS.depto_compacto,
  'MZA-025': VISUAL_UNITS.quinta,
  'MZA-026': VISUAL_UNITS.depto_spacejoy_wainscot,
  'MZA-027': VISUAL_UNITS.local_peatonal,
  'MZA-028': VISUAL_UNITS.ph_patio,
  'MZA-029': VISUAL_UNITS.depto_urbano_b,
  'MZA-030': VISUAL_UNITS.casa_rarch_pileta,
};

/** Fallback por tipo si falta un ID en CURATED_SETS (no debería usarse). */
const FALLBACK_BY_TIPO = {
  depto: VISUAL_UNITS.depto_urbano_a,
  casa: VISUAL_UNITS.casa_rarch_blanca,
  ph: VISUAL_UNITS.ph_townhouse,
  local: VISUAL_UNITS.local_vidriera,
  terreno: VISUAL_UNITS.lote_campo,
  cochera: VISUAL_UNITS.cochera_dave_garcia,
  default: VISUAL_UNITS.depto_urbano_a,
};

function fallbackForTipo(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('cochera') || t.includes('garage')) return FALLBACK_BY_TIPO.cochera;
  if (t.includes('depto') || t.includes('depart') || t.includes('mono') || t.includes('loft') || t.includes('oficina'))
    return FALLBACK_BY_TIPO.depto;
  if (t.includes('casa') || t.includes('duplex') || t.includes('dúplex') || t.includes('quinta') || t.includes('quincho'))
    return FALLBACK_BY_TIPO.casa;
  if (t.includes('ph')) return FALLBACK_BY_TIPO.ph;
  if (t.includes('local') || t.includes('galpon') || t.includes('galpón')) return FALLBACK_BY_TIPO.local;
  if (t.includes('lote') || t.includes('terreno')) return FALLBACK_BY_TIPO.terreno;
  return FALLBACK_BY_TIPO.default;
}

function fotosFor(id, tipo) {
  const set = CURATED_SETS[id];
  if (set && set.length >= 4) return set.slice(0, 4);
  console.warn(`Sin set curado para ${id}; fallback por tipo`);
  return fallbackForTipo(tipo).slice(0, 4);
}

function extractAmbientes(tipo) {
  const t = String(tipo || '');
  const m = t.match(/(\d+)\s*amb/i);
  if (m) return m[1];
  if (/mono/i.test(t)) return '1';
  return '';
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
  const fotos = fotosFor(id, tipo);
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
console.log(`Front mirror → ${OUT_FRONT}`);
console.log('Unidades visuales:', Object.keys(VISUAL_UNITS).join(', '));
