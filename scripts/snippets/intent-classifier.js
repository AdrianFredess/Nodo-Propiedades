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
  /\b(depto|departamento|casa|lote|local|oficina|alquiler|alquil|comprar|compra|venta|vender|propiedad|propiedades|inmueble|inmobiliaria|presupuesto|habitaci[oó]n|dormitorio|ambientes|m2|zona|barrio|visita|usd|u\$s|dolar|mza-\d+|nodo|expensas|cochera|escritur|seña|senia|financi|hipotec|comisi[oó]n|sellos|boleto|escritura|temporario|pago|pesos)\b/i;

const IC_PEDIR_OPCIONES =
  /\b(que ten[eé]s|qué ten[eé]s|que hay|qué hay|ten[eé]s algo|hay algo|algo en|algo por|que venden|qué venden|mostrame|mostrá|mandame|mandá|pasame|pasá|opciones|a ver(?: opciones| entonces| pues| nomas| nom[aá]s| que ten[eé]s| qu[eé] ten[eé]s| q tenes| qe tenes)?|ver opciones|catalogo|catálogo|enviame|enviá|enviame lo que tengas|envi[aá] lo que tengas|enviame lo q tengas|enviame lo que tenga|mandame lo que tengas|mand[aá] lo que tengas|mandame opciones|enviame opciones|pasame opciones|pasame lo que tengas|dame lo que tengas|enviame lo que haya|mandame lo que haya|pasame lo que haya|dame lo que haya|algo para ver|ver algo|lo que tengas|lo que tengan|lo que haya|mandame algo|mostrame algo|sorprendeme|sorprendeme|mostr[aá].*primero|primero.*mostr|mostr[aá].*algo|mand[aá].*algo|mostrame lo que haya|tirame variedad|tirame opciones)\b/i;

/** Pedido corto tipo "a ver" / "dale" tras presupuesto — siempre stock. */
const IC_PEDIR_CORTO =
  /^(a ver|dale|dale a ver|ok a ver|bueno a ver|si a ver|s[ií] a ver|mostrar|mostrame|mandame|enviame|pasame|enviame lo que tengas|mandame lo que tengas|enviame lo que haya|mandame lo que haya|mandame opciones|enviame opciones|a ver que ten[eé]s|a ver qu[eé] ten[eé]s|a ver q tenes)[\s!.?]*$/i;

/**
 * Disparadores DIRECTOS de mostrar_stock=true (spec Matías).
 * Independiente de si ya se preguntó zona/presupuesto.
 */
const IC_PEDIR_DIRECTO =
  /\b((enviame|envi[aá]|mandame|mand[aá]|pasame|pas[aá]|dame)\s+(lo\s+que\s+)?(tengas|tenga|haya|hay|opciones)|(mandame|enviame|pasame)\s+opciones|a\s+ver\s+(que|qu[eé]|q|qe)\s+ten[eé]s|tirame\s+(variedad|opciones)|lo\s+que\s+tengas|lo\s+que\s+haya|ten[eé]s\s+algo|hay\s+algo)\b/i;

const IC_SIN_CRITERIO =
  /\b(no tengo (nada )?(claro|en mente|definido|pensado)|no s[eé] (tanto|mucho|bien|nada)?|nose|no estoy seguro|sin criterio|sin idea|no defin[ií]|a[uú]n no s[eé]|todav[ií]a no s[eé]|me da igual|cualquier cosa|cualquiera|no se que|no s[eé] que|nada claro|sin nada pensado)\b/i;

const IC_CURIOSO =
  /\b(solo (estoy )?(viendo|mirando|curioseando)|solo quiero ver|de curioso|por curiosidad|para ver nomas|para saber nomas|nomas (quiero|para) ver|cu[aá]nto sale|a cu[aá]nto|precio de|cu[aá]nto cuesta)\b/i;

