#!/usr/bin/env node
'use strict';

/**
 * Fase 6b — sync PROP_MEDIA desde propiedadMedia.json + owner chatId + dedupe fotos.
 * Idempotente. Uso: node scripts/patch-mvp-06b-catalogo.js [--deploy]
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadEnv, apiKey, request } = require('./lib/n8n-http-helper');
const { publicFichaUrl } = require('./lib/share-token');

const MEDIA_PATH = path.join(ROOT, 'front', 'src', 'data', 'propiedadMedia.json');
const BOT_PATH = path.join(ROOT, 'workflows', 'Bot Telegram Inmobiliaria.json');
const CONFIG_PATH = path.join(ROOT, 'data', 'bot-config.json');
const PENDIENTES = path.join(ROOT, 'docs', 'ops', 'pendientes.md');
const PROD = '8JoSfkcn3pE1f0av';

const NODES_PROP_MEDIA = [
  'Preparar Fotos Propiedad',
  'Construir Prompt',
  'Parsear Respuesta',
  'Parsear Respuesta Base',
  'Override Fotos Reenvio RL',
  'Reenvio Rate Limit TG',
];

/** Sets extra para romper duplicados (no usados en video 031–034/016). */
const EXTRA_SETS = [
  [
    'photo-1493809842364-78817add7ffb',
    'photo-1502672260266-1c1ef2d93688',
    'photo-1556912173-46c336c7fd55',
    'photo-1560448204-e02f11c3d0e2',
  ],
  [
    'photo-1460317442991-0ec209397118',
    'photo-1586023492125-27b2c045efd7',
    'photo-1556909114-f6e7ad7d3136',
    'photo-1554995207-c18c203602cb',
  ],
  [
    'photo-1634547532213-a4b8d7ff8927',
    'photo-1634547588713-edd93045b9f1',
    'photo-1634547476021-c1155c01616c',
    'photo-1632120953531-1654025d5881',
  ],
  [
    'photo-1632120669818-ed5498030e32',
    'photo-1632120377007-c2adc3017b1e',
    'photo-1632830196000-d8a1abf32691',
    'photo-1632829882891-5047ccc421bc',
  ],
  [
    'photo-1570129477492-45c003edd2be',
    'photo-1560448075-bb485b067938',
    'photo-1616594039964-ae9021a400a0',
    'photo-1580587771525-78b9dba3b914',
  ],
  [
    'photo-1441986300917-64674bd600d8',
    'photo-1555529902-5261145633bf',
    'photo-1567401893414-76b7b1e5a7a5',
    'photo-1472851294608-062f824d29cc',
  ],
  [
    'photo-1586528116311-ad8dd3c8310d',
    'photo-1553413077-190dd305871c',
    'photo-1587293852726-70cdb56c2866',
    'photo-1601362840469-51e4d8d58785',
  ],
  [
    'photo-1497366216548-37526070297c',
    'photo-1497366811353-6870744d04b2',
    'photo-1524758631624-e2822e304c36',
    'photo-1497366754035-f200968a6e72',
  ],
  [
    'photo-1500382017468-9049fed747ef',
    'photo-1628624747186-a941c476b7ef',
    'photo-1464146072230-91cabc968266',
    'photo-1416879595882-3373a0480b5b',
  ],
  [
    'photo-1564013799919-ab600027ffc6',
    'photo-1600047509358-9dc75507daeb',
    'photo-1600210492493-0946911123ea',
    'photo-1472214103451-9374bd1c798e',
  ],
];

const VIDEO_IDS = new Set(['MZA-016', 'MZA-031', 'MZA-032', 'MZA-033', 'MZA-034']);

