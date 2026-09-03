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
  /\b(que ten[eé]s|qué ten[eé]s|que hay|qué hay|que venden|qué venden|mostrame|mostrá|mandame|mandá|pasame|pasá|opciones|a ver opciones|ver opciones|catalogo|catálogo|enviame|enviá|algo para ver|ver algo|lo que tengas|lo que tengan|mandame algo|mostrame algo|sorprendeme|sorprendeme|mostr[aá].*primero|primero.*mostr|mostr[aá].*algo|mand[aá].*algo)\b/i;

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

const IC_MONEDA_RE = '(?:usd|u\\$s|u\\$d|us\\$|d[oó]lar(?:es)?)';

function icExtraerPresupuestoUsd(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let m = t.match(
    new RegExp(
      '(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d{4,7})\\s*' + IC_MONEDA_RE,
      'i',
    ),
  );
  if (m) return parseInt(m[1].replace(/[.,\s]/g, ''), 10);
  m = t.match(new RegExp(IC_MONEDA_RE + '\\s*(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d{4,7})', 'i'));
  if (m) return parseInt(m[1].replace(/[.,\s]/g, ''), 10);
  m = t.match(new RegExp('(\\d{2,3})\\s*mil\\s*' + IC_MONEDA_RE + '?', 'i'));
  if (m) return parseInt(m[1], 10) * 1000;
  m = t.match(/\b(\d{2,3})\s*k\b/i);
  if (m) return parseInt(m[1], 10) * 1000;
  m = t.match(/por\s+(\d{1,3}(?:[.,\s]\d{3})+|\d{4,7})/i);
  if (m) return parseInt(m[1].replace(/[.,\s]/g, ''), 10);
  m = t.match(/(\d{2,3})\s*mil\b/i);
  if (m && !/\b(alquil|mensual|por mes)\b/i.test(t)) return parseInt(m[1], 10) * 1000;
  return null;
}

function icPickCampo(row, keys) {
  if (!row || typeof row !== 'object') return '';
  const lower = {};
  for (const [k, v] of Object.entries(row)) {
    lower[String(k).toLowerCase().replace(/\s+/g, '_')] = v;
  }
  for (const k of keys) {
    const key = String(k).toLowerCase().replace(/\s+/g, '_');
    if (lower[key] != null && String(lower[key]).trim()) return String(lower[key]).trim();
  }
  return '';
}

function icParsePrecioUsd(s) {
  const raw = String(s || '').trim();
  if (!raw) return null;
  const t = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mil = t.match(/(\d{1,3})\s*mil\b/);
  if (mil) return parseInt(mil[1], 10) * 1000;
  const cleaned = t
    .replace(/usd|u\$s|u\$d|us\$|dolares?|dolar/gi, '')
    .replace(/\s/g, '');
  if (/\d{1,3}\.\d{3}(?:\.\d{3})*(?:,\d+)?/.test(cleaned) || /\d{1,3},\d{3}/.test(cleaned)) {
    const n = cleaned.replace(/\./g, '').replace(/,/g, '');
    const m = n.match(/(\d{4,8})/);
    return m ? parseInt(m[1], 10) : null;
  }
  const n = cleaned.replace(/[.,]/g, '');
  const m = n.match(/(\d{4,8})/);
  return m ? parseInt(m[1], 10) : null;
}

function icSugerirIdsStock(stock, budgetUsd, zonaHint) {
  const scored = [];
  for (const r of stock || []) {
    const id = icPickCampo(r, ['id', 'ID', 'codigo', 'property_id', 'codigo_interno']);
    const precio = icParsePrecioUsd(
      icPickCampo(r, ['precio', 'Precio', 'precio_usd', 'price', 'Precio USD']),
    );
    const zona = icPickCampo(r, ['zona', 'Zona', 'barrio', 'zone']).toLowerCase();
    const op = icPickCampo(r, [
      'operacion',
      'Operacion',
      'tipo_operacion',
      'operation_type',
    ]).toLowerCase();
    if (!id) continue;
    let score = precio && budgetUsd ? Math.abs(precio - budgetUsd) : precio ? precio : 90000;
    if (budgetUsd && precio) {
      if (precio <= budgetUsd * 1.22 && precio >= budgetUsd * 0.45) score -= 28000;
      else if (precio > budgetUsd * 1.35) score += 18000;
      else if (precio < budgetUsd * 0.35) score += 8000;
    }
    if (zonaHint && zona.includes(String(zonaHint).split(' ')[0])) score -= 8000;
    if (op && /alquil/.test(op) && budgetUsd && budgetUsd >= 15000) score += 35000;
    scored.push({ id, score, precio: precio || 0 });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 3).map((x) => x.id);
}

