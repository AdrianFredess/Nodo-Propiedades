const assert = require('assert');
const {
  clasificarLecturaSheets,
  debeAlertarSheets,
  demoModeActivo,
  RESPUESTA_SHEETS_CAIDO,
} = require('./snippets/sheets-fail-closed');

const roto = clasificarLecturaSheets(
  [{ error: 'invalid_grant: The provided authorization grant is invalid' }],
  false,
  '',
);
assert.strictEqual(roto.ok, false);
assert.strictEqual(roto.rows.length, 0);
assert.ok(/invalid_grant/.test(roto.error));

const vacio = clasificarLecturaSheets([], false, '');
assert.strictEqual(vacio.ok, true);
assert.strictEqual(vacio.rows.length, 0);

const ok = clasificarLecturaSheets([{ id: 'MZA-001', tipo: 'depto', zona: 'Godoy Cruz', precio: '90000' }], false, '');
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.rows.length, 1);

const tiro = clasificarLecturaSheets([], true, 'nodo inexistente');
assert.strictEqual(tiro.ok, false);

const sd = {};
assert.strictEqual(debeAlertarSheets(sd, 1_000), true);
assert.strictEqual(debeAlertarSheets(sd, 1_000 + 10 * 60 * 1000), false);
assert.strictEqual(debeAlertarSheets(sd, 1_000 + 60 * 60 * 1000), true);

const prev = process.env.DEMO_MODE;
delete process.env.DEMO_MODE;
assert.strictEqual(demoModeActivo(), false);
process.env.DEMO_MODE = '1';
assert.strictEqual(demoModeActivo(), true);
if (prev == null) delete process.env.DEMO_MODE;
else process.env.DEMO_MODE = prev;

assert.strictEqual(RESPUESTA_SHEETS_CAIDO, 'Dame un rato que chequeo disponibilidad y te confirmo');
assert.ok(!/\d|USD|\$|MZA-/.test(RESPUESTA_SHEETS_CAIDO));

console.log('test-sheets-fail-closed ok');
