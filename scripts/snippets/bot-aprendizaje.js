/**
 * Aprendizaje conversacional Matías — compartido WA/TG.
 * Se concatena después de humanize-voz.js vía patch scripts.
 * Seed global: __BOT_APRENDIZAJE_JSON__ (data/bot-aprendizaje.json)
 */

const BOT_APRENDIZAJE_SEED = __BOT_APRENDIZAJE_JSON__;

const ZONAS_MENDOZA = [
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
];

const SALUDOS_VACIOS =
  /^(ok|dale|gracias|si|sí|no|bueno|perfecto|listo|jajaja|jaja|hola|buen[oa]s?|👍|🙏)\b/i;

function pickRow(r, keys) {
  for (const k of keys) {
    if (r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
  }
  return '';
}

function extraerZonaDeTexto(texto) {
  const t = normalizarTexto(texto);
  for (const z of ZONAS_MENDOZA) {
    if (t.includes(z)) return z;
  }
  return '';
}

function extraerOperacionDeTexto(texto) {
  const t = String(texto || '').toLowerCase();
  if (/\b(alquil|rent|alquiler)\b/i.test(t)) return 'alquiler';
  if (/\b(compr|venta|vend|compra)\b/i.test(t)) return 'compra';
  return '';
}

function extraerPresupuestoUsdDeTexto(texto) {
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

function analizarHistorial(historialArr, datosPrev) {
  const arr = parseHistorialArr(historialArr);
  const users = obtenerMensajesUsuario(arr);
  const bots = obtenerMensajesBot(arr);
  const prev = datosPrev || {};

  let operacion = pickRow(prev, ['operacion']) || '';
  let zona = pickRow(prev, ['zona']) || '';
  let presupuesto = pickRow(prev, ['presupuesto']) || '';
  let dormitorios = pickRow(prev, ['dormitorios']) || '';

  const todoTexto = users.join(' ');
  if (!operacion) operacion = extraerOperacionDeTexto(todoTexto);
  if (!zona) zona = extraerZonaDeTexto(todoTexto);
  const presuNum = extraerPresupuestoUsdDeTexto(todoTexto);
  if (!presupuesto && presuNum) presupuesto = 'USD ' + presuNum;

  const preguntasRepetidas = [];
  const normUsers = users.map(normalizarTexto).filter(Boolean);
  for (let i = 0; i < normUsers.length - 1; i++) {
    for (let j = i + 1; j < normUsers.length; j++) {
      if (esSimilar(normUsers[i], normUsers[j], 0.62)) {
        preguntasRepetidas.push(users[j]);
        break;
      }
    }
  }

  const temasYaCubiertos = [];
  const botsText = bots.join(' ').toLowerCase();
  if (/\b(comprar o alquilar|compra vs alquiler|presupuesto mensual)\b/i.test(botsText)) {
    temasYaCubiertos.push('ya aclaraste compra vs alquiler');
  }
  if (/###MOSTRAR_PROPIEDADES###|te paso un par de opciones|mirá estas opciones/i.test(botsText)) {
    temasYaCubiertos.push('ya mostraste opciones del stock');
  }
  if (/\b(link para agendar|coordinamos|visita)\b/i.test(botsText)) {
    temasYaCubiertos.push('ya hablaste de visita/agenda');
  }
  if (/\bno tengo nada|sin stock|no me queda stock\b/i.test(botsText)) {
    temasYaCubiertos.push('ya explicaste falta de stock en esa zona/tope');
  }

  const objeciones = [];
  const ultimoUser = users.length ? users[users.length - 1] : '';
  const ultimoLow = ultimoUser.toLowerCase();
  if (/\b(caro|car[ií]simo|muy caro|no me alcanza|subi[oó]|baj[aá])\b/i.test(ultimoLow)) {
    objeciones.push('precio');
  }
  if (/\b(lejos|zona fea|no me gusta esa zona|otra zona)\b/i.test(ultimoLow)) {
    objeciones.push('zona');
  }
  if (/\b(chico|chica|poco espacio|muy chico)\b/i.test(ultimoLow)) {
    objeciones.push('tamaño');
  }

  const intentClarificado =
    operacion === 'alquiler' && presuNum && presuNum >= 15000
      ? 'posible_confusion_alquiler_usd_alto'
      : operacion || '';

  return {
    operacion,
    zona,
    presupuesto,
    presuNum,
    dormitorios,
    preguntasRepetidas: [...new Set(preguntasRepetidas)].slice(-2),
    temasYaCubiertos: [...new Set(temasYaCubiertos)],
    objeciones,
    intentClarificado,
    turnos: arr.length,
    botsCount: bots.length,
  };
}

function construirContextoAprendizaje(historialArr, datosPrev, msgActual) {
  const analisis = analizarHistorial(historialArr, datosPrev);
  const lineas = [];

  if (analisis.operacion) {
    lineas.push(
      '- Intención detectada en la conversación: ' +
        (analisis.intentClarificado === 'posible_confusion_alquiler_usd_alto'
          ? 'cliente mencionó alquiler con presupuesto alto en USD (verificar compra vs alquiler)'
          : analisis.operacion),
    );
  }
  if (analisis.zona) lineas.push('- Zona ya mencionada: ' + analisis.zona);
  if (analisis.presupuesto) lineas.push('- Presupuesto ya mencionado: ' + analisis.presupuesto);
  if (analisis.dormitorios) lineas.push('- Dormitorios/ambientes: ' + analisis.dormitorios);

  if (analisis.preguntasRepetidas.length) {
    lineas.push(
      '- El cliente repitió consultas similares; no repitas la misma respuesta palabra por palabra',
    );
  }
  if (analisis.temasYaCubiertos.length) {
    lineas.push('- En esta conversación ' + analisis.temasYaCubiertos.join('; '));
  }
  if (analisis.objeciones.length) {
    lineas.push(
      '- Objeción reciente: ' +
        analisis.objeciones.join(', ') +
        '. Respondé con empatía y alternativa concreta',
    );
  }

  const msg = String(msgActual || '').trim();
  if (msg && analisis.temasYaCubiertos.some((t) => t.includes('compra vs alquiler'))) {
    if (/\b(alquil|compr|venta)\b/i.test(msg)) {
      lineas.push('- Cliente sigue en tema operación: avanzá sin re-explicar todo desde cero');
    }
  }

  if (!lineas.length) {
    return '(Primera interacción o sin señales claras todavía. Adaptá tono al mensaje actual.)';
  }

  return (
    'APRENDIZAJE DE ESTA CONVERSACIÓN (usalo para no repetir y sonar natural):\n' +
    lineas.join('\n') +
    '\n- Adaptá el tono al historial; no copies plantillas si ya cubriste el tema.'
  );
}

function filtrarFilasAprendizaje(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => {
    const ctx = pickRow(r, ['contexto_cliente', 'Contexto_cliente', 'contexto']);
    const resp = pickRow(r, ['respuesta_matias', 'Respuesta_matias', 'respuesta']);
    if (!ctx || !resp) return false;
    if (/^contexto/i.test(ctx) && /^respuesta/i.test(resp)) return false;
    return ctx.length >= 8 && resp.length >= 12;
  });
}

function formatearAprendizajeSheets(rows, limite) {
  const max = limite || 6;
  const valid = filtrarFilasAprendizaje(rows);
  if (!valid.length) return '';

  const slice = valid.slice(-max);
  const pares = slice
    .map((r) => {
      const ctx = pickRow(r, ['contexto_cliente', 'Contexto_cliente', 'contexto']);
      const resp = pickRow(r, ['respuesta_matias', 'Respuesta_matias', 'respuesta']);
      const zona = pickRow(r, ['zona', 'Zona']);
      const op = pickRow(r, ['operacion', 'Operacion']);
      let extra = '';
      if (zona || op) extra = ' (' + [op, zona].filter(Boolean).join(', ') + ')';
      return 'Cliente' + extra + ': "' + ctx.slice(0, 180) + '"\nMatías: "' + resp.slice(0, 220) + '"';
    })
    .join('\n\n');

  return (
    'APRENDIZAJE (ejemplos reales recientes de conversaciones — imitá el estilo, no copies literal):\n' +
    pares
  );
}

function seleccionarEjemplosGlobales(msgActual, analisis, limite, intencionClasificador) {
  const max = limite || 3;
  const seed = BOT_APRENDIZAJE_SEED || {};
  const ejemplos = Array.isArray(seed.ejemplos) ? seed.ejemplos : [];
  if (!ejemplos.length) return [];

  const msg = normalizarTexto(msgActual);
  const tags = [];
  if (intencionClasificador && typeof tagAprendizajePorIntencion === 'function') {
    tags.push(...tagAprendizajePorIntencion(intencionClasificador));
  }
  if (analisis.intentClarificado === 'posible_confusion_alquiler_usd_alto') {
    tags.push('compra_vs_alquiler');
  }
  if (analisis.operacion === 'compra') tags.push('compra');
  if (/\bvisita|verla|verlo|agendar\b/i.test(msg)) tags.push('visita');
  if (
    /\b(que ten[eé]s|qué ten[eé]s|que hay|algo por|opciones por|cu[aá]nto sale|a cu[aá]nto|mandame|mostrame)\b/i.test(
      msg,
    ) ||
    analisis.presuNum
  ) {
    tags.push('opciones', 'informal');
  }
  if (/\b(caro|car[ií]simo|no me alcanza|muy caro)\b/i.test(msg)) {
    tags.push('objecion_precio');
  }
  if (SALUDOS_VACIOS.test(String(msgActual || '').trim()) && msg.length < 25) {
    tags.push('saludo');
  }
  if (analisis.temasYaCubiertos.some((t) => t.includes('stock'))) tags.push('sin_stock');

  const scored = ejemplos.map((ex) => {
    let score = 0;
    const exTags = Array.isArray(ex.tags) ? ex.tags : [];
    for (const t of tags) {
      if (exTags.includes(t)) score += 3;
    }
    if (analisis.zona && normalizarTexto(ex.zona || '').includes(analisis.zona.split(' ')[0])) {
      score += 2;
    }
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const seen = new Set();
  for (const { ex, score } of scored) {
    if (score <= 0 && picked.length >= 2) continue;
    if (seen.has(ex.id)) continue;
    seen.add(ex.id);
    picked.push(ex);
    if (picked.length >= max) break;
  }
  if (!picked.length) return ejemplos.slice(0, Math.min(max, ejemplos.length));
  return picked;
}

function formatearEjemplosGlobales(ejemplos) {
  if (!Array.isArray(ejemplos) || !ejemplos.length) return '';
  const pares = ejemplos
    .map((ex) => {
      const nota = ex.notas ? ' [' + ex.notas + ']' : '';
      return (
        'Cliente: "' +
        String(ex.contexto_cliente || '').slice(0, 180) +
        '"\nMatías: "' +
        String(ex.respuesta_matias || '').slice(0, 220) +
        '"' +
        nota
      );
    })
    .join('\n\n');
  return (
    'EJEMPLOS DE REFERENCIA (Mendoza — buenas respuestas de asesor):\n' + pares
  );
}

function combinarBloquesAprendizaje(contextoConv, bloqueSheets, bloqueGlobales) {
  const partes = [];
  if (contextoConv && !contextoConv.startsWith('(')) partes.push(contextoConv);
  if (bloqueGlobales) partes.push(bloqueGlobales);
  if (bloqueSheets) partes.push(bloqueSheets);
  if (!partes.length) return '';
  return '\n\n' + partes.join('\n\n') + '\n';
}

function leerFilasAprendizajeWa() {
  try {
    return $('Leer Aprendizaje Matias')
      .all()
      .map((item) => item.json)
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function leerFilasAprendizajeTg() {
  try {
    return $('Leer Aprendizaje Matias TG')
      .all()
      .map((item) => item.json)
      .filter(Boolean);
  } catch (e) {
    return leerFilasAprendizajeWa();
  }
}

function armarBloqueAprendizajePrompt(historialArr, datosPrev, msgActual, canal, intencionClasificador) {
  const analisis = analizarHistorial(historialArr, datosPrev);
  const contextoConv = construirContextoAprendizaje(historialArr, datosPrev, msgActual);
  const rows =
    canal === 'telegram' ? leerFilasAprendizajeTg() : leerFilasAprendizajeWa();
  const bloqueSheets = formatearAprendizajeSheets(rows, 6);
  const globales = seleccionarEjemplosGlobales(msgActual, analisis, 3, intencionClasificador);
  const bloqueGlobales = formatearEjemplosGlobales(globales);
  const bloque = combinarBloquesAprendizaje(contextoConv, bloqueSheets, bloqueGlobales);
  return { bloque, analisis, contextoConv };
}

function leerAprendizajesSheet(nodoNombre) {
  try {
    return filtrarFilasAprendizaje(
      $(nodoNombre)
        .all()
        .map((item) => item.json)
        .filter(Boolean),
    );
  } catch (e) {
    return [];
  }
}

function formatearAprendizajesPrompt(rows, limit) {
  return formatearAprendizajeSheets(rows, limit);
}

function construirPatronAprendizaje(contexto, zona, operacion) {
  return patronAprendizaje(contexto, operacion || zona || 'consulta');
}

function construirFilaAprendizaje(opts) {
  const o = opts || {};
  const msg = String(o.contexto_cliente || o.mensaje || o.mensajeCliente || '').trim();
  const resp = String(o.respuesta_matias || o.respuesta || o.respuestaBot || '').trim();
  if (!msg || !resp) return null;
  return {
    fecha: o.fecha || new Date().toISOString(),
    canal: String(o.canal || 'desconocido'),
    contexto_cliente: msg.slice(0, 500),
    respuesta_matias: resp.slice(0, 800),
    zona: String(o.zona || ''),
    operacion: String(o.operacion || ''),
    presupuesto: String(o.presupuesto || ''),
    temperatura: String(o.temperatura || ''),
    intencion: String(o.intencion || o.intencion_clasificador || ''),
    patron: o.patron || patronAprendizaje(msg, o.intencion_clasificador || o.intencion || o.operacion),
  };
}

function patronAprendizaje(mensaje, intencion) {
  const base = normalizarTexto(mensaje).slice(0, 80);
  const int = normalizarTexto(intencion).slice(0, 40);
  const tag =
    int && /^(pedir_opciones|explorar|consulta_zona|presupuesto|visita|saludo)$/.test(int)
      ? int + '|'
      : '';
  return (tag + base + '|' + int).replace(/\s+/g, ' ').trim();
}

function normalizarOptsAprendizaje(opts) {
  const o = opts || {};
  return {
    mensajeCliente: o.contexto_cliente || o.mensaje || o.mensajeCliente,
    respuestaBot: o.respuesta_matias || o.respuesta || o.respuestaBot,
    canal: o.canal,
    zona: o.zona,
    operacion: o.operacion,
    presupuesto: o.presupuesto,
    temperatura: o.temperatura,
    intencion: o.intencion,
    intencion_clasificador: o.intencion_clasificador,
    lead_completo: o.lead_completo,
    skip_reply: o.skip_reply,
    skipReply: o.skipReply,
    respuesta_forzada: o.respuesta_forzada,
    es_off_topic: o.es_off_topic,
  };
}

function esConsultaUtilParaAprendizaje(msg) {
  const m = String(msg || '').trim();
  if (!m || m.length < 6) return false;
  if (SALUDOS_VACIOS.test(m) && m.length < 20) return false;
  if (extraerPresupuestoUsdDeTexto(m)) return true;
  if (extraerZonaDeTexto(m)) return true;
  if (extraerOperacionDeTexto(m)) return true;
  if (
    /\b(que ten[eé]s|qué ten[eé]s|que hay|cu[aá]nto sale|a cu[aá]nto|mostrame|mostrá|mandame|mandá|visita|agendar|algo en|depto|casa|propiedad|amb|dorm|monoamb|ph\b|terreno|lote|cochera|expensas|cr[eé]dito|hipoteca|escritura|barrio|zona)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  // mensaje sustantivo aunque sea informal ("tengo 80 lucas", "algo tranqui en maipu")
  if (m.length >= 12 && /\b(busco|necesito|quiero|tengo|algo|opcion|opción|ver|mirar)\b/i.test(m)) {
    return true;
  }
  return false;
}

function debeRegistrarAprendizaje(opts) {
  const o = normalizarOptsAprendizaje(opts);
  const msg = String(o.mensajeCliente || '').trim();
  const resp = String(o.respuestaBot || '').trim();

  if (o.skip_reply || o.skipReply) return false;
  if (o.respuesta_forzada || o.es_off_topic) return false;
  if (msg.length < 6 || resp.length < 12) return false;
  if (SALUDOS_VACIOS.test(msg) && msg.length < 20) return false;
  if (/\b(comer|restaurante|herramienta|ferreter)\b/i.test(msg)) return false;

  // No guardar respuestas informales, plantilla robot ni off-topic forzado
  if (typeof respuestaAptaParaAprendizaje === 'function' && !respuestaAptaParaAprendizaje(resp)) {
    return false;
  }

  const temp = String(o.temperatura || '').toLowerCase();
  const tieneDatos = Boolean(o.zona || o.presupuesto || o.operacion);
  const calificado = temp === 'tibio' || temp === 'caliente' || o.lead_completo;
  const consultaUtil = esConsultaUtilParaAprendizaje(msg);
  const respuestaConValor =
    /\b(te paso|mirá|opciones|coordinamos|agendar|USD|dólares|depto|casa|zona|presupuesto|con ese|podemos mirar|ahora mismo)\b/i.test(
      resp,
    );

  // Captura más amplia: cualquier consulta útil + respuesta con valor
  if (consultaUtil && resp.length >= 15 && respuestaConValor) {
    // ok — incluso con temperatura fría
  } else if (!calificado && !tieneDatos && !consultaUtil) {
    return false;
  } else if (!respuestaConValor && resp.length < 25) {
    return false;
  }

  const sd = $getWorkflowStaticData('global');
  if (!sd.aprendizajePatrones) sd.aprendizajePatrones = {};
  const patron = patronAprendizaje(msg, o.intencion_clasificador || o.intencion || '');
  const prev = sd.aprendizajePatrones[patron];
  if (prev && esSimilar(prev, resp, 0.78)) return false;
  sd.aprendizajePatrones[patron] = resp;

  const keys = Object.keys(sd.aprendizajePatrones);
  if (keys.length > 200) {
    for (const k of keys.slice(0, keys.length - 150)) delete sd.aprendizajePatrones[k];
  }

  return true;
}

function prepararRegistroAprendizaje(opts) {
  const norm = normalizarOptsAprendizaje(opts);
  const o = opts || {};
  // Completar zona/operacion/temperatura desde análisis si faltan
  if (!norm.zona && o.mensajeCliente) {
    norm.zona = norm.zona || extraerZonaDeTexto(o.mensajeCliente);
  }
  if (!norm.operacion && o.mensajeCliente) {
    norm.operacion = norm.operacion || extraerOperacionDeTexto(o.mensajeCliente);
  }
  if (!norm.presupuesto && o.mensajeCliente) {
    const p = extraerPresupuestoUsdDeTexto(o.mensajeCliente);
    if (p) norm.presupuesto = 'USD ' + p;
  }

  const registrar = debeRegistrarAprendizaje(norm);
  if (!registrar) {
    return { registrar_aprendizaje: false };
  }

  const fila = construirFilaAprendizaje({ ...opts, ...norm });
  if (!fila) return { registrar_aprendizaje: false };

  return {
    registrar_aprendizaje: true,
    aprendizaje_fecha: fila.fecha,
    aprendizaje_canal: fila.canal,
    aprendizaje_contexto_cliente: fila.contexto_cliente,
    aprendizaje_respuesta_matias: fila.respuesta_matias,
    aprendizaje_zona: fila.zona,
    aprendizaje_operacion: fila.operacion,
    aprendizaje_presupuesto: fila.presupuesto,
    aprendizaje_temperatura: fila.temperatura,
    aprendizaje_intencion: fila.intencion,
    aprendizaje_patron: fila.patron,
  };
}

function metaTurnoAprendizaje(opts) {
  const o = opts || {};
  const meta = {
    intent_detected: String(o.intencion_clasificador || o.intencion || o.operacion || ''),
    objeciones: Array.isArray(o.objeciones) ? o.objeciones : [],
    lead_completo: Boolean(o.lead_completo),
    temperatura: String(o.temperatura || ''),
  };
  if (o.zona) meta.zona = String(o.zona);
  if (o.operacion) meta.operacion = String(o.operacion);
  if (o.presupuesto) meta.presupuesto = String(o.presupuesto);
  return meta;
}

function enriquecerEntradaHistorial(entry, meta) {
  const e = entry || {};
  if (!meta || !Object.keys(meta).length) return e;
  const out = { ...e };
  const clean = {};
  if (meta.intent_detected) clean.intent_detected = meta.intent_detected;
  if (meta.objeciones && meta.objeciones.length) clean.objeciones = meta.objeciones;
  if (meta.lead_completo) clean.lead_completo = true;
  if (meta.temperatura) clean.temperatura = meta.temperatura;
  if (meta.zona) clean.zona = meta.zona;
  if (meta.operacion) clean.operacion = meta.operacion;
  if (meta.presupuesto) clean.presupuesto = meta.presupuesto;
  if (Object.keys(clean).length) out.meta = clean;
  return out;
}
