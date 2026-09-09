/**
 * Scoring dinámico de temperatura de lead (frío / tibio / caliente).
 * Se concatena vía patch scripts antes de wa-procesar-ia / tg-parsear-respuesta.
 *
 * Señales (peso):
 * 1. Financiación (más fuerte): credito_preaprobado | fondos_propios | no_definido
 * 2. Urgencia: inmediato | 1-3m | 3-6m | +6m | indefinido
 * 3. Presupuesto: horquilla vs sin definir
 * 4. Zona: concreta vs amplia
 * 5. Tipo de propiedad + si es el decisor
 *
 * CALIENTE = financiación clara + urgencia <3m + (zona concreta O tipo concreto)
 * TIBIO = ≥1 señal fuerte, sin alcanzar caliente (solo tras intercambios con intención)
 * FRÍO = sin señales fuertes tras esos intercambios
 */

const LT_CIERRE_CALIENTE =
  'Dale, con esto ya puedo avanzar. Te armo visita o preferis que te llame?';

/** Cierres comerciales cortos (tibio / post-fichas). Asesor Mendoza, sin chatbot. */
const LT_CIERRES_COMERCIALES = [
  'Cual de estas te cierra mas?',
  'Si queres te cuento mas de alguna',
  'Decime cual te interesa y vemos visita',
  'Si queres te armo visita a la que mas te cierre',
  'Cual miramos primero?',
];

function cierreComercialHumano(idx) {
  const opts = LT_CIERRES_COMERCIALES;
  const i = Math.abs(Number(idx) || 0) % opts.length;
  const raw = opts[i];
  return typeof sanitizarPuntuacion === 'function'
    ? sanitizarPuntuacion(raw)
    : raw;
}

/** @deprecated usar cierreComercialHumano — se mantiene por compat */
const LT_CIERRE_TIBIO = LT_CIERRES_COMERCIALES[0];

const LT_FINAN_CLARA = new Set(['credito_preaprobado', 'fondos_propios']);
const LT_URGENCIA_CORTA = new Set(['inmediato', '1-3m']);

function ltNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function ltTextoCorpus(historialArr, mensajeActual, extras) {
  const parts = [];
  if (Array.isArray(historialArr)) {
    for (const m of historialArr) {
      if (!m || typeof m !== 'object') continue;
      const role = String(m.role || '').toLowerCase();
      if (role && role !== 'user' && role !== 'cliente') continue;
      const c = String(m.content || m.text || '').trim();
      if (c) parts.push(c);
    }
  }
  if (mensajeActual) parts.push(String(mensajeActual));
  if (extras) {
    for (const v of Object.values(extras)) {
      if (v != null && String(v).trim()) parts.push(String(v));
    }
  }
  return parts.join('\n');
}

function ltContarMensajesUsuario(historialArr, mensajeActual) {
  let n = 0;
  if (Array.isArray(historialArr)) {
    for (const m of historialArr) {
      if (!m || typeof m !== 'object') continue;
      const role = String(m.role || '').toLowerCase();
      if (role === 'user' || role === 'cliente') n += 1;
    }
  }
  if (mensajeActual && String(mensajeActual).trim()) n += 1;
  return n;
}

function ltEsSaludoOGenerico(texto) {
  const t = ltNorm(texto);
  if (!t) return true;
  if (t.length > 80) return false;
  const generico =
    /^(hola|buen[oa]s?( dias?| tardes?| noches?)?|que tal|como estas?s?|hey|hi|hello)([!.\s]*)?$/i.test(
      t,
    ) ||
    /^(hola[,!]?\s*)?(como estas?s?|que tal|todo bien)([!.\s]*)?$/i.test(t) ||
    /^(hola[,!]?\s*)?(que tenes|que hay|que venden|mostrame algo|mandame algo|a ver)([!.\s]*)?$/i.test(
      t,
    );
  const conIntencion =
    /\b(presupuesto|usd|dolar|credito|contado|fondos|urgente|inmediato|mes|meses|semana|godoy|guaymallen|capital|lujan|maipu|depto|departamento|casa|lote|dormitor|ambiente|visita|comprar|alquiler)\b/i.test(
      t,
    );
  return generico && !conIntencion;
}

