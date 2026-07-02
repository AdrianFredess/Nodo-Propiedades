/**
 * Elimina de workflow_entity los workflows cuyo nombre empieza con "WF-"
 * pero ya no tienen un JSON correspondiente en workflows/.
 * No toca otros workflows (ej. "My workflow", plantillas propias).
 *
 * Uso: node scripts/_limpiar_workflows_wf_huerfanos.js
 * Recomendado: ejecutar con n8n detenido; despues de sync o antes de post_import.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { getN8nDbPath, deleteWorkflowCascade } = require('./_n8n_db_workflow_utils');

const root = path.join(__dirname, '..');
const workflowsDir = path.join(root, 'workflows');
const dbPath = getN8nDbPath();

const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.json'));
const allowed = new Set();
for (const f of files) {
  try {
    const wf = JSON.parse(fs.readFileSync(path.join(workflowsDir, f), 'utf8'));
    if (wf.name) allowed.add(wf.name);
  } catch (_) {}
}

const db = new Database(dbPath);
const rows = db.prepare('SELECT id, name FROM workflow_entity').all();
const orphans = rows.filter((r) => /^WF-/.test(r.name) && !allowed.has(r.name));

if (!orphans.length) {
  console.log('No hay workflows WF-* huerfanos (todos coinciden con workflows/*.json o no hay WF- en la base).');
  db.close();
  process.exit(0);
}

console.log(`Encontrados ${orphans.length} workflow(s) WF-* que ya no estan en el repo:\n`);
for (const o of orphans) console.log(`  - ${o.name} (${o.id})`);

db.exec('PRAGMA foreign_keys = OFF');
try {
  for (const o of orphans) {
    console.log(`\nEliminando: ${o.name}`);
    deleteWorkflowCascade(db, o.id, { log: true });
  }
} finally {
  db.exec('PRAGMA foreign_keys = ON');
}
db.close();
console.log('\nListo. Huerfanos eliminados.');