/** Interés inmobiliario vago: "busco depto" sin zona/presupuesto ni pedido de fichas. */
const IC_BUSQUEDA_VAGA =
  /\b((estoy )?(buscando|busco|quiero|necesito|mira(ndo)?|viendo)\s+(un[ao]?\s+)?(depto|departamento|casa|lote|local|propiedad|algo|inmueble)|(depto|departamento|casa|lote)\b)/i;

/** Cliente declara idea concreta (zona/presupuesto/tipo pensado). */
const IC_TIENE_PENSADO =
  /\b(tengo (algo )?pensado|ya tengo (algo )?pensado|tengo en mente|ya se lo que|ya s[eé] lo que|busco (en|por|cerca)|quiero (en|por)|pensado (en|de|por))\b/i;

function icExtraerTipo(texto) {
  const t = String(texto || '').toLowerCase();
  if (/\b(depto|departamento)\b/i.test(t)) return 'depto';
  if (/\bcasa\b/i.test(t)) return 'casa';
  if (/\blote\b/i.test(t)) return 'lote';
  if (/\blocal\b/i.test(t)) return 'local';
  return '';
}

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

/** Historial en prompt: últimos ~8 mensajes (detalle). Reduce TPM vs 12–24. */
const IC_HISTORIAL_PROMPT_MAX = 8;
/** Persistencia en Sheets: un poco más holgado que el prompt. */
const IC_HISTORIAL_STORE_MAX = 48;
/** Máx. propiedades inyectadas al prompt (no el catálogo entero). */
const IC_STOCK_PROMPT_MAX = 8;

/**
 * Filtra stock por zona/presupuesto/tipo antes de mandarlo al LLM.
 * Sin datos del cliente → muestra acotada (no catálogo completo).
 */
function icFiltrarStockParaPrompt(stock, opts) {
  opts = opts || {};
  const max =
    typeof opts.max === 'number' && opts.max > 0
      ? opts.max
      : IC_STOCK_PROMPT_MAX;
  if (!Array.isArray(stock) || !stock.length) return [];
  const zonaHint = String(opts.zona || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)[0];
  const budgetUsd = Number(opts.budgetUsd) || 0;
  const tipoHint = String(opts.tipo || '')
    .toLowerCase()
    .trim();
  const hasFilter = Boolean(zonaHint || budgetUsd || tipoHint);

  const scored = [];
  for (const r of stock) {
    const id = icPickCampo(r, ['id', 'ID', 'codigo', 'property_id', 'codigo_interno']);
    if (!id) continue;
    const precio = icParsePrecioUsd(
      icPickCampo(r, ['precio', 'Precio', 'precio_usd', 'price', 'Precio USD']),
    );
    const zona = icPickCampo(r, ['zona', 'Zona', 'barrio', 'zone']).toLowerCase();
    const tipo = icPickCampo(r, ['tipo', 'Tipo', 'tipologia', 'property_type']).toLowerCase();
    let score = 1;
    if (hasFilter) {
      score = 0;
      if (zonaHint && zona.includes(zonaHint)) score += 4;
      if (tipoHint && (tipo.includes(tipoHint) || tipoHint.includes(tipo))) score += 3;
      if (budgetUsd && precio) {
        if (precio <= budgetUsd * 1.2 && precio >= budgetUsd * 0.4) score += 3;
        else if (precio > budgetUsd * 1.35) score -= 2;
      } else if (!budgetUsd) {
        score += 1;
      }
    }
    scored.push({ row: r, score, id });
  }
  scored.sort((a, b) => b.score - a.score);
  if (hasFilter) {
    const hit = scored.filter((x) => x.score > 0);
    if (hit.length) return hit.slice(0, max).map((x) => x.row);
  }
  // Muestra acotada / fallback: mezcla por posición (variedad barata)
  const step = Math.max(1, Math.floor(scored.length / max));
  const picked = [];
  const seen = {};
  for (let i = 0; i < scored.length && picked.length < max; i += step) {
    const id = scored[i].id;
    if (seen[id]) continue;
    seen[id] = true;
    picked.push(scored[i].row);
  }
  for (let i = 0; i < scored.length && picked.length < max; i++) {
    const id = scored[i].id;
    if (seen[id]) continue;
    seen[id] = true;
    picked.push(scored[i].row);
  }
  return picked;
}

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
  return /###MOSTRAR_PROPIEDADES###|te paso un par de opciones|mira estas opciones|cual de estas te cierra|te cuento mas de alguna/i.test(
    h,
  );
}