function ltTieneIntencionReal(texto) {
  const t = ltNorm(texto);
  if (!t || ltEsSaludoOGenerico(t)) return false;
  return /\b(presupuesto|usd|u\$s|\d+\s*mil|\d{4,7}|credito|pre.?aprob|contado|fondos|efectivo|urgente|inmediato|esta semana|este mes|en \d|meses?|godoy cruz|guaymallen|capital|lujan|maipu|las heras|san martin|depto|departamento|casa|ph|lote|local|dormitor|ambiente|visita|agendar|comprar|compra|alquiler|vendo|busco|necesito)\b/i.test(
    t,
  );
}

/**
 * No clasificar tibio/caliente en el primer mensaje genérico.
 * Se habilita con ≥2 mensajes de usuario O ≥1 mensaje con intención real
 * (además de no ser solo el primer saludo genérico).
 */
function ltPuedeClasificar(historialArr, mensajeActual) {
  const userMsgs = ltContarMensajesUsuario(historialArr, null);
  const actual = String(mensajeActual || '').trim();
  const totalConActual = userMsgs + (actual ? 1 : 0);

  if (totalConActual <= 1 && ltEsSaludoOGenerico(actual)) {
    return false;
  }

  let intencionEnHist = 0;
  if (Array.isArray(historialArr)) {
    for (const m of historialArr) {
      if (!m || typeof m !== 'object') continue;
      const role = String(m.role || '').toLowerCase();
      if (role !== 'user' && role !== 'cliente') continue;
      if (ltTieneIntencionReal(m.content || m.text || '')) intencionEnHist += 1;
    }
  }
  if (actual && ltTieneIntencionReal(actual)) intencionEnHist += 1;

  if (intencionEnHist >= 1 && totalConActual >= 2) return true;
  if (intencionEnHist >= 2) return true;
  if (totalConActual >= 2 && ltTieneIntencionReal(actual)) return true;
  return false;
}

function ltDetectarFinanciacion(texto, hint) {
  const h = ltNorm(hint);
  if (LT_FINAN_CLARA.has(h)) return h;
  if (h === 'no_definido' || h === 'indefinido') return 'no_definido';
  const t = ltNorm(texto);
  if (
    /\b(credito\s*pre.?aprob|pre.?aprobad[oa]|ya tengo el credito|credito aprobado)\b/.test(t)
  ) {
    return 'credito_preaprobado';
  }
  if (
    /\b(fondos propios|plata propia|contado|cash|efectivo|sin credito|pago de contado|tengo la plata)\b/.test(
      t,
    )
  ) {
    return 'fondos_propios';
  }
  if (/\b(credito|hipotec|banco|cuotas?)\b/.test(t)) return 'no_definido';
  return h || 'no_definido';
}

function ltDetectarUrgencia(texto, hint) {
  const h = ltNorm(hint).replace(/\s+/g, '');
  if (LT_URGENCIA_CORTA.has(h) || h === '3-6m' || h === '+6m' || h === 'indefinido') {
    return h === 'indefinido' ? 'indefinido' : h;
  }
  const t = ltNorm(texto);
  if (
    /\b(ya|ahora|urgente|inmediato|esta semana|lo antes posible|cuanto antes|ya mismo|ya la necesito)\b/.test(
      t,
    )
  ) {
    return 'inmediato';
  }
  if (
    /\b(en (1|2|un|dos|tres) mes(es)?|dentro de (1|2|3) mes|1-3|para este mes|este mes|el mes que viene|en unas semanas)\b/.test(
      t,
    )
  ) {
    return '1-3m';
  }
  if (/\b(3\s*a\s*6|3-6|en (4|5|6) mes)/.test(t)) return '3-6m';
  if (/\b(mas de 6|en (7|8|9|10|12) mes|\+6|el ano que viene|el anio que viene)\b/.test(t)) {
    return '+6m';
  }
  if (/\b(sin apuro|no hay apuro|mas adelante|cuando sea|todavia no se|indefinid)\b/.test(t)) {
    return 'indefinido';
  }
  return h || 'indefinido';
}

