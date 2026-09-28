import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardarSnapshot, leerSnapshot, listarSnapshots } from './bot-config-history.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodo-cfg-'));
const configPath = path.join(dir, 'bot-config.json');
fs.writeFileSync(configPath, JSON.stringify({ tono: 'formal', vendedor_nombre: 'Ana' }));

test('guarda y restaura un snapshot', () => {
  const id = guardarSnapshot(configPath);
  assert.ok(id.endsWith('.json'));
  fs.writeFileSync(configPath, JSON.stringify({ tono: 'distendido', vendedor_nombre: 'Ana' }));
  const prev = leerSnapshot(configPath, id);
  assert.equal(prev.tono, 'formal');
  assert.equal(leerSnapshot(configPath, '../bot-config.json'), null);
  assert.equal(listarSnapshots(configPath).length, 1);
});
