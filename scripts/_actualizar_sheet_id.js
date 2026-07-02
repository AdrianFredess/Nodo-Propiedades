/**
 * Reemplaza el ID de Google Sheet en workflows JSON y en la base SQLite de n8n.
 * Uso: node scripts/_actualizar_sheet_id.js NUEVO_ID
 */
const fs = require('fs');
const path = require('path');
const { getN8nDbPath } = require('./_n8n_db_workflow_utils');

const OLD_ID = '1-0IBpaUl3svRmzMqNK0NYZYbuUDxCytnBd5Ql2DcOjo';

const newId = process.argv[2];
if (!newId || newId === OLD_ID) {
  console.error('Uso: node scripts/_actualizar_sheet_id.js <NUEVO_ID_DE_PLANILLA>');
  console.error('El ID es el fragmento entre /d/ y /edit en la URL de Google Sheets.');
  process.exit(1);
}

const workflowsDir = path.join(__dirname, '..', 'workflows');

let filesUpdated = 0;
const wfFiles = fs.existsSync(workflowsDir)
  ? fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))
  : [];

for (const f of wfFiles) {
  const p = path.join(workflowsDir, f);
  let text = fs.readFileSync(p, 'utf8');
  if (!text.includes(OLD_ID)) continue;
  const next = text.split(OLD_ID).join(newId);
  fs.writeFileSync(p, next, 'utf8');
  filesUpdated++;
}

let dbRows = 0;
try {
  const db = require('better-sqlite3')(getN8nDbPath());
  const cols = ['nodes', 'connections', 'settings', 'staticData', 'pinData', 'meta'];
  const rows = db.prepare('SELECT id, name FROM workflow_entity').all();
  for (const row of rows) {
    const full = db.prepare('SELECT * FROM workflow_entity WHERE id = ?').get(row.id);
    const updates = {};
    for (const col of cols) {
      const val = full[col];
      if (typeof val === 'string' && val.includes(OLD_ID)) {
        updates[col] = val.split(OLD_ID).join(newId);
      }
    }
    const keys = Object.keys(updates);
    if (keys.length === 0) continue;
    const sets = keys.map((c) => `"${c}" = ?`).join(', ');
    const stmt = db.prepare(`UPDATE workflow_entity SET ${sets} WHERE id = ?`);
    stmt.run(...keys.map((k) => updates[k]), row.id);
    dbRows++;
    console.log('DB actualizado:', row.name);
  }
  db.close();
} catch (e) {
  console.warn('No se pudo actualizar la base de datos n8n:', e.message);
  console.warn('(¿n8n cerrado? ¿existe database.sqlite en', getN8nDbPath(), '?)');
}

console.log('\n--- Resumen ---');
console.log('Archivos JSON en workflows/ actualizados:', filesUpdated);
console.log('Workflows en SQLite actualizados:', dbRows);
console.log('ID anterior:', OLD_ID);
console.log('ID nuevo:  ', newId);
