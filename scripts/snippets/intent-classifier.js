/**
 * Clasificador de intención Matías — heurísticas combinadas (sin segundo call IA).
 * Se concatena antes de bot-aprendizaje.js vía patch scripts.
 */

const IC_ZONAS = [
  'godoy cruz',
  'guaymallen',
  'guaymallén',
  'capital',
  'lujan',
  'luján',
  'maipu',
  'maipú',
  'las heras',
  'san martin',
  'san martín',
  'mendoza',
];

const IC_ACK =
  /^(ok|dale|gracias|si|sí|no|bueno|perfecto|listo|jajaja|jaja|hola|buen[oa]s?|👍|🙏|de una|genial|bárbaro|barbaro|copado)\s*[!.?]*$/i;

const IC_OFF_TOPIC_DURO =
  /\b(comer|comida|restaurante|almorzar|cenar|desayun|hambur|pizza|asado|birra|cerveza|hambre|necesito comer|d[oó]nde (puedo|se puede) comer|receta|cocinar)\b/i;

const IC_PERSONAL_CLARO =
  /\b(hermano|hermana|mam[aá]|pap[aá]|salimos|tomamos|llamame al personal|no es por una propiedad|netflix|partido de f[uú]tbol)\b/i;

const IC_INMO_KEYWORDS =
  /\b(depto|departamento|casa|lote|local|oficina|alquiler|alquil|comprar|compra|venta|vender|propiedad|propiedades|inmueble|inmobiliaria|presupuesto|habitaci[oó]n|dormitorio|ambientes|m2|zona|barrio|visita|usd|u\$s|dolar|mza-\d+|nodo|expensas|cochera|escritur)\b/i;

const IC_PEDIR_OPCIONES =
  /\b(que ten[eé]s|qué ten[eé]s|que hay|qué hay|que venden|qué venden|mostrame|mostrá|mandame|mandá|pasame|pasá|opciones|catalogo|catálogo|enviame|enviá|algo para ver|ver algo|lo que tengas|lo que tengan|mandame algo|mostrame algo|sorprendeme|sorprendeme)\b/i;

const IC_SIN_CRITERIO =
  /\b(no tengo (nada )?(claro|en mente|definido)|no s[eé] (tanto|mucho|bien|nada)?|nose|no estoy seguro|sin criterio|sin idea|no defin[ií]|a[uú]n no s[eé]|todav[ií]a no s[eé]|me da igual|cualquier cosa|cualquiera)\b/i;

const IC_CURIOSO =
  /\b(solo (estoy )?(viendo|mirando|curioseando)|solo quiero ver|de curioso|por curiosidad|para ver nomas|para saber nomas|nomas (quiero|para) ver|cu[aá]nto sale|a cu[aá]nto|precio de|cu[aá]nto cuesta)\b/i;

const IC_VISITA =
  /\b(visita|verla|verlo|agendar|turno|recorrer|conocerla|conocerlo|s[aá]bado|domingo|pasar a ver)\b/i;

const IC_REFINAR =
  /\b(m[aá]s barato|m[aá]s caro|otra zona|otro barrio|m[aá]s grande|m[aá]s chico|menos|hasta|tope|refin|filtr|solo en|busco en)\b/i;

function icNormalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function icExtraerPresupuestoUsd(texto) {
  const t = String(texto || '').toLowerCase();
  let m = t.match(
    /(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})\s*(?:usd|u\$s|dolar(?:es)?|dolares)/i,
  );
  if (m) return parseInt(m[1].replace(/[.\s]/g, ''), 10);
  m = t.match(/(\d{2,3})\s*mil\s*(?:usd|u\$s|dolar(?:es)?)?/i);
  if (m) return parseInt(m[1], 10) * 1000;
  m = t.match(/\b(\d{2,3})k\b/i);
  if (m) return parseInt(m[1], 10) * 1000;
  m = t.match(/por\s+(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})/i);
  if (m) return parseInt(m[1].replace(/[.\s]/g, ''), 10);
  m = t.match(/(\d{2,3})\s*mil\b/i);
  if (m && !/\b(alquil|mensual|por mes)\b/i.test(t)) return parseInt(m[1], 10) * 1000;
  return null;
}

function icExtraerZona(texto) {
  const t = icNormalizar(texto);
  for (const z of IC_ZONAS) {
    if (t.includes(z)) return z;
  }
  return '';
}

