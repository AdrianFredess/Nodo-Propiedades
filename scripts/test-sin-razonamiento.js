const assert = require('assert');
const { textoVisibleGroq } = require('./snippets/sin-razonamiento');

const pensamiento = 'The user asked for a price. I should check the stock before answering.';

assert.strictEqual(
  textoVisibleGroq({ content: 'Sale USD 85.000', reasoning: pensamiento }),
  'Sale USD 85.000',
);

assert.strictEqual(
  textoVisibleGroq({ content: '', reasoning: pensamiento, reasoning_content: pensamiento }),
  '',
);

assert.strictEqual(
  textoVisibleGroq({ reasoning: pensamiento }),
  '',
);

assert.strictEqual(
  textoVisibleGroq({
    content: '<think>voy a mirar el stock</think>Mira, esta te puede servir',
  }),
  'Mira, esta te puede servir',
);

console.log('test-sin-razonamiento ok');