function icSugerirIdsVariados(stock) {
  const rows = [];
  for (const r of stock || []) {
    const id = icPickCampo(r, ['id', 'ID', 'codigo', 'property_id']);
    const precio = icParsePrecioUsd(
      icPickCampo(r, ['precio', 'Precio', 'precio_usd', 'price']),
    );
    const zona = icPickCampo(r, ['zona', 'Zona', 'barrio']).toLowerCase();
    if (!id) continue;
    rows.push({ id, precio: precio || 0, zona });
  }
  if (!rows.length) return [];
  rows.sort((a, b) => a.precio - b.precio);
  const picked = [];
  const zonasUsadas = new Set();
  for (const r of rows) {
    if (picked.length >= 3) break;
    const zonaKey = (r.zona || 'x').split(' ')[0];
    if (!zonasUsadas.has(zonaKey)) {
      picked.push(r.id);
      zonasUsadas.add(zonaKey);
    }
  }
  for (const r of rows) {
    if (picked.length >= 3) break;
    if (!picked.includes(r.id)) picked.push(r.id);
  }
  return picked.slice(0, 3);
}

/** Historial en prompt: ~12 turnos (24 msgs). Alineado a tesis; no saturar contexto. */
const IC_HISTORIAL_PROMPT_MAX = 24;
/** Persistencia en Sheets: un poco más holgado que el prompt. */
const IC_HISTORIAL_STORE_MAX = 48;