/** Gap ~12h o día calendario distinto → recontacto (evitar dump de stock tras pausa). */
const IC_GAP_RECONTACTO_MS = 12 * 60 * 60 * 1000;

/**
 * Recontacto suave: saludo + "estaba buscando propiedades" sin pedir opciones ni criterios HOY.
 * No es dump de stock; hay que saludar y preguntar UNA cosa.
 */
function icEsRecontactoSuave(msg) {
  const t = String(msg || '').trim();
  if (!t || t.length > 160) return false;
  if (IC_PEDIR_OPCIONES.test(t) || IC_SIN_CRITERIO.test(t) || IC_CURIOSO.test(t)) {
    return false;
  }
  if (icExtraerPresupuestoUsd(t) || icExtraerZona(t)) return false;
  const n = icNormalizarSaludo(t);
  const tieneSaludo =
    /^(hola|buenas?|buen dia|hey|hi)\b/.test(n) || /\bhola\b/.test(n);
  if (!tieneSaludo) return false;
  const buscaSuave =
    /\b(estaba|estoy|sigo|seguia|segu[ií]a|vuelvo a|retomo|queria|quería|buscaba)\s+(buscando|buscar|viendo|mirando)/i.test(
      t,
    ) || /\bestaba buscando\b/i.test(t);
  if (!buscaSuave) return false;
  if (/\b(mostrame|mandame|pasame|opciones|que tenes|qué tenés)\b/i.test(t)) {
    return false;
  }
  return true;
}

