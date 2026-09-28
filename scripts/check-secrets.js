/**
 * Busca secretos en archivos versionados (git ls-files). Sin dependencias.
 * Sale 1 si hay hallazgos.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATTERNS = [
  /EAA[A-Za-z0-9]{40,}/,
  /\d{8,10}:AA[\w-]{30,}/,
  /gsk_[A-Za-z0-9]{20,}/,
  /AIza[\w-]{30,}/,
  /ghp_/,
];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\0').filter(Boolean);
}

let hits = 0;
for (const rel of trackedFiles()) {
  const abs = path.join(ROOT, rel);
  let text;
  try {
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) continue;
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const re of PATTERNS) {
      if (re.test(line)) {
        hits += 1;
        console.error(`${rel}:${i + 1}: posible secreto (${re.source})`);
        break;
      }
    }
  });
}

if (hits) {
  console.error(`check:secrets: ${hits} hallazgo(s)`);
  process.exit(1);
}
console.log('check:secrets: 0 hallazgos');