function icSanitizarHistorialPrompt(arr, maxMsgs) {
  const max = maxMsgs || IC_HISTORIAL_PROMPT_MAX;
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue;
    let role = String(m.role || '').toLowerCase().trim();
    if (role === 'bot') role = 'assistant';
    if (role === 'cliente') role = 'user';
    if (role !== 'user' && role !== 'assistant') continue;
    let content = String(m.content || m.mensaje || '').trim();
    content = content
      .replace(/###MOSTRAR_PROPIEDADES###[\s\S]*?###FIN_MOSTRAR###/gi, '[fichas enviadas]')
      .replace(/###BURBUJAS###[\s\S]*?###FIN_BURBUJAS###/gi, '')
      .replace(/###SOLICITUD_VISITA###[\s\S]*?###FIN_VISITA###/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-max);
}

function icHistorialBlock(arr) {
  return icSanitizarHistorialPrompt(arr, IC_HISTORIAL_PROMPT_MAX)
    .map((m) => (m.role === 'assistant' ? 'Bot: ' : 'Cliente: ') + m.content)
    .join('\n');
}

function icTextoSoloUsuarios(historialArr, histTexto) {
  if (Array.isArray(historialArr) && historialArr.length) {
    const users = [];
    for (const m of historialArr) {
      const role = String((m && m.role) || '').toLowerCase();
      if (role === 'user' || role === 'cliente') {
        users.push(String((m && m.content) || '').trim());
      }
    }
    if (users.length) return users.join('\n');
  }
  // Fallback: líneas "Cliente:" del bloque texto
  const lines = String(histTexto || '')
    .split('\n')
    .filter((l) => /^cliente\s*:/i.test(l.trim()));
  if (lines.length) {
    return lines.map((l) => l.replace(/^cliente\s*:\s*/i, '')).join('\n');
  }
  return '';
}

function icBotYaAclamoCompraAlquiler(historialArr, histTexto) {
  const bots = [];
  if (Array.isArray(historialArr)) {
    for (const m of historialArr) {
      const role = String((m && m.role) || '').toLowerCase();
      if (role === 'assistant' || role === 'bot') {
        bots.push(String((m && m.content) || ''));
      }
    }
  }
  const h = bots.join(' ') + ' ' + String(histTexto || '');
  return /\b(comprar o alquilar|busc[aá]s comprar o alquilar|presupuesto mensual|monto en d[oó]lares lo usual|entra en compra|podemos mirar opciones de compra|ya lo hablamos.*compra)\b/i.test(
    h,
  );
}

function icBotRepiteSinFichas(historialArr) {
  if (!Array.isArray(historialArr) || historialArr.length < 2) return false;
  const bots = [];
  for (const m of historialArr) {
    const role = String((m && m.role) || '').toLowerCase();
    if (role === 'assistant' || role === 'bot') {
      bots.push(String((m && m.content) || '').trim());
    }
  }
  if (bots.length < 2) return false;
  const a = bots[bots.length - 1];
  const b = bots[bots.length - 2];
  if (!a || !b) return false;
  const yaFichas = /te paso un par de opciones|mirá estas opciones|###MOSTRAR_PROPIEDADES###/i.test(
    a + ' ' + b,
  );
  if (yaFichas) return false;
  const na = a
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nb = b
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = na.split(' ').filter((w) => w.length > 2);
  const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!wa.length || !wb.size) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.length, wb.size) >= 0.62;
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
  // Preguntas del bot ("alquilar o comprar") no cuentan como operación del cliente
  if (/\b(comprar o alquilar|alquilar o comprar|busc[aá]s comprar)\b/i.test(t)) {
    return '';
  }
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
  const esAudio = Boolean(o.esAudioSinTexto) && !String(msg || '').trim();

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

  const presupuestoTexto = icExtraerPresupuestoUsd(texto);
  const usersHist = icTextoSoloUsuarios(o.historialJsonArr, hist);
  const presupuestoUsd =
    presupuestoTexto ||
    icExtraerPresupuestoUsd(usersHist) ||
    icExtraerPresupuestoUsd(hist);
  const zona = icExtraerZona(texto) || icExtraerZona(usersHist) || icExtraerZona(hist);
  const operacionTexto = icExtraerOperacion(texto);
  const yaAclamoCompraAlquiler = icBotYaAclamoCompraAlquiler(
    o.historialJsonArr,
    hist,
  );
  const botRepiteSinFichas = icBotRepiteSinFichas(o.historialJsonArr);
  let operacion = operacionTexto;
  if (!operacion) {
    // Presupuesto USD en mensaje actual sin "alquiler" → compra (no heredar del bot)
    if (
      presupuestoTexto &&
      presupuestoTexto >= 15000 &&
      !/\b(alquil|rent|alquiler)\b/i.test(texto)
    ) {
      operacion = 'compra';
    } else if (yaAclamoCompraAlquiler && !/\b(alquil|rent|alquiler)\b/i.test(texto)) {
      // Ya aclaramos compra vs alquiler: default venta/compra salvo que el cliente diga alquiler
      operacion = 'compra';
    } else {
      // Solo mensajes del CLIENTE (nunca texto del bot con "alquilar o comprar")
      operacion = icExtraerOperacion(usersHist);
    }
  }
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

  // Solo bloquear stock la PRIMERA vez que el cliente dijo alquiler + USD alto.
  // Si el bot ya aclaró, o pide opciones, o hay presupuesto sin decir alquiler ahora → mostrar.
  const alquilerPresupuestoAlto =
    operacion === 'alquiler' &&
    presupuestoUsd &&
    presupuestoUsd >= 15000 &&
    !pideOpciones &&
    !yaAclamoCompraAlquiler &&
    !/\b(compr|venta|vend)\b/i.test(texto) &&
    /\b(alquil|rent|alquiler)\b/i.test(texto + ' ' + usersHist);

  let mostrarStock =
    Boolean(o.stockDisponible !== false && o.stockDisponible !== 0) &&
    !alquilerPresupuestoAlto &&
    (pideOpciones ||
      Boolean(presupuestoUsd) ||
      modoCurioso ||
      botRepiteSinFichas ||
      (yaAclamoCompraAlquiler && Boolean(presupuestoUsd)) ||
      (scoreInmo >= 3 && !esSaludo));

  // Si el bot viene repitiendo el mismo párrafo sin fichas → forzar stock
  if (
    botRepiteSinFichas &&
    Boolean(o.stockDisponible !== false && o.stockDisponible !== 0) &&
    (pideOpciones || Boolean(presupuestoUsd) || scoreInmo >= 2)
  ) {
    mostrarStock = true;
  }

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
    ya_aclaro_compra_alquiler: yaAclamoCompraAlquiler,
    bot_repite_sin_fichas: botRepiteSinFichas,
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
      '- Si mostrar_stock=true: incluí ###MOSTRAR_PROPIEDADES### en esta respuesta SIN preguntar zona/presupuesto/operación antes. PROHIBIDO repetir el texto del turno anterior.',
    );
  }
  if (c.bot_repite_sin_fichas) {
    lines.push(
      '- El bot ya dijo lo mismo. NO reformules el mismo párrafo: mostrá fichas con ###MOSTRAR_PROPIEDADES### ahora.',
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
