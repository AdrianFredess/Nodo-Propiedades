/**
 * Helpers compartidos WA/TG — voz humana, puntuación, anti-repetición.
 * Se concatena al inicio de wa-procesar-ia.js y tg-parsear-respuesta.js vía patch scripts.
 */

function sanitizarPuntuacion(texto) {
  let t = String(texto || '').trim();
  if (!t) return t;
  t = t.replace(/¿/g, '');
  t = t.replace(/…/g, '');
  t = t.replace(/\.{3,}/g, '');
  t = t.replace(/\.{2}/g, '.');
  t = t.replace(/!+/g, '');
  t = t.replace(/\.\s*$/g, '');
  t = t.replace(/\s+([,?])/g, '$1');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

function formatearPresuMil(presuNum) {
  const n = Number(presuNum) || 0;
  return n >= 1000 ? Math.round(n / 1000) + ' mil' : String(n || '');
}

function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similitudTexto(a, b) {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wa = na.split(' ').filter((w) => w.length > 2);
  const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!wa.length || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.length, wb.size);
}

function esSimilar(a, b, umbral) {
  return similitudTexto(a, b) >= (umbral || 0.68);
}

function parseHistorialArr(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function obtenerMensajesBot(historialArr) {
  if (!Array.isArray(historialArr)) return [];
  return historialArr
    .filter((m) => {
      const role = String((m && m.role) || '').toLowerCase();
      return role === 'assistant' || role === 'bot';
    })
    .map((m) => String((m && m.content) || '').trim())
    .filter(Boolean);
}

function obtenerMensajesUsuario(historialArr) {
  if (!Array.isArray(historialArr)) return [];
  return historialArr
    .filter((m) => {
      const role = String((m && m.role) || '').toLowerCase();
      return role === 'user' || role === 'cliente';
    })
    .map((m) => String((m && m.content) || '').trim())
    .filter(Boolean);
}

function esConsultaRepetida(mensaje, historialArr) {
  const actual = String(mensaje || '').trim();
  if (!actual) return false;
  const prev = obtenerMensajesUsuario(historialArr);
  if (!prev.length) return false;
  return prev.slice(-4).some((p) => esSimilar(actual, p, 0.62));
}

function contarBotsSimilares(texto, historialArr) {
  const bots = obtenerMensajesBot(historialArr);
  return bots.filter((b) => esSimilar(texto, b, 0.55)).length;
}

function armarMensajeAlquilerVsCompra(presuNum, zona, variantIdx) {
  const mil = formatearPresuMil(presuNum);
  const zonaBit = zona && zona !== '(no indicó)' ? ' en ' + zona : '';
  const v = Number(variantIdx) || 0;
  const variantes = [
    'Con ' +
      mil +
      ' dólares podemos mirar opciones de compra' +
      zonaBit +
      '. Buscás comprar o alquilar? Si es alquiler, el presupuesto mensual suele expresarse en pesos; contame un poco más y te oriento',
    'Ya lo hablamos: con ese monto en dólares lo usual' +
      zonaBit +
      ' es compra. Si buscás alquiler, pasame el tope mensual en pesos y vemos qué hay',
    'Para no marearte, ' +
      mil +
      ' USD' +
      zonaBit +
      ' entra en compra. Querés que te muestre opciones o preferís alquiler en pesos?',
  ];
  return sanitizarPuntuacion(variantes[v % variantes.length]);
}

function humanizarVoz(texto) {
  let t = String(texto || '').trim();
  t = t.replace(/^¡?\s*hey[!,.]?\s*/i, '');
  t = t.replace(/^¡+/g, '');
  t = t.replace(/\bUf\b[,.]*\s*/gi, '');
  t = t.replace(/\bno me cierra\b[^.?!]*/gi, '');
  t = t.replace(
    /\b(?:entiendo tu consulta|quedo atento|estoy a tu disposici[oó]n|qued[oó] a tu disposici[oó]n|a tu disposici[oó]n|mi especialidad es[^.!?]*)\b/gi,
    '',
  );
  t = t.replace(/\bperfecto[,!]?\s+/gi, '');
  t = t.replace(/\bte escribo cuando\b[^.!?]*/gi, '');
  t = t.replace(
    /\b(con gusto (estoy|quedo) para ayudarte|cualquier cosa que necesites,? estoy ac[aá])\b/gi,
    '',
  );
  t = t.replace(
    /\b(?:te contacta|se pone en contacto) un asesor\b[^.?!]*/gi,
    'te escribo yo',
  );
  t = t.replace(
    /\¿?\s*Te gustar[ií]a que un asesor(?: de Nodo Propiedades)? te contacte[^.!?]*[.!?]?\s*/gi,
    '',
  );
  t = t.replace(
    /\b(?:cuando haya opciones que )?encaj(?:en|an) con tu b[uú]squeda\b[^.!?]*/gi,
    '',
  );
  t = t.replace(
    /\b(?:para poder ayudarte|ayudarte mejor|me gustar[ií]a saber|ser[ií]a ideal si)\b[^.!?]*/gi,
    '',
  );
  t = t.replace(
    /\b(?:no tengo inmuebles|no hay inmuebles) disponibles(?: en este momento)?\b/gi,
    'ahora mismo no tengo nada con ese pedido',
  );
  t = t.replace(
    /\bno tengo inmuebles disponibles en este momento\b/gi,
    'ahora mismo no tengo nada con ese pedido',
  );
  t = t.replace(
    /\bun asesor(?: de Nodo Propiedades)? (?:te |se ponga en )?contact/gi,
    'te escribo yo',
  );
  t = t.replace(
    /\b(quedo a las [oó]rdenes|recibido|confirmado|procedo a|a sus [oó]rdenes)\b/gi,
    '',
  );
  t = t.replace(/\b[Cc]he\b[,.;:!?]*\s*/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^[,.\s]+/, '').trim();
  return sanitizarPuntuacion(t);
}

function suenaPlantillaRobot(texto) {
  return /\b(te gustar[ií]a que un asesor|estoy a tu disposici[oó]n|quedo atento|entiendo tu consulta|mi especialidad es|encaj(?:en|an) con tu b[uú]squeda|no tengo inmuebles disponibles en este momento|se ponga en contacto con vos|te contacta un asesor|quedo a las [oó]rdenes)\b/i.test(
    String(texto || ''),
  );
}

function reescribirSiRobot(texto, zona, presupuesto, variantIdx) {
  const t = String(texto || '');
  if (!suenaPlantillaRobot(t) && !/\bun asesor de Nodo\b/i.test(t)) {
    return humanizarVoz(t);
  }
  const presuNum = presupuesto ? Number(presupuesto) : 0;
  const zonaBit = zona && zona !== '(no indicó)' ? zona : zona || '';
  if (/\balquil/i.test(t) && presuNum >= 15000) {
    return armarMensajeAlquilerVsCompra(presuNum, zonaBit, variantIdx || 0);
  }
  if (/\bno tengo|sin (opciones|stock|disponib)|no (hay|encuentro)/i.test(t)) {
    const zb = zonaBit ? ' en ' + zonaBit : '';
    const sinStock = [
      'Ahora mismo no tengo nada' + zb + ' con ese tope, aflojamos un poco el presupuesto o miramos otra zona?',
      'Con ese tope' + zb + ' no me queda stock hoy, probamos otra zona o ajustamos el presupuesto?',
    ];
    return sanitizarPuntuacion(sinStock[(variantIdx || 0) % sinStock.length]);
  }
  return humanizarVoz(t);
}

function evitarRepeticion(respuesta, opts) {
  const o = opts || {};
  let out = String(respuesta || '').trim();
  if (!out) return out;

  const historialArr = parseHistorialArr(o.historialArr || o.historial_json_prev);
  const bots = obtenerMensajesBot(historialArr);
  const ultimoBot = bots.length ? bots[bots.length - 1] : '';
  const consultaRep = esConsultaRepetida(o.mensajeUsuario, historialArr);
  const respuestaRep =
    (ultimoBot && esSimilar(out, ultimoBot, 0.68)) ||
    bots.slice(-3).some((b) => esSimilar(out, b, 0.72));
  const repCount = contarBotsSimilares(out, historialArr);

  if (!respuestaRep && !consultaRep) return out;

  const idxVarHumano = Math.max(repCount, consultaRep ? 1 : 0, bots.length % 3);

  // Si hay que mostrar stock, no reescribas: el post-proceso manda fichas.
  if (o.forzarStock) {
    return out;
  }

  if (o.esAlquilerPresupuestoAlto) {
    return armarMensajeAlquilerVsCompra(
      o.presupuestoDetectado,
      o.zonaDetectada,
      idxVarHumano,
    );
  }

  if (consultaRep && ultimoBot && esSimilar(out, ultimoBot, 0.5)) {
    const reconocimientos = [
      'Como te decía, ',
      'Retomando, ',
      'Sin repetir todo, ',
    ];
    const pref = reconocimientos[idxVarHumano % reconocimientos.length];
    const cuerpo = out.charAt(0).toLowerCase() + out.slice(1);
    return sanitizarPuntuacion(pref + cuerpo);
  }

  if (respuestaRep) {
    return reescribirSiRobot(out, o.zonaDetectada, o.presupuestoDetectado, idxVarHumano);
  }

  return out;
}

function quitarMuletillaChe(texto) {
  if (!texto || typeof texto !== 'string') return texto;
  return sanitizarPuntuacion(
    texto.replace(/\b[Cc]he\b[,.;:!?]*\s*/g, '').replace(/\s{2,}/g, ' ').trim(),
  );
}

/** Respuesta del bot demasiado informal/slang para guardar como ejemplo de Matías */
function respuestaInformalExcesiva(texto) {
  const t = String(texto || '').toLowerCase();
  if (!t) return true;
  if (/\b(che|boludo|boluda|loco|loca|pibe|mina|re\s+\w+|posta|al toque|zarpado)\b/i.test(t)) {
    return true;
  }
  if (/\b(jajaja|jaja|xd|lol)\b/i.test(t) && t.length < 80) return true;
  return false;
}

/** ¿Sirve como ejemplo de aprendizaje? (profesional-cercano, no plantilla robot) */
function respuestaAptaParaAprendizaje(texto) {
  const t = String(texto || '').trim();
  if (!t || t.length < 15) return false;
  if (respuestaInformalExcesiva(t)) return false;
  if (suenaPlantillaRobot(t)) return false;
  if (/\b(solo trabajo con propiedades|no puedo ayudarte con eso)\b/i.test(t) && t.length < 60) {
    return false;
  }
  return true;
}
