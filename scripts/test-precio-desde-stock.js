const assert = require('assert');
const { precioPedidoDesdeStock } = require('./snippets/precio-desde-stock');

const stock = [
  { id: 'MZA-001', precio: 'USD 85000', direccion: 'Calle X 123' },
  { id: 'MZA-002', precio: '90000', direccion: 'Otra 456' },
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

console.log('test-precio-desde-stock ok');
