/**
 * Test local rápido: saludo humano + clasificador temperatura.
 * node scripts/test-tono-temperatura.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, 'snippets');
const code =
  fs.readFileSync(path.join(root, 'humanize-voz.js'), 'utf8') +
  '\n' +
  fs.readFileSync(path.join(root, 'lead-temperatura.js'), 'utf8');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- Tono ---
const robot =
  'Hola, cómo estás? Soy Matías de Nodo Propiedades. Cuando necesites contame qué buscás';
const limpio = ctx.humanizarVoz(robot);
assert(!/Soy Mat/i.test(limpio), 'debe quitar Soy Matias: ' + limpio);
assert(!/cuando necesites/i.test(limpio), 'debe quitar cuando necesites: ' + limpio);
assert(!/cómo/i.test(limpio) || /como/i.test(limpio), 'aflojar tildes: ' + limpio);

const news =
  'Te dejo estas opciones. En unos dias te escribo con mas opciones que se ajusten a lo que buscas';
assert(ctx.suenaPlantillaRobot(news), 'detecta cierre newsletter');
const newsLimpio = ctx.humanizarVoz(news);
assert(!/en unos dias te escribo/i.test(newsLimpio), 'quita newsletter: ' + newsLimpio);
assert(!/Te dejo estas opciones/i.test(newsLimpio), 'quita te dejo estas: ' + newsLimpio);

const intro = ctx.introFichasHumana({
  textoUsuario: 'mostrame opciones en godoy cruz',
  zona: 'Godoy Cruz',
  variantIdx: 0,
});
assert(intro && !/USD\s*\d/.test(intro), 'intro humana sin USD: ' + intro);
assert(
  typeof ctx.cierreComercialHumano === 'function',
  'cierreComercialHumano debe existir',
);
const cierre = ctx.cierreComercialHumano(0);
assert(!/en unos dias/i.test(cierre), 'cierre sin newsletter: ' + cierre);
assert(!/Te dejo estas opciones/i.test(cierre), 'cierre comercial: ' + cierre);
assert(!/en unos dias/i.test(String(ctx.LT_CIERRE_TIBIO || '')), 'LT_CIERRE_TIBIO limpio');

const s0 = ctx.saludoHumanoCorto(0);
const s1 = ctx.saludoHumanoCorto(1);
const s2 = ctx.saludoHumanoCorto(2);
assert(s0 && /Matias de Nodo Propiedades/i.test(s0), 'saludo presentacion: ' + s0);
assert(s1 !== s0 || s2 !== s0, 'saludados deben variar');
assert(!/Cuando (necesites|quieras)/i.test(s0 + s1 + s2), 'sin plantilla larga');
assert(!ctx.esSaludoUnaPalabra(s0), 'saludo no es una palabra');
assert(ctx.esSaludoUnaPalabra('Hola'), 'detecta Hola solo');
assert(ctx.esSaludoUnaPalabra('Buenas'), 'detecta Buenas solo');
assert(ctx.sanitizarPuntuacion('Hola]') === 'Hola', 'sanitiza corchete: Hola]');

const saludoOk =
  'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?';
const saludoOkLimpio = ctx.humanizarVoz(saludoOk);
assert(
  /Matias de Nodo Propiedades/i.test(saludoOkLimpio),
  'NO borra presentacion corta: ' + saludoOkLimpio,
);
assert(!ctx.suenaPlantillaRobot(saludoOk), 'presentacion corta no es robot');

assert(ctx.suenaPlantillaRobot(robot), 'detecta plantilla robot');

// Strip agresivo de tildes + ban cierre chatbot
const conTildes =
  'Cómo estás? Más días también. Matías. Alguna de estas te llama? Te llama la atención?';
const sinTildes = ctx.humanizarVoz(conTildes);
assert(!/[áéíóúÁÉÍÓÚ]/.test(sinTildes), 'sin tildes outbound: ' + sinTildes);
assert(!/te llama/i.test(sinTildes), 'sin te llama: ' + sinTildes);
assert(
  /cierra mas|te cierra/i.test(sinTildes) || /cierra/i.test(sinTildes),
  'reemplaza te llama: ' + sinTildes,
);
assert(/ñ/i.test(ctx.aflojarTildesConversacional('Mendoza ñandú')), 'conserva ñ');
const basuraBot = ctx.humanizarVoz(
  '¡Claro! Acá te muestro un par de opciones que tenemos disponibles',
);
assert(!/Claro/i.test(basuraBot) || /Mira/i.test(basuraBot), 'ban Claro: ' + basuraBot);
assert(!/Ac[aá] te muestro/i.test(basuraBot), 'ban Aca te muestro: ' + basuraBot);
assert(!/opciones que tenemos/i.test(basuraBot), 'ban opciones disponibles: ' + basuraBot);
assert(!/[áéíóúÁÉÍÓÚ]/.test(basuraBot), 'basura sin tildes: ' + basuraBot);
assert(/Mira estas|estas/i.test(basuraBot), 'reescribe a Mira estas: ' + basuraBot);
const cierre2 = ctx.cierreComercialHumano(0);
assert(!/te llama/i.test(cierre2), 'cierre sin te llama: ' + cierre2);
assert(/cierra|cuento|visita|miramos/i.test(cierre2), 'cierre asesor: ' + cierre2);
const preg =
  typeof ctx.preguntaAlgoPensado === 'function'
    ? ctx.preguntaAlgoPensado(0)
    : '';
assert(
  /algo pensado|opciones|zona|presupuesto/i.test(preg),
  'pregunta algo pensado: ' + preg,
);
assert(!/[áéíóú]/.test(preg), 'pregunta sin tildes: ' + preg);

console.log('OK tono:', JSON.stringify({ limpio, s0, s1, s2, saludoOkLimpio, sinTildes, cierre2, preg }));

// --- Temperatura ---
const frio = ctx.calcularTemperaturaLead({
  historialArr: [],
  mensajeActual: 'hola',
});
assert(frio.temperatura === 'frio', 'hola → frio');
assert(!frio.puede_clasificar, 'hola no clasifica');

const tibio = ctx.calcularTemperaturaLead({
  historialArr: [{ role: 'user', content: 'busco depto' }],
  mensajeActual: 'hasta 90 mil en Maipu',
  zona: 'Maipu',
  presupuesto: '90000',
});
assert(tibio.temperatura === 'tibio' || tibio.temperatura === 'caliente', 'señales → tibio+');
console.log('OK temp:', {
  frio: frio.temperatura,
  tibio: tibio.temperatura,
  motivo: tibio.motivo,
});

const caliente = ctx.calcularTemperaturaLead({
  historialArr: [{ role: 'user', content: 'busco depto' }],
  mensajeActual:
    'Tengo credito preaprobado, necesito mudarme este mes en Godoy Cruz',
  zona: 'Godoy Cruz',
  tipo_propiedad: 'departamento',
  financiacion: 'credito_preaprobado',
  urgencia: 'inmediato',
});
assert(caliente.temperatura === 'caliente', 'caliente esperado, got ' + caliente.temperatura);
console.log('OK caliente:', caliente.temperatura, caliente.motivo);
console.log('ALL PASS');
