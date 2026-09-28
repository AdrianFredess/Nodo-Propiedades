import fs from 'node:fs';
import path from 'node:path';

const MAX = 20;

function dirOf(configPath) {
  return path.join(path.dirname(configPath), 'bot-config-history');
}

function safeName(id) {
  const name = path.basename(String(id || ''));
  if (!/^[\w.-]+\.json$/.test(name)) return '';
  return name;
}

export function guardarSnapshot(configPath) {
  if (!fs.existsSync(configPath)) return '';
  const dir = dirOf(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const name = new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.copyFileSync(configPath, path.join(dir, name));
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  while (files.length > MAX) {
    fs.unlinkSync(path.join(dir, files.shift()));
  }
  return name;
}

export function listarSnapshots(configPath) {
  const dir = dirOf(configPath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .map((name) => ({ id: name }));
}

export function leerSnapshot(configPath, id) {
  const name = safeName(id);
  if (!name) return null;
  const file = path.join(dirOf(configPath), name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
