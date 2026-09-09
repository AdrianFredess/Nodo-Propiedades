/**
 * Reglas duras post-fix recontacto / stock.
 * node scripts/test-recontacto-stock.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, 'snippets');
const code = fs.readFileSync(path.join(root, 'intent-classifier.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const hist = [
  {
    role: 'user',
    content: 'busco algo por 100 mil dolares en godoy cruz',
    ts: '2026-09-07T12:50:00.000Z',
  },
  {
    role: 'assistant',
    content: 'Dale, te paso un par de opciones cerca de USD 100.000',
    ts: '2026-09-07T12:50:10.000Z',
  },
];

const now = new Date('2026-09-07T21:26:00.000Z');
const msg =
  'hola como estas, soy adrian. estaba buscando propiedades';

const c = ctx.clasificarIntencionCliente(msg, '', {
  historialJsonArr: hist,
  ultimaActualizacion: '2026-09-07T15:50:54.020Z',
  stockDisponible: true,
  now,
});

assert(c.mostrar_stock === false, '1) mostrar_stock false, got ' + c.mostrar_stock);
assert(
  c.es_recontacto === true || c.es_dia_nuevo === true || c.es_saludo === true,
  '1) es_recontacto/dia_nuevo/saludo, got ' + JSON.stringify(c),
);
assert(c.presupuesto_usd == null, '1) no heredar 100k, got ' + c.presupuesto_usd);
assert(c.intencion === 'saludo', '1) intencion saludo, got ' + c.intencion);
console.log('OK 1 recontacto suave:', {
  mostrar_stock: c.mostrar_stock,
  es_recontacto: c.es_recontacto,
  es_dia_nuevo: c.es_dia_nuevo,
  presupuesto_usd: c.presupuesto_usd,
});

const saludo = ctx.clasificarIntencionCliente('hola como estas', '', {
  historialJsonArr: hist,
  ultimaActualizacion: '2026-09-07T15:50:54.020Z',
  stockDisponible: true,
  now,
});
assert(saludo.mostrar_stock === false, '2) saludo puro sin stock');
assert(saludo.es_saludo === true, '2) es_saludo');
console.log('OK 2 saludo puro:', {
  mostrar_stock: saludo.mostrar_stock,
  es_saludo: saludo.es_saludo,
});

const pide = ctx.clasificarIntencionCliente('mostrame opciones', '', {
  historialJsonArr: hist,
  ultimaActualizacion: '2026-09-07T21:20:00.000Z',
  stockDisponible: true,
  now,
});
assert(pide.mostrar_stock === true, '3) mostrame opciones → stock');
console.log('OK 3 pedido explicito:', {
  mostrar_stock: pide.mostrar_stock,
  intencion: pide.intencion,
});

const vaga = ctx.clasificarIntencionCliente('busco depto', '', {
  historialJsonArr: [
    { role: 'assistant', content: 'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?' },
  ],
  ultimaActualizacion: '2026-09-07T21:20:00.000Z',
  stockDisponible: true,
  now,
});
assert(vaga.mostrar_stock === false, '5) busco depto sin stock, got ' + vaga.mostrar_stock);
assert(vaga.intencion === 'calificar', '5) intencion calificar, got ' + vaga.intencion);
console.log('OK 5 busqueda vaga:', {
  mostrar_stock: vaga.mostrar_stock,
  intencion: vaga.intencion,
});

const sinClaro = ctx.clasificarIntencionCliente('no se, mandame opciones', '', {
  historialJsonArr: [
    { role: 'user', content: 'busco depto' },
    {
      role: 'assistant',
      content:
        'Tenes algo pensado de zona o presupuesto, o preferis que te muestre opciones?',
    },
  ],
  ultimaActualizacion: '2026-09-07T21:25:00.000Z',
  stockDisponible: true,
  now,
});
assert(sinClaro.mostrar_stock === true, '6) no se → stock');
assert(
  sinClaro.intencion === 'pedir_opciones',
  '6) pedir_opciones, got ' + sinClaro.intencion,
);
console.log('OK 6 sin criterio:', {
  mostrar_stock: sinClaro.mostrar_stock,
  intencion: sinClaro.intencion,
});

const histPresu = [
  { role: 'user', content: 'estaba buscando propiedades, tengo 88 mil dolares' },
  { role: 'assistant', content: 'En godoy cruz mira estas' },
];
const aVer = ctx.clasificarIntencionCliente('a ver', '', {
  historialJsonArr: histPresu,
  ultimaActualizacion: '2026-09-07T22:08:00.000Z',
  stockDisponible: true,
  now: new Date('2026-09-07T22:18:00.000Z'),
});
assert(aVer.mostrar_stock === true, '7) a ver → stock, got ' + aVer.mostrar_stock);
assert(
  aVer.intencion === 'pedir_opciones',
  '7) a ver pedir_opciones, got ' + aVer.intencion,
);
console.log('OK 7 a ver:', { mostrar_stock: aVer.mostrar_stock, intencion: aVer.intencion });

const enviame = ctx.clasificarIntencionCliente('enviame lo que tengas', '', {
  historialJsonArr: histPresu.concat([
    { role: 'user', content: 'a ver' },
    { role: 'assistant', content: 'pregunta zona' },
  ]),
  ultimaActualizacion: '2026-09-07T22:18:00.000Z',
  stockDisponible: true,
  now: new Date('2026-09-07T22:18:50.000Z'),
});
assert(enviame.mostrar_stock === true, '8) enviame → stock');
assert(enviame.intencion === 'pedir_opciones', '8) enviame pedir_opciones');
console.log('OK 8 enviame:', {
  mostrar_stock: enviame.mostrar_stock,
  intencion: enviame.intencion,
});

const loQueHaya = ctx.clasificarIntencionCliente('enviame lo que haya', '', {
  historialJsonArr: histPresu,
  ultimaActualizacion: '2026-09-07T22:18:00.000Z',
  stockDisponible: true,
  now: new Date('2026-09-07T22:18:50.000Z'),
});
assert(loQueHaya.mostrar_stock === true, '8b) lo que haya → stock');
assert(loQueHaya.intencion === 'pedir_opciones', '8b) pedir_opciones');
console.log('OK 8b enviame lo que haya:', {
  mostrar_stock: loQueHaya.mostrar_stock,
  intencion: loQueHaya.intencion,
});

// Plantilla Matías no debe estar en few-shot de construir prompt
const tg = fs.readFileSync(path.join(root, 'tg-construir-prompt.js'), 'utf8');
assert(
  !/Soy Matías de Nodo Propiedades\. Cuando quieras contame qué necesitás/.test(tg),
  '4) few-shot Matías eliminado de tg-construir-prompt',
);
assert(
  /soy Matias de Nodo Propiedades/i.test(tg),
  '4) few-shot presentacion Matias',
);
assert(
  /PROHIBIDO responder solo "Hola"/i.test(tg) || /solo "Hola"/i.test(tg),
  '4) prohibe Hola de una palabra',
);
assert(/algo pensado/i.test(tg), '4) few-shot algo pensado');
assert(!/Cuál te llama más la atención/i.test(tg), '4) sin te llama en TG prompt');
console.log('OK 4 sin plantilla Matías en few-shot');

console.log('ALL PASS');