function icNormalizarSaludo(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    // Typos: estaas / estass / holaa → estas / estas / hola
    .replace(/(.)\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hard rule: saludo puro (hola / como estas / typos) → NUNCA stock.
 * No depende de historial ni timestamps.
 */
function icEsSaludoVacio(msg) {
  const m = String(msg || '').trim();
  if (!m || m.length >= 55) return false;
  if (
    IC_INMO_KEYWORDS.test(m) ||
    IC_PEDIR_OPCIONES.test(m) ||
    IC_VISITA.test(m) ||
    IC_CURIOSO.test(m) ||
    IC_SIN_CRITERIO.test(m) ||
    /\b(depto|casa|alquil|compr|venta|propiedad|precio|usd|\d{4,}|zona|mostrame|mandame|pasame|opciones)\b/i.test(
      m,
    )
  ) {
    return false;
  }
  if (IC_ACK.test(m)) return true;
  const n = icNormalizarSaludo(m);
  if (!n || n.length >= 50) return false;
  if (
    /^(hola|buenas?|buen dia|buenas tardes|buenas noches|hey|hi|hello)([!\s]*)$/.test(n)
  ) {
    return true;
  }
  if (/^(como estas?|que tal|todo bien)([!\s]*)$/.test(n)) return true;
  if (
    /^(hola|buenas?|buen dia)[,!\s]+(como estas?|que tal|todo bien|todo bien vos)([!\s]*)$/.test(
      n,
    )
  ) {
    return true;
  }
  // hola como estas / estaas / estass / estas?
  if (/^hola\s+como\s+estas?\s*$/.test(n)) return true;
  if (/^buenas?\s+como\s+estas?\s*$/.test(n)) return true;
  return false;
}

function icParseFechaMsg(m) {
  if (!m || typeof m !== 'object') return null;
  const raw =
    m.ts ||
    m.timestamp ||
    m.fecha ||
    m.fecha_iso ||
    (m.meta && (m.meta.ts || m.meta.timestamp || m.meta.fecha));
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function icDiaClave(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  return (
    x.getFullYear() +
    '-' +
    String(x.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(x.getDate()).padStart(2, '0')
  );
}

/**
 * Día nuevo / recontacto: último msg user (o ultima_actualizacion) en otro día
 * o con gap > ~12h. No asumir contexto viejo para tirar stock.
 */
function icDetectarRecontacto(historialArr, opts) {
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  const hoy = icDiaClave(now);
  let lastTs = null;

  if (o.ultimaActualizacion) {
    const d = new Date(o.ultimaActualizacion);
    if (!isNaN(d.getTime())) lastTs = d;
  }

  if (Array.isArray(historialArr)) {
    for (let i = historialArr.length - 1; i >= 0; i--) {
      const m = historialArr[i];
      const role = String((m && m.role) || '').toLowerCase();
      if (role !== 'user' && role !== 'cliente') continue;
      const fd = icParseFechaMsg(m);
      if (fd) {
        lastTs = fd;
        break;
      }
    }
  }

  if (!lastTs) {
    const dias = Number(o.diasSinContacto);
    if (!isNaN(dias) && dias >= 1) {
      return {
        es_dia_nuevo: true,
        es_recontacto: true,
        gap_horas: dias * 24,
      };
    }
    return { es_dia_nuevo: false, es_recontacto: false, gap_horas: 0 };
  }

  const gapMs = Math.max(0, now.getTime() - lastTs.getTime());
  const gapHoras = gapMs / (1000 * 60 * 60);
  const diaDistinto = icDiaClave(lastTs) !== hoy;
  const esDiaNuevo = diaDistinto || gapMs >= IC_GAP_RECONTACTO_MS;
  const tieneHist = Array.isArray(historialArr) && historialArr.length > 0;
  return {
    es_dia_nuevo: esDiaNuevo,
    es_recontacto: Boolean(esDiaNuevo && tieneHist),
    gap_horas: Math.round(gapHoras * 10) / 10,
  };
}

function clasificarIntencionCliente(msg, historial, opts) {
  const o = opts || {};
  const texto = String(msg || '').trim();
  const hist = String(historial || '').trim();
  const textoCompleto = (hist + '\n' + texto).trim();
  const esAudio = Boolean(o.esAudioSinTexto) && !String(msg || '').trim();
  const recontacto = icDetectarRecontacto(o.historialJsonArr, {
    ultimaActualizacion: o.ultimaActualizacion,
    diasSinContacto: o.diasSinContacto,
    now: o.now,
  });
  const recontactoSuave = icEsRecontactoSuave(texto);
  const tieneHist =
    (Array.isArray(o.historialJsonArr) && o.historialJsonArr.length > 0) ||
    Boolean(String(hist || '').trim());
  // Día nuevo / gap / recontacto suave → contexto fresco (no heredar presupuesto viejo)
  const esDiaNuevo = Boolean(recontacto.es_dia_nuevo || recontactoSuave);
  const esRecontacto = Boolean(
    (recontacto.es_recontacto || recontactoSuave) && tieneHist,
  );

  if (esAudio) {
    return {
      intencion: 'audio',
      confianza: 'alta',
      mostrar_stock: false,
      modo_curioso: false,
      requiere_calificar: false,
      es_off_topic: false,
      es_saludo: false,
      es_dia_nuevo: esDiaNuevo,
      es_recontacto: esRecontacto,
      gap_horas: recontacto.gap_horas || 0,
      presupuesto_usd: null,
      zona: '',
      operacion: '',
    };
  }

  const presupuestoTexto = icExtraerPresupuestoUsd(texto);
  const usersHist = icTextoSoloUsuarios(o.historialJsonArr, hist);
  // En día nuevo / recontacto no heredar presupuesto/zona del hilo viejo.
  const presupuestoUsdHist =
    icExtraerPresupuestoUsd(usersHist) || icExtraerPresupuestoUsd(hist);
  const presupuestoUsd =
    presupuestoTexto || (!esDiaNuevo ? presupuestoUsdHist : null);
  const zonaTexto = icExtraerZona(texto);
  const zonaHist = icExtraerZona(usersHist) || icExtraerZona(hist);
  const zona = zonaTexto || (!esDiaNuevo ? zonaHist : '');
  const operacionTexto = icExtraerOperacion(texto);
  const yaAclamoCompraAlquiler = icBotYaAclamoCompraAlquiler(
    o.historialJsonArr,
    hist,
  );
  const botRepiteSinFichas = !esDiaNuevo && icBotRepiteSinFichas(o.historialJsonArr);
  let operacion = operacionTexto;
  if (!operacion) {
    // Presupuesto USD en mensaje actual sin "alquiler" → compra (no heredar del bot)
    if (
      presupuestoTexto &&
      presupuestoTexto >= 15000 &&
      !/\b(alquil|rent|alquiler)\b/i.test(texto)
    ) {
      operacion = 'compra';
    } else if (
      !esDiaNuevo &&
      yaAclamoCompraAlquiler &&
      !/\b(alquil|rent|alquiler)\b/i.test(texto)
    ) {
      // Ya aclaramos compra vs alquiler: default venta/compra salvo que el cliente diga alquiler
      operacion = 'compra';
    } else if (!esDiaNuevo) {
      // Solo mensajes del CLIENTE (nunca texto del bot con "alquilar o comprar")
      operacion = icExtraerOperacion(usersHist);
    }
  }
  const yaMostroStock = !esDiaNuevo && icYaMostroStock(hist, o.historialJsonArr);
  const esSaludo = icEsSaludoVacio(texto) || recontactoSuave;
  const tipoTexto = icExtraerTipo(texto);
  // Pedido explícito HOY (no historial viejo) — disparadores directos del spec
  const pideDirectoHoy = IC_PEDIR_DIRECTO.test(texto);
  const pideOpcionesHoy =
    pideDirectoHoy ||
    IC_PEDIR_OPCIONES.test(texto) ||
    IC_PEDIR_CORTO.test(texto) ||
    IC_SIN_CRITERIO.test(texto) ||
    IC_CURIOSO.test(texto);
  // Criterios claros HOY: presupuesto, o zona+tipo, o "tengo pensado" + (zona|presupuesto|tipo)
  const tieneCriteriosClarosHoy = Boolean(
    presupuestoTexto ||
      (zonaTexto && (tipoTexto || operacionTexto || presupuestoTexto)) ||
      (IC_TIENE_PENSADO.test(texto) && (zonaTexto || presupuestoTexto || tipoTexto)),
  );
  // Interés vago: "busco depto" / "quiero casa" sin pedir fichas ni criterios claros
  const busquedaVagaHoy =
    !esSaludo &&
    !pideOpcionesHoy &&
    !tieneCriteriosClarosHoy &&
    !presupuestoTexto &&
    !IC_VISITA.test(texto) &&
    (IC_BUSQUEDA_VAGA.test(texto) ||
      (IC_INMO_KEYWORDS.test(texto) &&
        !zonaTexto &&
        !presupuestoTexto &&
        texto.length < 80));

  let scoreInmo = 0;
  if (presupuestoTexto) scoreInmo += 4;
  else if (presupuestoUsd && !esDiaNuevo) scoreInmo += 2;
  if (zonaTexto) scoreInmo += 3;
  else if (zona && !esDiaNuevo) scoreInmo += 1;
  if (operacionTexto) scoreInmo += 2;
  else if (operacion && !esDiaNuevo) scoreInmo += 1;
  if (IC_INMO_KEYWORDS.test(texto)) scoreInmo += 3;
  if (IC_PEDIR_OPCIONES.test(texto) || IC_PEDIR_CORTO.test(texto)) scoreInmo += 4;
  if (IC_SIN_CRITERIO.test(texto)) scoreInmo += 3;
  if (IC_CURIOSO.test(texto)) scoreInmo += 2;
  if (IC_VISITA.test(texto)) scoreInmo += 3;
  if (!esDiaNuevo && IC_INMO_KEYWORDS.test(hist)) scoreInmo += 1;
  if (/\b(busco|necesito|quiero|tengo)\b/i.test(texto) && texto.length >= 8) scoreInmo += 1;

  let scoreOff = 0;
  if (IC_OFF_TOPIC_DURO.test(texto)) scoreOff += 5;
  if (IC_PERSONAL_CLARO.test(texto)) scoreOff += 4;
  if (scoreInmo >= 2) scoreOff = Math.max(0, scoreOff - 3);

  const pideOpciones = pideOpcionesHoy;
  let modoCurioso =
    !esSaludo &&
    !busquedaVagaHoy &&
    (IC_SIN_CRITERIO.test(texto) ||
      IC_CURIOSO.test(texto) ||
      (pideOpciones && !presupuestoUsd && !zona) ||
      (texto.length < 55 && (IC_PEDIR_OPCIONES.test(texto) || IC_PEDIR_CORTO.test(texto))));

  // Solo bloquear stock la PRIMERA vez que el cliente dijo alquiler + USD alto.
  // Si el bot ya aclaró, o pide opciones, o hay presupuesto sin decir alquiler ahora → mostrar.
  const alquilerPresupuestoAlto =
    operacion === 'alquiler' &&
    presupuestoUsd &&
    presupuestoUsd >= 15000 &&
    !pideOpciones &&
    !yaAclamoCompraAlquiler &&
    !/\b(compr|venta|vend)\b/i.test(texto) &&
    /\b(alquil|rent|alquiler)\b/i.test(texto + ' ' + (esDiaNuevo ? '' : usersHist));

  // Stock SOLO si: pide opciones / sin criterio / curioso, O criterios claros HOY (presupuesto),
  // O bot repite sin fichas tras pedido real. NO forzar por "busco depto" vago.
  let mostrarStock =
    Boolean(o.stockDisponible !== false && o.stockDisponible !== 0) &&
    !alquilerPresupuestoAlto &&
    !esSaludo &&
    !busquedaVagaHoy &&
    (pideOpcionesHoy ||
      Boolean(presupuestoTexto) ||
      (tieneCriteriosClarosHoy && Boolean(presupuestoTexto || zonaTexto)) ||
      (!esDiaNuevo && Boolean(presupuestoUsd) && (pideOpcionesHoy || yaAclamoCompraAlquiler)) ||
      modoCurioso ||
      (!esDiaNuevo && botRepiteSinFichas && (pideOpcionesHoy || Boolean(presupuestoUsd))));

  // Día nuevo / recontacto suave: sin stock hasta pedido o criterios HOY
  if (esDiaNuevo && !pideOpcionesHoy && !presupuestoTexto && !zonaTexto) {
    mostrarStock = false;
    modoCurioso = false;
  }
  if (recontactoSuave) {
    mostrarStock = false;
    modoCurioso = false;
  }
  // HARD RULE: saludo puro → nunca stock, pase historial/presupuesto viejo
  if (esSaludo) {
    mostrarStock = false;
    modoCurioso = false;
  }
  // HARD RULE: interés vago early → preguntar si tiene algo pensado (no tirar fichas)
  if (busquedaVagaHoy) {
    mostrarStock = false;
    modoCurioso = false;
  }

  // Si el bot viene repitiendo el mismo párrafo sin fichas → forzar stock (mismo día)
  // Solo si ya hubo pedido de opciones o criterios (no en calificar vago)
  if (
    !esDiaNuevo &&
    !esSaludo &&
    !busquedaVagaHoy &&
    botRepiteSinFichas &&
    Boolean(o.stockDisponible !== false && o.stockDisponible !== 0) &&
    (pideOpciones || Boolean(presupuestoUsd))
  ) {
    mostrarStock = true;
  }

  const requiereCalificar =
    !esSaludo &&
    (busquedaVagaHoy ||
      (yaMostroStock &&
        !pideOpciones &&
        !IC_SIN_CRITERIO.test(texto) &&
        (IC_REFINAR.test(texto) ||
          (Boolean(zonaTexto || (!esDiaNuevo && zona)) && IC_INMO_KEYWORDS.test(texto)) ||
          (Boolean(presupuestoTexto || (!esDiaNuevo && presupuestoUsd)) && !modoCurioso))));

  if (requiereCalificar && !IC_PEDIR_OPCIONES.test(texto) && !IC_PEDIR_CORTO.test(texto) && !IC_SIN_CRITERIO.test(texto)) {
    // Tras ver fichas + refine: stock solo con presupuesto nuevo o filtro. En busqueda vaga: nunca.
    if (busquedaVagaHoy) mostrarStock = false;
    else mostrarStock = Boolean(presupuestoTexto || IC_REFINAR.test(texto));
  }

  let intencion = 'explorar';
  if (esSaludo || recontactoSuave) intencion = 'saludo';
  else if (esDiaNuevo && !pideOpcionesHoy && !presupuestoTexto && scoreInmo < 3) {
    intencion = 'saludo';
  } else if (IC_VISITA.test(texto)) intencion = 'visita';
  else if (busquedaVagaHoy) intencion = 'calificar';
  else if (presupuestoTexto && !pideOpciones) intencion = 'presupuesto';
  else if (zonaTexto && !pideOpciones && !modoCurioso) intencion = 'consulta_zona';
  else if (pideOpciones || IC_SIN_CRITERIO.test(texto)) intencion = 'pedir_opciones';
  else if (modoCurioso) intencion = 'explorar';
  else if (scoreOff >= 5 && scoreInmo < 2) intencion = 'off_topic';

  let confianza = 'media';
  if (scoreInmo >= 5 || scoreOff >= 5 || esSaludo || esDiaNuevo || busquedaVagaHoy) {
    confianza = 'alta';
  } else if (scoreInmo <= 1 && scoreOff <= 1 && texto.length > 3) confianza = 'baja';

  // Confianza baja: NO forzar stock (antes tiraba fichas en mensajes ambiguos)
  if (
    confianza === 'baja' &&
    intencion !== 'off_topic' &&
    intencion !== 'saludo' &&
    intencion !== 'calificar' &&
    !esSaludo &&
    !esDiaNuevo &&
    !busquedaVagaHoy
  ) {
    // Preferí calificar antes que dump de stock
    intencion = 'calificar';
    mostrarStock = false;
    modoCurioso = false;
  }

  let esOffTopic = false;
  if (scoreOff >= 5 && scoreInmo < 2 && !mostrarStock && !esSaludo) {
    esOffTopic = true;
    intencion = 'off_topic';
  }
  if (mostrarStock) esOffTopic = false;

  // Clamp final: saludo / recontacto suave gana siempre
  if (esSaludo || recontactoSuave || icEsSaludoVacio(texto)) {
    mostrarStock = false;
    modoCurioso = false;
    intencion = 'saludo';
  }
  if (busquedaVagaHoy && intencion !== 'saludo') {
    mostrarStock = false;
    modoCurioso = false;
    intencion = 'calificar';
  }
  // HARD RULE spec: disparadores directos → mostrar_stock=true (nunca visto)
  if (
    pideDirectoHoy &&
    !esSaludo &&
    !recontactoSuave &&
    !icEsSaludoVacio(texto) &&
    Boolean(o.stockDisponible !== false && o.stockDisponible !== 0) &&
    !alquilerPresupuestoAlto
  ) {
    mostrarStock = true;
    modoCurioso = true;
    intencion = 'pedir_opciones';
    esOffTopic = false;
  }

  return {
    intencion,
    confianza,
    mostrar_stock: mostrarStock,
    modo_curioso: modoCurioso,
    requiere_calificar: esSaludo || recontactoSuave ? false : requiereCalificar,
    es_off_topic: esOffTopic,
    es_saludo: Boolean(esSaludo || recontactoSuave || intencion === 'saludo'),
    es_dia_nuevo: esDiaNuevo,
    es_recontacto: esRecontacto,
    gap_horas: recontacto.gap_horas || 0,
    presupuesto_usd: esSaludo || recontactoSuave ? null : presupuestoUsd,
    zona: esSaludo || recontactoSuave ? '' : zona,
    operacion: esSaludo || recontactoSuave ? '' : operacion,
    tipo: esSaludo || recontactoSuave ? '' : tipoTexto,
    busqueda_vaga: Boolean(busquedaVagaHoy),
    score_inmo: scoreInmo,
    score_off: scoreOff,
    ya_aclaro_compra_alquiler: yaAclamoCompraAlquiler,
    bot_repite_sin_fichas: esSaludo || busquedaVagaHoy ? false : botRepiteSinFichas,
  };
}

function formatearBloqueIntencionPrompt(clasif) {
  const c = clasif || {};
  const lines = [
    'INTENCION_DETECTADA (clasificador automático — seguí esto; no contradigas mostrar_stock):',
    JSON.stringify({
      intencion: c.intencion,
      confianza: c.confianza,
      mostrar_stock: c.mostrar_stock,
      modo_curioso: c.modo_curioso,
      requiere_calificar: c.requiere_calificar,
      busqueda_vaga: Boolean(c.busqueda_vaga),
      es_dia_nuevo: Boolean(c.es_dia_nuevo),
      es_recontacto: Boolean(c.es_recontacto),
    }),
  ];
  if (c.es_dia_nuevo || c.es_recontacto) {
    lines.push(
      '- RECONTACTO / DIA NUEVO: el cliente vuelve tras pausa. Saludá natural (ej: "Todo bien, vos? Como venis con lo que estabas buscando?"). NO heredes presupuesto/zona viejos. NO ###MOSTRAR_PROPIEDADES###. NO dumpees historial. mostrar_stock=false hasta pedido EXPLICITO de opciones o criterios concretos HOY.',
    );
  }
  if (c.intencion === 'saludo' || c.es_saludo) {
    lines.push(
      '- Saludo: respondé natural y corto. NO uses ###MOSTRAR_PROPIEDADES###. No asumas el pedido de hace dias.',
    );
  }
  if (c.intencion === 'calificar' || c.busqueda_vaga) {
    lines.push(
      '- CALIFICAR (interes vago): el cliente dijo que busca algo pero NO pidio fichas ni dio criterios claros. PROHIBIDO ###MOSTRAR_PROPIEDADES###. Pregunta UNA cosa: si tiene algo pensado (zona, tipo, presupuesto) o prefiere que le muestres opciones. BIEN: "Tenes algo pensado de zona o presupuesto, o preferis que te muestre opciones?"',
    );
  }
  if (c.mostrar_stock) {
    lines.push(
      '- Si mostrar_stock=true: incluí ###MOSTRAR_PROPIEDADES### en esta respuesta SIN preguntar zona/presupuesto/operación antes. PROHIBIDO repetir el texto del turno anterior.',
    );
  } else {
    lines.push(
      '- Si mostrar_stock=false: PROHIBIDO ###MOSTRAR_PROPIEDADES### y PROHIBIDO inventar que mandás fichas.',
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
  if (c.requiere_calificar && !c.busqueda_vaga) {
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
    calificar: ['calificar', 'saludo', 'informal'],
    consulta_zona: ['zona', 'opciones'],
    presupuesto: ['presupuesto', 'opciones'],
    visita: ['visita', 'caliente'],
    saludo: ['saludo', 'frio'],
    off_topic: [],
    audio: [],
  };
  return map[intencion] || ['consulta'];
}