function ltZonaConcreta(zona, texto) {
  const z = ltNorm(zona);
  const zonas =
    typeof IC_ZONAS !== 'undefined'
      ? IC_ZONAS
      : [
          'godoy cruz',
          'guaymallen',
          'capital',
          'lujan',
          'maipu',
          'las heras',
          'san martin',
        ];
  if (z) {
    if (/mendoza|toda|cualquiera|ampli|indistinto|no se|nose/.test(z) && z.length < 20) {
      // "mendoza" solo = amplia
      if (z === 'mendoza') return false;
    }
    for (const nombre of zonas) {
      if (z.includes(ltNorm(nombre)) && ltNorm(nombre) !== 'mendoza') return true;
    }
    if (z.length >= 4 && !/ampli|cualquiera|indistinto/.test(z)) return true;
  }
  const t = ltNorm(texto);
  for (const nombre of zonas) {
    const n = ltNorm(nombre);
    if (n !== 'mendoza' && t.includes(n)) return true;
  }
  return false;
}

function ltTipoConcreto(tipo, texto) {
  const tip = ltNorm(tipo);
  if (/\b(depto|departamento|casa|ph|lote|local|oficina|duplex|monoambiente)\b/.test(tip)) {
    return true;
  }
  const t = ltNorm(texto);
  return /\b(depto|departamento|casa|ph|lote|local|oficina|duplex|monoambiente)\b/.test(t);
}

function ltPresupuestoDefinido(presupuesto, texto) {
  const p = String(presupuesto || '').trim();
  if (p && /\d/.test(p)) return true;
  if (typeof icExtraerPresupuestoUsd === 'function') {
    if (icExtraerPresupuestoUsd(texto)) return true;
  }
  return /\b(\d{2,3}\s*mil|\d{4,7}\s*(usd|u\$s)?|usd\s*\d{4,7})\b/i.test(String(texto || ''));
}

function ltEsDecisor(texto, hint) {
  if (hint === true || String(hint).toLowerCase() === 'si' || String(hint) === 'true') {
    return true;
  }
  if (hint === false || String(hint).toLowerCase() === 'no') return false;
  const t = ltNorm(texto);
  if (/\b(decido yo|yo decido|soy el comprador|compro yo|es para mi|para nosotros)\b/.test(t)) {
    return true;
  }
  if (/\b(consulto con|tengo que hablar|mi pareja|mi esposa|mi marido|no decido solo)\b/.test(t)) {
    return false;
  }
  return null;
}

function ltExtraerSenales(opts) {
  const o = opts || {};
  const corpus = ltTextoCorpus(o.historialArr, o.mensajeActual, {
    zona: o.zona,
    presupuesto: o.presupuesto,
    tipo: o.tipo_propiedad,
    financiacion: o.financiacion,
    urgencia: o.urgencia,
  });

  const financiacion = ltDetectarFinanciacion(corpus, o.financiacion);
  const urgencia = ltDetectarUrgencia(corpus, o.urgencia);
  const zonaConcreta = Boolean(o.zona_concreta) || ltZonaConcreta(o.zona, corpus);
  const tipoConcreto = Boolean(o.tipo_concreto) || ltTipoConcreto(o.tipo_propiedad, corpus);
  const presupuestoOk = ltPresupuestoDefinido(o.presupuesto, corpus);
  const esDecisor = ltEsDecisor(corpus, o.es_decisor);

  return {
    financiacion,
    urgencia,
    zona_concreta: zonaConcreta,
    tipo_concreto: tipoConcreto,
    presupuesto_definido: presupuestoOk,
    es_decisor: esDecisor,
    zona: String(o.zona || '').trim(),
    tipo_propiedad: String(o.tipo_propiedad || '').trim(),
    presupuesto: String(o.presupuesto || '').trim(),
  };
}

function ltSenalesFuertes(senales) {
  const s = senales || {};
  const out = [];
  if (LT_FINAN_CLARA.has(String(s.financiacion || ''))) out.push('financiacion');
  if (LT_URGENCIA_CORTA.has(String(s.urgencia || ''))) out.push('urgencia');
  if (s.presupuesto_definido) out.push('presupuesto');
  if (s.zona_concreta) out.push('zona');
  if (s.tipo_concreto && s.es_decisor !== false) out.push('tipo_decisor');
  return out;
}

