/**
 * Regresión de los casos S del eval. El texto de C es fijo, no lo escribe el modelo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'snippets', 'intent-classifier.js'), 'utf8');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.createContext(sandbox);
vm.runInContext(
  code +
    '\n;this.clasificarDerivacionHumano=clasificarDerivacionHumano;this.mensajeDerivacionCliente=mensajeDerivacionCliente;',
  sandbox,
);
const { clasificarDerivacionHumano, mensajeDerivacionCliente } = sandbox;
const casos = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'eval', 'casos-matias.v1.json'), 'utf8'),
).casos;
const fijo = mensajeDerivacionCliente({ vendedor_nombre: 'Adrian' });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const s1 = casos.find((c) => c.id === 'S1');
const s2 = casos.find((c) => c.id === 'S2');
const d1 = clasificarDerivacionHumano(s1.mensaje);
assert(d1.categoria === 'C' && d1.motivo === 'frustracion', 'S1 debe ser C');
assert(fijo === 'Te paso con Adrian, en un momento te escribe.', 'texto fijo');

const d2 = clasificarDerivacionHumano(s2.mensaje);
assert(d2.categoria !== 'C', 'S2 no es C');

assert(clasificarDerivacionHumano('NECESITO VISITAR YA!!!').categoria !== 'C', 'urgencia en mayusculas');
assert(clasificarDerivacionHumano('esta un poco caro').categoria === 'A', 'queja leve');
assert(clasificarDerivacionHumano('si seguro, buenísimo').categoria === 'A', 'sarcasmo ambiguo');

const parse = fs.readFileSync(path.join(__dirname, 'snippets', 'tg-parsear-respuesta.js'), 'utf8');
assert(parse.includes('mensajeDerivacionTxt'), 'el cliente recibe el texto fijo');
assert(parse.includes("derivacion.motivo === 'sheets_error'"), 'sheets no pisa ese texto');

console.log('ok', fijo);
