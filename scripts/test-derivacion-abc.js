/**
 * Test local: categorías de derivación A/B/C
 * node scripts/test-derivacion-abc.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(
  path.join(__dirname, 'snippets', 'intent-classifier.js'),
  'utf8',
);
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.createContext(sandbox);
vm.runInContext(code + '\n;this.clasificarDerivacionHumano=clasificarDerivacionHumano;this.armarAvisoVendedorContexto=armarAvisoVendedorContexto;this.mensajeDerivacionCliente=mensajeDerivacionCliente;', sandbox);

const { clasificarDerivacionHumano, armarAvisoVendedorContexto, mensajeDerivacionCliente } =
  sandbox;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// A — rubro general
let d = clasificarDerivacionHumano('que es una seña');
assert(d.categoria === 'A' && !d.alertar, 'A seña');

// B — visita
d = clasificarDerivacionHumano('quiero agendar una visita el sabado');
assert(d.categoria === 'B' && d.alertar && !d.pausar, 'B visita');

// B — lead completo
d = clasificarDerivacionHumano('dale', { leadCompleto: true });
assert(d.categoria === 'B' && d.motivo === 'lead_completo', 'B lead');

// C — pide humano
d = clasificarDerivacionHumano('quiero hablar con una persona');
assert(d.categoria === 'C' && d.pausar && d.alertar, 'C humano');

// C — negociacion
d = clasificarDerivacionHumano('te lo dejo en 80 mil si cierro hoy');
assert(d.categoria === 'C' && d.motivo === 'negociacion', 'C nego');

const aviso = armarAvisoVendedorContexto({
  nombre: 'Juan',
  canal: 'telegram',
  chatId: '123',
  zona: 'Godoy Cruz',
  presupuesto: '100000',
  operacion: 'compra',
  motivo: 'negociacion',
  resumen: 'quiere bajar precio',
  panelBase: 'http://localhost:5173',
});
assert(aviso.includes('Juan') && aviso.includes('Panel:'), 'aviso contexto');
assert(mensajeDerivacionCliente({ vendedor_nombre: 'Adrian' }).includes('Adrian'), 'msg');

console.log('OK test-derivacion-abc');