function ltEsCaliente(senales) {
  const s = senales || {};
  const finClara = LT_FINAN_CLARA.has(String(s.financiacion || ''));
  const urgOk = LT_URGENCIA_CORTA.has(String(s.urgencia || ''));
  const ancla = Boolean(s.zona_concreta) || Boolean(s.tipo_concreto);
  return finClara && urgOk && ancla;
}

/**
 * Recalcula temperatura en cada mensaje.
 * @returns {{
 *   temperatura: 'frio'|'tibio'|'caliente',
 *   puede_clasificar: boolean,
 *   bot_paused: boolean,
 *   handoff: boolean,
 *   estado_seguimiento: string,
 *   senales: object,
 *   senales_fuertes: string[],
 *   cierre_forzado: string,
 *   notif_resumen: string,
 *   motivo: string
 * }}
 */
function calcularTemperaturaLead(opts) {
  const o = opts || {};
  const puede = ltPuedeClasificar(o.historialArr, o.mensajeActual);
  const senales = ltExtraerSenales(o);
  const fuertes = ltSenalesFuertes(senales);

  let temperatura = 'frio';
  let motivo = 'sin_senales';

  if (!puede) {
    temperatura = 'frio';
    motivo = 'temprano_sin_clasificar';
  } else if (ltEsCaliente(senales)) {
    temperatura = 'caliente';
    motivo = 'financiacion_urgencia_ancla';
  } else if (fuertes.length >= 1) {
    temperatura = 'tibio';
    motivo = 'senal_fuerte:' + fuertes.join(',');
  } else {
    temperatura = 'frio';
    motivo = 'sin_senales_fuertes';
  }

  const esCaliente = temperatura === 'caliente';
  const esTibio = temperatura === 'tibio';

  const resumenSenales =
    'Financiación: ' +
    (senales.financiacion || 'no_definido') +
    '\nUrgencia: ' +
    (senales.urgencia || 'indefinido') +
    '\nPresupuesto: ' +
    (senales.presupuesto_definido ? senales.presupuesto || 'definido' : 'sin definir') +
    '\nZona: ' +
    (senales.zona_concreta ? senales.zona || 'concreta' : 'amplia/sin definir') +
    '\nTipo+decisor: ' +
    (senales.tipo_concreto ? senales.tipo_propiedad || 'tipo ok' : 'sin tipo') +
    (senales.es_decisor === false ? ' (no decisor)' : '');

  return {
    temperatura,
    puede_clasificar: puede,
    bot_paused: esCaliente,
    handoff: esCaliente || esTibio,
    estado_seguimiento: esCaliente ? 'respondido' : 'ninguno',
    senales,
    senales_fuertes: fuertes,
    cierre_forzado: esCaliente
      ? LT_CIERRE_CALIENTE
      : esTibio
        ? cierreComercialHumano(String(o.mensajeActual || '').length)
        : '',
    notif_resumen: resumenSenales,
    motivo,
  };
}

function ltBotYaPausado(row) {
  const r = row || {};
  // Solo bot_paused / caliente silencian al bot.
  // handoff=si también se marca en tibio (alerta asesor) y NO debe cortar respuestas.
  const paused = String(r.bot_paused || '')
    .trim()
    .toLowerCase();
  if (/^(si|true|1|paused|caliente)$/.test(paused)) return true;
  const temp = String(r.temperature || r.temperatura || '')
    .trim()
    .toLowerCase();
  return temp === 'caliente';
}

function ltFormatearNotif(meta) {
  const m = meta || {};
  return (
    'URGENTE LEAD CALIENTE\n' +
    'Nombre: ' +
    (m.nombre || '') +
    '\nTel/Chat: ' +
    (m.chat_id || m.phone || '') +
    '\nCanal: ' +
    (m.canal || '') +
    '\n--- Señales ---\n' +
    (m.notif_resumen || '') +
    (m.mensaje ? '\nÚltimo mensaje: ' + m.mensaje : '')
  );
}