function mediaUrl(photoPath) {
  const id = photoPath.startsWith('photo-') ? photoPath : 'photo-' + photoPath;
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1280&h=800&q=80`;
}

function slugFromUrl(u) {
  const m = String(u).match(/photo-([a-z0-9-]+)/i);
  return m ? m[1] : String(u);
}

function replacePropMediaLiteral(code, mediaJson) {
  const marker = 'const PROP_MEDIA = ';
  let out = code;
  let guard = 0;
  while (guard++ < 20) {
    const i = out.indexOf(marker);
    if (i < 0) break;
    let j = i + marker.length;
    while (j < out.length && /\s/.test(out[j])) j++;
    if (out[j] !== '{' && out[j] !== '_' && out[j] !== '"') {
      // __PROP_MEDIA_JSON__ o ya stringificado raro
      if (out.slice(j).startsWith('__PROP_MEDIA_JSON__')) {
        out = out.slice(0, i) + marker + mediaJson + out.slice(j + '__PROP_MEDIA_JSON__'.length);
        continue;
      }
      break;
    }
    if (out[j] !== '{') break;
    let depth = 0;
    let k = j;
    let inStr = false;
    let esc = false;
    for (; k < out.length; k++) {
      const c = out[k];
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (c === '\\') {
          esc = true;
        } else if (c === '"') {
          inStr = false;
        }
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          k++;
          break;
        }
      }
    }
    out = out.slice(0, i) + marker + mediaJson + out.slice(k);
  }
  return out;
}

function fingerprintFotos(fotos) {
  return (fotos || []).map(slugFromUrl).sort().join('|');
}

function dedupeMedia(media) {
  const used = new Set();
  const pending = [];
  // Primero reservar video
  for (const id of VIDEO_IDS) {
    const m = media[id];
    if (!m) continue;
    for (const u of m.fotos || []) used.add(slugFromUrl(u));
  }
  const ids = Object.keys(media).sort();
  let extraIdx = 0;
  for (const id of ids) {
    if (VIDEO_IDS.has(id)) continue;
    const fp = fingerprintFotos(media[id].fotos);
    const slugs = (media[id].fotos || []).map(slugFromUrl);
    const clash = slugs.some((s) => used.has(s));
    // también si otro no-video ya usó el mismo set completo
    if (!clash) {
      for (const s of slugs) used.add(s);
      continue;
    }
    // buscar set extra sin overlap
    let assigned = false;
    while (extraIdx < EXTRA_SETS.length) {
      const set = EXTRA_SETS[extraIdx++];
      if (set.some((p) => used.has(slugFromUrl(p)))) continue;
      media[id].fotos = set.map(mediaUrl);
      for (const p of set) used.add(slugFromUrl(p));
      assigned = true;
      break;
    }
    if (!assigned) {
      pending.push({ id, reason: 'sin_sesion_unica', prev: fp.slice(0, 80) });
    }
  }
  return pending;
}

function applyLinkFicha(media, baseUrl) {
  for (const id of Object.keys(media)) {
    media[id].linkFicha = publicFichaUrl(baseUrl, id);
    if (!media[id].shareToken) {
      media[id].shareToken = media[id].linkFicha.split('/').pop();
    }
  }
}

function injectOwnerChatId(wf, ownerId) {
  let n = 0;
  for (const node of wf.nodes || []) {
    if (!/Telegram Alerta/i.test(node.name || '')) continue;
    const p = node.parameters || {};
    if (p.chatId === '__SET_OWNER_TELEGRAM_CHAT_ID__' || p.chatId == null || p.chatId === '') {
      p.chatId = String(ownerId);
      node.parameters = p;
      n++;
    } else if (String(p.chatId).includes('__SET_OWNER_TELEGRAM_CHAT_ID__')) {
      p.chatId = String(ownerId);
      node.parameters = p;
      n++;
    }
  }
  return n;
}

function syncWorkflowPropMedia(wf, mediaJson) {
  const touched = [];
  for (const node of wf.nodes || []) {
    if (!NODES_PROP_MEDIA.includes(node.name)) continue;
    const code = node.parameters?.jsCode;
    if (!code || !code.includes('PROP_MEDIA')) continue;
    const next = replacePropMediaLiteral(code, mediaJson);
    if (next !== code) {
      node.parameters.jsCode = next;
      touched.push(node.name);
    }
  }
  return touched;
}

function extractPropMediaFingerprint(code) {
  const m = code.match(/const PROP_MEDIA = (\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    // fragile; use length + hash of slice
    return require('crypto').createHash('sha256').update(m[1]).digest('hex').slice(0, 16);
  } catch {
    return String(m[1].length);
  }
}

async function deployBot(wf) {
  const key = apiKey();
  const live = await request('GET', `/api/v1/workflows/${PROD}`, key);
  const was = !!live.json.active;
  if (was) await request('POST', `/api/v1/workflows/${PROD}/deactivate`, key);
  const put = await request('PUT', `/api/v1/workflows/${PROD}`, key, {
    name: live.json.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1' },
  });
  if (put.status >= 400) throw new Error(put.raw.slice(0, 400));
  if (was) await request('POST', `/api/v1/workflows/${PROD}/activate`, key);
}

function appendPendientes(items) {
  if (!items.length) return;
  let txt = fs.existsSync(PENDIENTES) ? fs.readFileSync(PENDIENTES, 'utf8') : '# Pendientes\n';
  if (!txt.includes('## Fase 6b — fotos duplicadas')) {
    txt +=
      '\n## Fase 6b — fotos duplicadas sin sesión única\n\n' +
      items.map((x) => `- ${x.id}: ${x.reason}`).join('\n') +
      '\n';
    fs.writeFileSync(PENDIENTES, txt);
  }
}

async function main() {
  loadEnv();
  const args = new Set(process.argv.slice(2));
  const media = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const baseUrl = String(cfg.panel_base_url || 'http://localhost:5173').replace(/\/$/, '');

  const pending = dedupeMedia(media);
  applyLinkFicha(media, baseUrl);
  fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2) + '\n');
  appendPendientes(pending);

  const mediaJson = JSON.stringify(media);
  let wf = JSON.parse(fs.readFileSync(BOT_PATH, 'utf8'));
  const touched = syncWorkflowPropMedia(wf, mediaJson);

  const owner = String(process.env.OWNER_TELEGRAM_CHAT_ID || '').trim();
  let ownerInjected = 0;
  if (owner && !owner.includes('__SET_')) {
    ownerInjected = injectOwnerChatId(wf, owner);
  }

  // marca idempotencia
  if (!JSON.stringify(wf).includes('mvp-06b-catalogo')) {
    const prep = (wf.nodes || []).find((n) => n.name === 'Preparar Fotos Propiedad');
    if (prep?.parameters?.jsCode) {
      prep.parameters.jsCode = '/* mvp-06b-catalogo */\n' + prep.parameters.jsCode;
    }
  }

  fs.writeFileSync(BOT_PATH, JSON.stringify(wf, null, 2) + '\n');

  // segunda pasada = misma huella
  const wf2 = JSON.parse(fs.readFileSync(BOT_PATH, 'utf8'));
  const touched2 = syncWorkflowPropMedia(wf2, mediaJson);
  const fps = {};
  for (const name of NODES_PROP_MEDIA) {
    const n = (wf.nodes || []).find((x) => x.name === name);
    if (n?.parameters?.jsCode?.includes('PROP_MEDIA')) {
      fps[name] = extractPropMediaFingerprint(n.parameters.jsCode);
    }
  }

  const report = {
    ok: true,
    props: Object.keys(media).length,
    videoFotos: Object.fromEntries(
      [...VIDEO_IDS].map((id) => [id, (media[id]?.fotos || []).length]),
    ),
    panel_base_url: baseUrl,
    linkFicha_localhost: /localhost/i.test(baseUrl),
    touched,
    touched2_empty: touched2.length === 0,
    propMediaFingerprints: fps,
    fingerprintsEqual: new Set(Object.values(fps).filter(Boolean)).size <= 1,
    ownerTelegramChatId: owner || null,
    ownerInjected,
    ownerStillPlaceholder: !owner || owner.includes('__SET_'),
    pendingFotos: pending,
  };

  if (args.has('--deploy')) {
    await deployBot(wf);
    report.deployed = PROD;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
