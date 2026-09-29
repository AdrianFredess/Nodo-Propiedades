const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'snippets', 'intent-classifier.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const stock = [];
for (let i = 1; i <= 12; i++) {
  stock.push({
    id: 'MZA-' + String(i).padStart(3, '0'),
    zona: i % 2 ? 'Godoy Cruz' : 'Maipu',
    precio: String(70000 + i * 1000) + ' USD',
    operacion: i % 3 === 0 ? 'alquiler' : 'venta',
    tipo: 'departamento',
  });
}

const sinDatos = ctx.icFiltrarStockParaPrompt(stock, {});
assert.strictEqual(sinDatos.length, 5, 'sin datos: max 5');

const godoy = ctx.icFiltrarStockParaPrompt(stock, { zona: 'Godoy Cruz', max: 8 });
assert.ok(godoy.length >= 1 && godoy.length <= 8, 'con zona: max 8');
assert.ok(godoy.every((r) => /godoy/i.test(r.zona)), 'filtra por zona');

const alq = ctx.icFiltrarStockParaPrompt(stock, { operacion: 'alquiler', max: 8 });
assert.ok(alq.length >= 1 && alq.length <= 8);
assert.ok(alq.every((r) => /alquil/i.test(r.operacion)));

const turnos = [];
for (let i = 1; i <= 10; i++) {
  turnos.push({ role: 'user', content: 'pedido ' + i });
  turnos.push({ role: 'assistant', content: 'respuesta ' + i });
}
const hist = ctx.icHistorialParaPrompt(turnos);
assert.strictEqual(hist.mensajes.filter((m) => m.role === 'user').length, 8);
assert.ok(hist.resumen.indexOf('Antes:') === 0);
assert.ok(hist.resumen.indexOf('pedido 1') >= 0);
assert.ok(hist.resumen.indexOf('pedido 10') < 0);

const largo =
  'EJEMPLO 1 -- texto largo de reglas '.repeat(200) +
  '\nDATOS_CONOCIDOS\n{"zona":"Godoy Cruz"}\nCONTEXTO:\n- Turno: 3\n' +
  'STOCK (solo IDs de esta lista):\n- [MZA-001] depto | Godoy Cruz | USD 80000\n' +
  'MOSTRAR PROPIEDADES\n' +
  'instruccion repetida '.repeat(150) +
  '\nPOLITICAS_PAGO:\nseña: coordinar\n';
const corto = ctx.compactarPromptMatias(largo);
assert.ok(corto.indexOf('EJEMPLO 1') < 0, 'saca los ejemplos largos');
assert.ok(corto.indexOf('STOCK (solo') >= 0);
assert.ok(corto.indexOf('POLITICAS_PAGO') >= 0);
assert.ok(corto.indexOf('MZA-001') >= 0);
assert.ok(corto.length <= 9100, 'cabe en ~2600 tokens: ' + corto.length);

const tg = fs.readFileSync(path.join(__dirname, 'snippets', 'tg-construir-prompt.js'), 'utf8');
const a = tg.indexOf('const systemPrompt =');
const b = tg.indexOf('function sanitizarMensajeGroq');
const armar = new Function(
  'botConfig',
  'datosConocidos',
  'turno',
  'offTopicCount',
  'ultimaActualizacionStr',
  'diasSinContacto',
  'refSeg',
  'consultaRepetida',
  'ultimoBotHistorial',
  'modoObligatorio',
  'clasif',
  'bloqueAprendizaje',
  'stockText',
  'citaLink',
  'politicasText',
  'formatearBloqueIntencionPrompt',
  tg.slice(a, b) + '\nreturn systemPrompt;',
);
const stockLine = '- [MZA-001] departamento | Godoy Cruz | op:venta | USD 87000 | ' + 'x'.repeat(80) + ' (disponible)';
const promptRealista = armar(
  { tono: 'cercano', horario_humano_desde: '9', horario_humano_hasta: '18', vendedor_nombre: 'Matias' },
  { zona: 'Godoy Cruz', presupuesto: '80000', operacion: 'venta', nombre: 'Ana' },
  6,
  0,
  '2026-09-28',
  1,
  '',
  false,
  'Con 80 mil tengo opciones en Godoy Cruz. Cual te cierra mas?',
  '\n\nMODO MOSTRAR PROPIEDADES (OBLIGATORIO):\n- IDs sugeridos del stock real: ["MZA-001","MZA-002"]\n- HAY STOCK real.\n',
  { intencion: 'buscar' },
  'APRENDIZAJE:\n' + 'ejemplo corto de como respondio Matias ante una consulta parecida. '.repeat(8),
  [stockLine, stockLine, stockLine, stockLine, stockLine, stockLine, stockLine, stockLine].join('\n'),
  'https://calendario.example/turno',
  'seña: coordinar con el vendedor. escritura: gastos aparte. '.repeat(8),
  function () {
    return 'INTENCION: buscar propiedad en Godoy Cruz, venta, alrededor de 80 mil.';
  },
);
const medido = ctx.compactarPromptMatias(promptRealista);
const tokens = Math.ceil(medido.length / 3.5);
assert.ok(medido.length <= 9100, 'prompt realista cabe: ' + medido.length + ' chars ~' + tokens);
assert.ok(medido.indexOf('EJEMPLO 1') < 0);
assert.ok(medido.split('[MZA-001]').length - 1 >= 8, 'conserva las 8 lineas de stock');
assert.ok(medido.indexOf('POLITICAS_PAGO') >= 0);
assert.ok(medido.indexOf('MODO MOSTRAR PROPIEDADES') >= 0);

const wa =
  'EJEMPLO 1 largo\nSTOCK (solo IDs):\n- [MZA-009] depto\nMOSTRAR PROPIEDADES\ntexto largo\nVISITAS:\n- Link turnos: https://calendario.example/turno\nTEMPERATURA\nrecalcula largo\nDATOS YA CARGADOS:\n{"zona":"Maipu"}\n';
const waCorto = ctx.compactarPromptMatias(wa);
assert.ok(waCorto.indexOf('https://calendario.example/turno') >= 0, 'conserva el link de visita');
assert.ok(waCorto.indexOf('DATOS YA CARGADOS') >= 0);
assert.ok(waCorto.indexOf('[MZA-009]') >= 0);
assert.ok(waCorto.indexOf('\nTEMPERATURA') < 0);

console.log('test-prompt-corto ok', corto.length, 'realista', medido.length, '~tokens', tokens);