function icExtraerOperacion(texto) {
  const t = String(texto || '').toLowerCase();
  if (/\b(alquil|rent|alquiler)\b/i.test(t)) return 'alquiler';
  if (/\b(compr|venta|vend|compra)\b/i.test(t)) return 'compra';
  return '';
}

function icYaMostroStock(historialTexto, historialArr) {
  const bots = [];
  if (Array.isArray(historialArr)) {
    for (const m of historialArr) {
      const role = String((m && m.role) || '').toLowerCase();
      if (role === 'assistant' || role === 'bot') {
        bots.push(String((m && m.content) || ''));
      }
    }
  }
  const h = (historialTexto || '') + ' ' + bots.join(' ');
  return /###MOSTRAR_PROPIEDADES###|te paso un par de opciones|mirá estas opciones|cuál te llama más/i.test(
    h,
  );
}

function icEsSaludoVacio(msg) {
  const m = String(msg || '').trim();
  return m.length > 0 && m.length < 30 && IC_ACK.test(m);
}

function clasificarIntencionCliente(msg, historial, opts) {
  const o = opts || {};
  const texto = String(msg || '').trim();
  const hist = String(historial || '').trim();
  const textoCompleto = (hist + '\n' + texto).trim();
  const esAudio = Boolean(o.esAudioSinTexto);

  if (esAudio) {
    return {
      intencion: 'audio',
      confianza: 'alta',
      mostrar_stock: false,
      modo_curioso: false,
      requiere_calificar: false,
      es_off_topic: false,
      es_saludo: false,
      presupuesto_usd: null,
      zona: '',
      operacion: '',
    };
  }

  const presupuestoUsd =
    icExtraerPresupuestoUsd(texto) || icExtraerPresupuestoUsd(hist);
  const zona = icExtraerZona(texto) || icExtraerZona(hist);
  const operacion = icExtraerOperacion(texto) || icExtraerOperacion(hist);
  const yaMostroStock = icYaMostroStock(hist, o.historialJsonArr);
  const esSaludo = icEsSaludoVacio(texto);

  let scoreInmo = 0;
  if (presupuestoUsd) scoreInmo += 4;
  if (zona) scoreInmo += 3;
  if (operacion) scoreInmo += 2;
  if (IC_INMO_KEYWORDS.test(texto)) scoreInmo += 3;
  if (IC_PEDIR_OPCIONES.test(texto)) scoreInmo += 4;
  if (IC_SIN_CRITERIO.test(texto)) scoreInmo += 3;
  if (IC_CURIOSO.test(texto)) scoreInmo += 2;
  if (IC_VISITA.test(texto)) scoreInmo += 3;
  if (IC_INMO_KEYWORDS.test(hist)) scoreInmo += 1;
  if (/\b(busco|necesito|quiero|tengo)\b/i.test(texto) && texto.length >= 8) scoreInmo += 1;

  let scoreOff = 0;
  if (IC_OFF_TOPIC_DURO.test(texto)) scoreOff += 5;
  if (IC_PERSONAL_CLARO.test(texto)) scoreOff += 4;
  if (scoreInmo >= 2) scoreOff = Math.max(0, scoreOff - 3);

  const pideOpciones =
    IC_PEDIR_OPCIONES.test(texto) ||
    IC_SIN_CRITERIO.test(texto) ||
    IC_CURIOSO.test(texto);
  let modoCurioso =
    IC_SIN_CRITERIO.test(texto) ||
    IC_CURIOSO.test(texto) ||
    (pideOpciones && !presupuestoUsd && !zona) ||
    (texto.length < 55 && IC_PEDIR_OPCIONES.test(texto));

  let mostrarStock =
    Boolean(o.stockDisponible !== false && o.stockDisponible !== 0) &&
    !(
      operacion === 'alquiler' &&
      presupuestoUsd &&
      presupuestoUsd >= 15000
    ) &&
    (pideOpciones ||
      Boolean(presupuestoUsd) ||
      modoCurioso ||
      (scoreInmo >= 3 && !esSaludo));

  const requiereCalificar =
    yaMostroStock &&
    !pideOpciones &&
    !IC_SIN_CRITERIO.test(texto) &&
    (IC_REFINAR.test(texto) ||
      (Boolean(zona) && IC_INMO_KEYWORDS.test(texto)) ||
      (Boolean(presupuestoUsd) && !modoCurioso));

  if (requiereCalificar && !IC_PEDIR_OPCIONES.test(texto)) {
    mostrarStock = Boolean(presupuestoUsd || IC_REFINAR.test(texto));
  }

  let intencion = 'explorar';
  if (esSaludo && scoreInmo < 2) intencion = 'saludo';
  else if (IC_VISITA.test(texto)) intencion = 'visita';
  else if (presupuestoUsd && !pideOpciones) intencion = 'presupuesto';
  else if (zona && !pideOpciones && !modoCurioso) intencion = 'consulta_zona';
  else if (pideOpciones || IC_SIN_CRITERIO.test(texto)) intencion = 'pedir_opciones';
  else if (modoCurioso) intencion = 'explorar';
  else if (scoreOff >= 5 && scoreInmo < 2) intencion = 'off_topic';

  let confianza = 'media';
  if (scoreInmo >= 5 || scoreOff >= 5 || esSaludo) confianza = 'alta';
  else if (scoreInmo <= 1 && scoreOff <= 1 && texto.length > 3) confianza = 'baja';

  if (confianza === 'baja' && intencion !== 'off_topic' && intencion !== 'saludo') {
    mostrarStock = Boolean(o.stockDisponible !== false && o.stockDisponible !== 0);
    if (mostrarStock && !requiereCalificar) {
      modoCurioso = true;
    }
  }

  let esOffTopic = false;
  if (scoreOff >= 5 && scoreInmo < 2 && !mostrarStock && !esSaludo) {
    esOffTopic = true;
    intencion = 'off_topic';
  }
  if (mostrarStock) esOffTopic = false;

  return {
    intencion,
    confianza,
    mostrar_stock: mostrarStock,
    modo_curioso: modoCurioso,
    requiere_calificar: requiereCalificar,
    es_off_topic: esOffTopic,
    es_saludo: esSaludo,
    presupuesto_usd: presupuestoUsd,
    zona,
    operacion,
    score_inmo: scoreInmo,
    score_off: scoreOff,
  };
}

