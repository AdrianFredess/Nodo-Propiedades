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
if (!first.length || sd.lastUpdateId !== 10) throw new Error('debia guardar 10');
const dup = run({ update_id: 10, message: { text: 'hola' } }, sd);
if (dup.length) throw new Error('repetido debia cortarse');
const next = run({ update_id: 11, message: { text: 'b' } }, sd);
if (!next.length || sd.lastUpdateId !== 11) throw new Error('el siguiente pasa');
console.log('ok');
