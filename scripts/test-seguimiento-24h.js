const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'snippets', 'filtrar-candidatos.js'), 'utf8');

function run(rows, mode) {
  const sandbox = {
    $input: { all: () => rows.map((json) => ({ json })) },
    $env: { SEGUIMIENTO_MODE: mode },
  };
  vm.createContext(sandbox);
  return new vm.Script('(function(){\n' + code + '\n})()').runInContext(sandbox);
}

const hace = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const wa = run(
  [
    {
      chat_id: '5492610000000',
      nombre: 'Lead Ventana',
      zona: 'Godoy Cruz',
      canal_origen: 'whatsapp',
      estado_seguimiento: 'ninguno',
      ultima_actualizacion: hace(30),
      historial_json: JSON.stringify([
        { role: 'user', content: 'busco depto', ts: hace(48) },
        { role: 'assistant', content: 'te paso opciones', ts: hace(30) },
      ]),
    },
  ],
  'demo',
);

if (wa.length !== 1) throw new Error('esperaba 1 item, hay ' + wa.length);
if (!wa[0].json.requiere_plantilla) throw new Error('no marco requiere_plantilla');
if (wa[0].json.estado_seguimiento !== 'requiere_plantilla') throw new Error('estado');
if (wa[0].json.mensaje) throw new Error('no debia armar mensaje al cliente');
if (!wa[0].json.aviso_vendedor.includes('fuera de 24h')) throw new Error('sin aviso');

const tg = run(
  [
    {
      chat_id: '111',
      nombre: 'Ana',
      zona: 'Maipu',
      canal_origen: 'telegram',
      estado_seguimiento: 'ninguno',
      ultima_actualizacion: hace(48),
      historial_json: JSON.stringify([{ role: 'user', content: 'hola', ts: hace(48) }]),
    },
  ],
  'demo',
);
if (tg.length !== 1 || tg[0].json.requiere_plantilla) throw new Error('telegram no tiene ventana');
if (!tg[0].json.mensaje) throw new Error('telegram debia tener mensaje');

const reciente = run(
  [
    {
      chat_id: '222',
      nombre: 'Beto',
      zona: 'Ciudad',
      canal_origen: 'whatsapp',
      estado_seguimiento: 'ninguno',
      ultima_actualizacion: hace(1),
      historial_json: JSON.stringify([{ role: 'user', content: 'hola', ts: hace(1) }]),
    },
  ],
  'demo',
);
if (reciente.length !== 0) throw new Error('dentro de 24h y de hoy no entra al seguimiento');

console.log('ok');
