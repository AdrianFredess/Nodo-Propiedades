/**
 * Helpers compartidos WA/TG — voz humana, puntuación, anti-repetición.
 * Se concatena al inicio de wa-procesar-ia.js y tg-parsear-respuesta.js vía patch scripts.
 */

/**
 * Strip agresivo de tildes en copy outbound (TG/WA).
 * Conserva ñ/Ñ. Todo lo demas (áéíóúü) sale sin tilde.
 */
function aflojarTildesConversacional(texto) {
  return String(texto || '')
    .replace(/ñ/g, '\u0001')
    .replace(/Ñ/g, '\u0002')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/\u0002/g, 'Ñ');
}

function sanitizarPuntuacion(texto) {
  let t = String(texto || '').trim();
  if (!t) return t;
  t = t.replace(/¿/g, '');
  t = t.replace(/¡/g, '');
  t = t.replace(/…/g, '');
  t = t.replace(/\.{3,}/g, '');
  t = t.replace(/\.{2}/g, '.');
  t = t.replace(/!+/g, '');
  t = t.replace(/\.\s*$/g, '');
  // Bug "Hola]": corchetes sueltos de JSON/markdown mal cortado
  t = t.replace(/[\[\]]+/g, '');
  // Menos comas “de libro”: colapsar dobles y quitar coma antes de y/o
  t = t.replace(/,{2,}/g, ',');
  t = t.replace(/,\s+(y|o)\b/gi, ' $1');
  t = t.replace(/\s+([,?])/g, '$1');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = aflojarTildesConversacional(t);
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
  // Solo plantilla LARGA vieja (Soy Matias + cuando necesites/quieras).
  // NO borrar el saludo corto de presentación: "soy Matias de Nodo Propiedades. En que puedo..."
  t = t.replace(
    /\bSoy Mat[ií]as(?: de Nodo Propiedades)?[.!]?\s*Cuando (?:necesites|quieras|lo necesites)[^.!?]*/gi,
    '',
  );
  t = t.replace(
    /\b(?:cuando necesites|cuando quieras|cuando lo necesites|cualquier cosa que necesites|estoy para ayudarte|quedo a tu disposici[oó]n|estoy a tu disposici[oó]n|a tu disposici[oó]n|quedo atento|entiendo tu consulta|con gusto te ayudo|mi especialidad es[^.!?]*)\b[^.!?]*/gi,
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
  // Spec §4 — ban/reemplazo (sin reintroducir frases prohibidas)
  t = t.replace(/\bmatche(?:en|ar|a|an|ando)?\b/gi, 'que se ajusten');
  t = t.replace(
    /\bTe dejo estas opciones\.?\s*(En unos d[ií]as te escribo[^.!?]*)?/gi,
    '',
  );
  t = t.replace(
    /\bEn unos d[ií]as te escribo(?: con m[aá]s(?: opciones)?(?: que (?:se ajusten|matcheen))?(?: a lo que busc[aá]s)?)?[^.!?]*/gi,
    'Seguis mirando o ya definiste?',
  );
  t = t.replace(
    /\bcon m[aá]s(?: opciones)? que se ajusten(?: a lo que busc[aá]s)?\b/gi,
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
  // Cierres chatbot / catalogo generico → tono asesor Mendoza
  t = t.replace(
    /\bAlguna(?:s)? de estas te llama(?:n)?(?: mas| más)?(?: la atenci[oó]n)?\s*\??/gi,
    'Cual de estas te cierra mas?',
  );
  t = t.replace(
    /\b(?:Cual|Cuál|Que|Qué) (?:de estas )?(?:te )?(?:llama(?: mas| más)?(?: la atenci[oó]n)?|llama la atenci[oó]n)\s*\??/gi,
    'Cual de estas te cierra mas?',
  );
  t = t.replace(
    /\bte llama(?:n)?(?: mas| más)?(?: la atenci[oó]n)?\s*\??/gi,
    'te cierra mas?',
  );
  t = t.replace(
    /\b(?:cual|cuál) te llama m[aá]s(?: la atenci[oó]n)?\s*\??/gi,
    'Cual de estas te cierra mas?',
  );
  // Ban absoluto frases robot / catalogo
  t = t.replace(/^[¡!]*\s*Claro[!.,]*\s*/gi, '');
  t = t.replace(/\b¡?\s*Claro!\s*/gi, '');
  t = t.replace(
    /\bAc[aá] te muestro(?: un par)?(?: de opciones)?(?: que tenemos(?: disponibles)?)?/gi,
    'Mira estas',
  );
  t = t.replace(
    /\b(?:te muestro|te presento)\s+(?:un par de\s+)?opciones(?: que tenemos(?: disponibles)?)?/gi,
    'Mira estas',
  );
  t = t.replace(
    /\bun par de opciones que tenemos(?: disponibles)?/gi,
    'estas',
  );
  t = t.replace(
    /\bopciones que tenemos(?: disponibles)?/gi,
    'estas',
  );
  // Spec §3.5 — muletillas: ELIMINAR sin sustituir por sinónimo
  t = t.replace(/\bun par de\b/gi, '');
  t = t.replace(/\bun par\b/gi, '');
  t = t.replace(/\bdigamos\b[,.]?\s*/gi, '');
  t = t.replace(/\bo sea\b[,.]?\s*/gi, '');
  t = t.replace(/\bonda\b[,.]?\s*/gi, '');
  t = t.replace(/\bviste\b[,.]?\s*/gi, '');
  t = t.replace(/\bas[ií] que bueno\b[,.]?\s*/gi, '');
  // "tipo" solo como muletilla (tipo, ...) no "tipo depto/casa"
  t = t.replace(/\btipo\s*,/gi, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^[,.\s]+/, '').trim();
  // Strip tildes outbound — NUNCA reintroducir tildes "correctas"
  return sanitizarPuntuacion(t);
}

function suenaPlantillaRobot(texto) {
  return /\b(te gustar[ií]a que un asesor|estoy a tu disposici[oó]n|quedo atento|entiendo tu consulta|mi especialidad es|encaj(?:en|an) con tu b[uú]squeda|no tengo inmuebles disponibles en este momento|se ponga en contacto con vos|te contacta un asesor|quedo a las [oó]rdenes|cuando necesites|cuando quieras contame|estoy para ayudarte|Soy Mat[ií]as de Nodo Propiedades\.?\s*Cuando|Te dejo estas opciones|en unos d[ií]as te escribo|matche(?:en|ar)|alguna de estas te llama|te llama(?:n)?(?: mas| más)?(?: la atenci[oó]n)?|llama la atenci[oó]n|ac[aá] te muestro|un par de opciones que tenemos|¡?\s*claro!|cualquier cosa avisame|cualquier cosa av[ií]same|quedo a tu disposici[oó]n)\b/i.test(
    String(texto || ''),
  );
}

/** Pregunta early-turn: tiene algo pensado vs quiere opciones. */
function preguntaAlgoPensado(idx) {
  const opts = [
    'Buena. Si queres te mando opciones para orientar, o preferis zona?',
    'Depto. Tenes zona en mente o te paso opciones?',
    'Tenes zona o presupuesto en mente, o te mando opciones?',
  ];
  const i = Math.abs(Number(idx) || 0) % opts.length;
  return sanitizarPuntuacion(opts[i]);
}

/** Intro corta ante fichas: reacciona al mensaje del cliente, no plantilla de catálogo. */
function introFichasHumana(opts) {
  const o = opts || {};
  const v = Math.abs(Number(o.variantIdx) || 0);
  const msg = String(o.textoUsuario || o.mensaje || '').trim();
  const zona = String(o.zona || '').trim();
  const curioso = Boolean(o.curioso);
  const n = msg
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/mostrame|pasame|mandame|opciones|que tenes|que hay|a ver|enviame|lo que tengas/.test(n)) {
    const optsMsg = [
      'Mira, estas te pueden cerrar',
      'Te mando estas para que veas',
      'Ahi van estas que pegan con lo que pediste',
    ];
    return sanitizarPuntuacion(optsMsg[v % optsMsg.length]);
  }
  if (zona || /\b(godoy|capital|maipu|guaymall|lujan|las heras|mendoza)\b/.test(n)) {
    const z = zona || 'esa zona';
    const optsZ = [
      'En ' + z + ' mira estas',
      'Para ' + z + ' mira estas',
      'Mira estas de ' + z,
    ];
    return sanitizarPuntuacion(optsZ[v % optsZ.length]);
  }
  if (/\b(\d+\s*mil|\d{4,}|usd|presupuesto|tope)\b/.test(n) || o.presupuesto) {
    const optsP = [
      'Con ese toque mira estas',
      'Para ese presupuesto mira estas',
      'Estas andan cerca de lo que manejas',
    ];
    return sanitizarPuntuacion(optsP[v % optsP.length]);
  }
  if (curioso) {
    const curiosos = [
      'Mira estas para que veas mas o menos',
      'Te mando estas variadas para orientar',
      'Ahi van estas distintas para que compares',
    ];
    return sanitizarPuntuacion(curiosos[v % curiosos.length]);
  }
  const genericos = [
    'Mira estas',
    'Te mando estas para que veas',
    'Ahi van estas',
  ];
  return sanitizarPuntuacion(genericos[v % genericos.length]);
}

/** True si la respuesta es solo "Hola"/"Buenas" (prohibido en saludo). */
function esSaludoUnaPalabra(texto) {
  return /^(hola|buenas?|buen[oa]s?)[\s!.?]*$/i.test(
    String(texto || '').trim(),
  );
}

/**
 * Saludo de presentación (sencillo, amable, profesional).
 * Espíritu: Buenas/Hola + soy Matias de Nodo Propiedades + En que puedo ayudarte?
 * idx suele ser turno o hash de chat (variantes leves OK).
 */
function saludoHumanoCorto(idx) {
  const opts = [
    'Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?',
    'Hola, soy Matias de Nodo Propiedades. En que puedo ayudarte?',
    'Buenas, soy Matias de Nodo Propiedades. En que te ayudo?',
    'Hola, soy Matias de Nodo Propiedades. En que te puedo ayudar?',
  ];
  const i = Math.abs(Number(idx) || 0) % opts.length;
  return sanitizarPuntuacion(opts[i]);
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
  if (/\b(che|boludo|boluda|loco|loca|pibe|mina|re\s+\w+|posta|al toque|zarpado|matche(?:en|ar|a|an)?)\b/i.test(t)) {
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

/** Cliente pide detalle de "la ultima" / una propiedad concreta. */
function pideDetallePropiedad(texto) {
  const t = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(contame|conta(me)?|mas info|mas detalle|de la ultima|de esa|de esta|de la que|quien me espera|quien esta|como es|que tiene|caracteristicas|fotos de)\b/.test(
    t,
  );
}

function resolverIdUltimaPropiedad(historialArr, propiedadSegPrev, sugerenciasIds) {
  try {
    const o = JSON.parse(String(propiedadSegPrev || ''));
    if (o && o.id) return String(o.id).trim().toUpperCase();
  } catch (e) {}
  const arr = Array.isArray(historialArr) ? historialArr : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const c = String((arr[i] && arr[i].content) || '');
    const m = c.match(/\b(MZA-\d{3})\b/i);
    if (m) return m[1].toUpperCase();
  }
  if (Array.isArray(sugerenciasIds) && sugerenciasIds.length) {
    return String(sugerenciasIds[sugerenciasIds.length - 1]).trim().toUpperCase();
  }
  return '';
}

/**
 * Armado deterministico de detalle (no solo direccion).
 * @returns {{ burbujas: string[], propiedad_id: string, caption: string }|null}
 */
function armarDetallePropiedadRico(id, mediaMap, stockRows) {
  const pid = String(id || '').trim().toUpperCase();
  if (!pid) return null;
  const media = (mediaMap && mediaMap[pid]) || null;
  let row = null;
  for (const r of stockRows || []) {
    const rid = String(
      (r && (r.id || r.ID || r.codigo || r.property_id)) || '',
    )
      .trim()
      .toUpperCase();
    if (rid === pid) {
      row = r;
      break;
    }
  }
  const titulo = (media && media.titulo) || pid;
  const zona =
    (media && media.zona) ||
    (row && (row.zona || row.Zona)) ||
    '';
  const tipo =
    (media && media.tipo) ||
    (row && (row.tipo || row.Tipo)) ||
    '';
  const precio =
    (media && media.precio) ||
    (row && (row.precio || row.Precio)) ||
    '';
  const desc =
    (media && media.descripcion) ||
    (row && (row.descripcion || row.Descripcion)) ||
    '';
  const link = (media && media.linkFicha) || '';
  const op = (media && media.operacion) || 'Venta';
  const amb = (media && media.ambientes) || '';

  const linea1 = [zona, titulo !== pid ? titulo : tipo].filter(Boolean).join(' - ') || pid;
  const linea2 = [
    tipo,
    amb ? amb + ' amb' : '',
    desc || 'Detalle en ficha',
  ]
    .filter(Boolean)
    .join('. ');
  const linea3 =
    (precio ? precio + ' · ' + op : op) +
    (link ? ' · ' + link : '') +
    '. Te armo visita o queres mas fotos?';

  return {
    propiedad_id: pid,
    burbujas: [
      sanitizarPuntuacion(linea1),
      sanitizarPuntuacion(linea2.slice(0, 350)),
      sanitizarPuntuacion(linea3.slice(0, 280)),
    ],
    caption: sanitizarPuntuacion(
      (media && media.caption) || [titulo, zona, precio].filter(Boolean).join(' · '),
    ),
  };
}

function pideCoordinarVisita(texto) {
  const t = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // No incluir "quien recibe/espera" aca: eso es info de visita, no agenda todavia.
  return /\b(visita|agendar|agenda|horario|que dia|cuando puedo|cuando se puede|coordinar|coordinemos|armame (una )?visita|quiero visitar)\b/.test(
    t,
  );
}

function confirmaCierreCorto(texto) {
  return /^(ok|okey|okei|dale|listo|si|sí|va|perfecto|de una)[\s!.?]*$/i.test(
    String(texto || '').trim(),
  );
}
