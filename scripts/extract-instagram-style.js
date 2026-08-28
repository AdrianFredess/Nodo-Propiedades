/**
 * Extrae muestras de estilo del export de Instagram (solo mensajes propios).
 * Anonimiza y filtra contenido sensible. Salida para el asistente de voz.
 *
 * Uso:
 *   node scripts/extract-instagram-style.js [ruta-export]
 */
const fs = require('fs');
const path = require('path');

const EXPORT_ROOT =
  process.argv[2] ||
  path.join(__dirname, '..', 'data', 'instagram-export');
const OUT_FILE = path.join(
  __dirname,
  '..',
  'front',
  'src',
  'features',
  'assistant',
  'styleSamples.json',
);

const SENDER = 'fredes';
const OFFENSIVE =
  /\b(puto|puta|mierda|boluda|boludo|forro|pelotud|concha|orto|poronga|pija|verga)\b/i;
const URL_ONLY = /^https?:\/\//i;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (entry.name.endsWith('.json')) files.push(p);
  }
  return files;
}

function anonymize(text) {
  return text
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/@[\w.]+/g, '@[usuario]')
    .replace(/\b\d{8,}\b/g, '[num]')
    .replace(/\b[A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+){0,2}\b/g, (m) => {
      if (['Buenas', 'Hola', 'Dale', 'Perfecto', 'Mendoza', 'Godoy', 'Cruz'].includes(m))
        return m;
      return '[nombre]';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function scoreMessage(text) {
  const len = text.length;
  if (len < 18 || len > 220) return -1;
  if (OFFENSIVE.test(text)) return -2;
  if (URL_ONLY.test(text)) return -1;

  let score = 0;
  if (/\b(q onda|buenas|hola|dale|perfecto|te cuento|mirá|mira|si querés|podrías|consultar)\b/i.test(text))
    score += 3;
  if (/\b(porq|xq|tmb|tb|q |t |d |vos|tenés|querés|podés)\b/i.test(text))
    score += 2;
  if (/\?/.test(text)) score += 1;
  if (/\b(precio|zona|depto|casa|visita|horario|propiedad|inmobiliar)\b/i.test(text))
    score += 4;
  if (/[.!?]/.test(text) && len > 40) score += 1;
  return score;
}

function main() {
  const roots = [
    path.join(EXPORT_ROOT, 'your_instagram_activity', 'messages', 'inbox'),
    path.join(EXPORT_ROOT, 'your_instagram_activity', 'messages', 'message_requests'),
  ];

  const candidates = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      if (!Array.isArray(data.messages)) continue;
      for (const m of data.messages) {
        if (String(m.sender_name || '').toLowerCase() !== SENDER) continue;
        const raw = String(m.content || '').trim();
        if (!raw) continue;
        const text = anonymize(raw);
        const score = scoreMessage(text);
        if (score < 1) continue;
        candidates.push({ text, score, len: text.length });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.len - a.len);

  const picked = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.text.slice(0, 40).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(c.text);
    if (picked.length >= 28) break;
  }

  const profile = {
    version: 1,
    source: 'instagram-export-anonymized',
    locale: 'es-AR',
    traits: [
      'Voseo natural rioplatense (vos, tenés, querés, podés).',
      'Cálido y directo, sin sonar robótico ni corporativo.',
      'Educado y bien redactado al hablar con clientes; informal solo con cercanía.',
      'Conectores: dale, perfecto, mirá, te cuento, si querés, buenísimo.',
      'Prohibido: che, mencionar IA/bot/automatizado.',
      'Frases cortas para voz (2–4 oraciones). Una idea por frase.',
    ],
    samples: picked,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(profile, null, 2), 'utf8');
  console.log(`OK ${picked.length} muestras → ${OUT_FILE}`);
}

main();
