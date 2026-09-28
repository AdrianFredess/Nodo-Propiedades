const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'snippets', 'tg-idempotencia.js'), 'utf8');

function run(item, sd) {
  const sandbox = {
    $input: { first: () => ({ json: item }) },
    $getWorkflowStaticData: () => sd,
  };
  vm.createContext(sandbox);
  return new vm.Script('(function(){\n' + code + '\n})()').runInContext(sandbox);
}

const sd = {};
const first = run({ update_id: 10, message: { text: 'hola' } }, sd);
if (!first.length || sd.seenUpdateIds.indexOf(10) < 0) throw new Error('debia guardar 10');
const later = run({ update_id: 12, message: { text: 'c' } }, sd);
if (!later.length) throw new Error('12 debia pasar');
const outOfOrder = run({ update_id: 11, message: { text: 'b' } }, sd);
if (!outOfOrder.length) throw new Error('11 llego tarde y no es repetido');
const dup = run({ update_id: 10, message: { text: 'hola' } }, sd);
if (dup.length) throw new Error('repetido debia cortarse');
for (let i = 0; i < 200; i++) run({ update_id: 1000 + i }, sd);
if (sd.seenUpdateIds.length !== 200) throw new Error('deben quedar 200');
const oldAgain = run({ update_id: 10 }, sd);
if (!oldAgain.length) throw new Error('el id que salio de la ventana tiene que volver a pasar');
console.log('ok');