function formatearBloqueIntencionPrompt(clasif) {
  const c = clasif || {};
  const lines = [
    'INTENCION_DETECTADA (clasificador automático — seguí esto; no contradigas mostrar_stock=true):',
    JSON.stringify({
      intencion: c.intencion,
      confianza: c.confianza,
      mostrar_stock: c.mostrar_stock,
      modo_curioso: c.modo_curioso,
      requiere_calificar: c.requiere_calificar,
    }),
  ];
  if (c.mostrar_stock) {
    lines.push(
      '- Si mostrar_stock=true: incluí ###MOSTRAR_PROPIEDADES### en esta respuesta SIN preguntar zona/presupuesto/operación antes.',
    );
  }
  if (c.modo_curioso && c.mostrar_stock) {
    lines.push(
      '- Modo curioso: intro corta + 2-3 fichas variadas; una pregunta suave al final, no cuestionario.',
    );
  }
  if (c.requiere_calificar) {
    lines.push(
      '- Cliente ya vio opciones y quiere refinar: podés calificar con preguntas concretas antes de mostrar de nuevo.',
    );
  }
  if (c.intencion === 'off_topic') {
    lines.push('- Off-topic claro: redirigí a propiedades en una frase, sin recomendar otros rubros.');
  }
  return lines.join('\n');
}

function esSoloPreguntas(respuesta) {
  const t = String(respuesta || '').trim();
  if (!t || t.length < 8) return false;
  const oraciones = t.split(/[.!]\s+|\?\s+/).filter(Boolean);
  if (!oraciones.length) return /\?\s*$/.test(t);
  const preguntas = oraciones.filter((o) => /\?\s*$/.test(o.trim()) || /^(busc|qué|que|cu[aá]nto|en qu[eé]|alguna|ten[eé]s)/i.test(o.trim()));
  return preguntas.length >= oraciones.length && preguntas.length >= 1;
}

function tagAprendizajePorIntencion(intencion) {
  const map = {
    pedir_opciones: ['opciones', 'informal', 'explorar'],
    explorar: ['opciones', 'explorar', 'informal'],
    consulta_zona: ['zona', 'opciones'],
    presupuesto: ['presupuesto', 'opciones'],
    visita: ['visita', 'caliente'],
    saludo: ['saludo', 'frio'],
    off_topic: [],
    audio: [],
  };
  return map[intencion] || ['consulta'];
}
