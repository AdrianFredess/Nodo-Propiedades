const assert = require('assert');
const { precioPedidoDesdeStock } = require('./snippets/precio-desde-stock');

const stock = [
  { id: 'MZA-001', precio: 'USD 85000', direccion: 'Calle X 123', estado: 'disponible', operacion: 'venta' },
  { id: 'MZA-002', precio: '90000', direccion: 'Otra 456', estado: 'activo' },
  { id: 'MZA-003', precio: 'ARS 120000000', direccion: 'Pesos 10', estado: 'disponible', operacion: 'venta' },
  { id: 'MZA-004', precio: 'U$S 85000', direccion: 'Dolares 20', estado: 'disponible' },
  { id: 'MZA-005', precio: 'ARS 250000', direccion: 'Alquiler 30', estado: 'disponible', operacion: 'alquiler' },
  { id: 'MZA-006', precio: 'USD 99000', direccion: 'Vendida 40', estado: 'vendido', operacion: 'venta' },
  { id: 'MZA-007', precio: '87000 USD', direccion: 'Sufijo 50', estado: 'disponible', operacion: 'venta' },
];

const b1 = precioPedidoDesdeStock('¿Cuánto sale el depto MZA-001?', stock);
assert.ok(b1);
assert.strictEqual(b1.texto, 'Sale USD 85.000');
assert.strictEqual(b1.id, 'MZA-001');

const dir = precioPedidoDesdeStock('a cuanto esta la de calle x 123', stock);
assert.ok(dir);
assert.strictEqual(dir.id, 'MZA-001');

assert.strictEqual(precioPedidoDesdeStock('hola, busco depto en godoy cruz', stock), null);
assert.strictEqual(precioPedidoDesdeStock('cuanto sale el MZA-999', stock), null);

const ars = precioPedidoDesdeStock('cuanto sale MZA-003', stock);
assert.strictEqual(ars.texto, 'Sale ARS 120.000.000');

const uss = precioPedidoDesdeStock('que precio tiene MZA-004', stock);
assert.strictEqual(uss.texto, 'Sale USD 85.000');

const sufijo = precioPedidoDesdeStock('cuanto sale MZA-007', stock);
assert.strictEqual(sufijo.texto, 'Sale USD 87.000');

const alquiler = precioPedidoDesdeStock('a cuanto esta el alquiler MZA-005', stock);
assert.strictEqual(alquiler.texto, 'El alquiler es de ARS 250.000');

const porMes = precioPedidoDesdeStock('precio del alquiler MZA-005', [
  { id: 'MZA-005', precio: 'ARS 350000', operacion: 'alquiler', periodo: 'por mes', estado: 'disponible' },
]);
assert.strictEqual(porMes.texto, 'El alquiler es de ARS 350.000 por mes');

const temporal = precioPedidoDesdeStock('cuanto sale el alquiler MZA-008', [
  { id: 'MZA-008', precio: 'USD 80', operacion: 'alquiler temporario', estado: 'disponible' },
]);
assert.strictEqual(temporal.texto, 'El alquiler es de USD 80 por dia');

const vendido = precioPedidoDesdeStock('cuanto sale MZA-006', stock);
assert.ok(vendido);
assert.strictEqual(vendido.mostrar, false);
assert.ok(vendido.texto.startsWith('Esa ya no esta disponible'));
assert.ok(!/Sale|USD|ARS|\d/.test(vendido.texto));
assert.ok(vendido.similares.indexOf('MZA-006') < 0);
assert.ok(vendido.similares.indexOf('MZA-001') >= 0);

assert.strictEqual(precioPedidoDesdeStock('cuanto sale MZA-002', stock), null);

const porColumna = precioPedidoDesdeStock('precio de MZA-002', [
  { id: 'MZA-002', precio: '120000000', moneda: 'ARS', estado: 'activo' },
]);
assert.strictEqual(porColumna.texto, 'Sale ARS 120.000.000');

console.log('test-precio-desde-stock ok');
