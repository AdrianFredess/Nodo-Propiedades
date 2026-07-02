/**
 * 1) Borra en SQLite cualquier workflow con el mismo nombre que cada JSON del repo
 *    (así no quedan duplicados: queda solo la version importada desde disco).
 * 2) Importa cada JSON con n8n CLI. Si falta workflow.id (n8n 2.x), genera uno.
 * 3) Pasa deduplicacion por si quedara algun duplicado raro.
 *
 * IMPORTANTE: cierra n8n antes (SQLite).
 *
 * Uso:
 *   node scripts/_sync_importar_todos_workflows.js
 *
 * Carpeta de datos (opcional): set N8N_USER_FOLDER=C:\ruta\.n8n
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const {
  getN8nDbPath,
  newWorkflowEntityId,
  deleteAllWorkflowsByName,
} = require('./_n8n_db_workflow_utils');

const root = path.join(__dirname, '..');
const workflowsDir = path.join(root, 'workflows');
const dbPath = getN8nDbPath();

if (!fs.existsSync(dbPath)) {
  console.error('No existe la base de datos n8n:', dbPath);
  console.error('Ajusta N8N_USER_FOLDER o ejecuta n8n al menos una vez.');
  process.exit(1);
}

const files = fs
  .readdirSync(workflowsDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (!files.length) {
  console.error('No hay .json en workflows/');
  process.exit(1);
}

console.log('Paso 1: quitar workflows existentes con el mismo nombre que los JSON...\n');
const db = new Database(dbPath);
for (const f of files) {
  const fullPath = path.join(workflowsDir, f);
  let wf;
  try {
    wf = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (e) {
    console.error('JSON invalido:', f, e.message);
    continue;
  }
  const name = wf.name;
  if (!name) {
    console.warn('Sin name:', f);
    continue;
  }
  const n = deleteAllWorkflowsByName(db, name);
  if (n) console.log(`  ${f}: eliminados ${n} registro(s) "${name}"`);
}
db.close();

console.log('\nPaso 2: importar', files.length, 'workflows (CLI n8n)...\n');

let ok = 0;
let fail = 0;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-import-'));

for (const f of files) {
  const fullPath = path.join(workflowsDir, f);
  let wf;
  try {
    wf = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (e) {
    console.error('FALLO parse:', f, e.message);
    fail++;
    continue;
  }
  if (!wf.name) {
    console.error('FALLO sin name:', f);
    fail++;
    continue;
  }
  if (!wf.id) wf.id = newWorkflowEntityId();
  const tmpFile = path.join(tmpDir, f.replace(/[^\w.-]+/g, '_'));
  fs.writeFileSync(tmpFile, JSON.stringify(wf, null, 2), 'utf8');
  try {
    execSync(`n8n import:workflow --input="${tmpFile}"`, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    console.log('OK:', f, '\n');
    ok++;
  } catch (_) {
    console.error('FALLO import:', f, '\n');
    fail++;
  }
}

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch (_) {}

console.log(`\nImport: ${ok} ok, ${fail} fallidos.\n`);
console.log('Paso 3: deduplicar por nombre (por si acaso)...\n');

try {
  execSync(`node "${path.join(__dirname, '_eliminar_duplicados_workflows.js')}"`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, N8N_USER_FOLDER: path.dirname(dbPath) },
  });
} catch (_) {
  console.error('Aviso: deduplicacion devolvio error (revisa arriba).');
}

console.log('\nPaso 4: eliminar workflows WF-* que ya no existen en workflows/...\n');
try {
  execSync(`node "${path.join(__dirname, '_limpiar_workflows_wf_huerfanos.js')}"`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, N8N_USER_FOLDER: path.dirname(dbPath) },
  });
} catch (_) {
  console.error('Aviso: limpieza de huerfanos devolvio error (revisa arriba).');
}

console.log('\nListo. Arranca n8n y ejecuta: node scripts/_post_import.js (o _actualizar_ids_importados.js)\n');
