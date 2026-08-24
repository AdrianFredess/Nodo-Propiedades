const STOCK_TTL_MS = 3 * 60 * 1000;

const leadsRaw = $('Leer Leads_Bot')
  .all()
  .map((i) => i.json)
  .filter(
    (r) =>
      r &&
      !r.error &&
      (r.chat_id || r.dedupe_key || r.nombre || r.lead_name),
  );
const consultasRaw = $('Leer Consultas')
  .all()
  .map((i) => i.json)
  .filter(
    (r) =>
      r &&
      !r.error &&
      (r.consulta_id || r.mensaje_cliente || r.chat_id),
  );

let historialChatRaw = [];
try {
  historialChatRaw = $('Leer Historial Chat')
    .all()
    .map((i) => i.json)
    .filter((r) => r && !r.error && (r.chat_id || r.historial_json));
} catch (e) {
  historialChatRaw = [];
}

function historialFromJson(raw, chatId) {
  let arr = [];
  try {
    if (typeof raw === 'string') arr = JSON.parse(raw);
    else if (Array.isArray(raw)) arr = raw;
  } catch (e) {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i] || {};
    const role = String(m.role || '').toLowerCase();
    const content = String(m.content || '').trim();
    if (!content) continue;
    const fecha = String(
      m.ts || m.timestamp || m.fecha || m.fecha_local || m.date || m.created_at || '',
    ).trim();
    if (role === 'user') {
      out.push({
        id: chatId + '-hj-' + i,
        fecha,
        mensajeCliente: content,
        respuestaBot: '',
      });
    } else if (role === 'assistant') {
      if (out.length && !out[out.length - 1].respuestaBot) {
        out[out.length - 1].respuestaBot = content;
        if (!out[out.length - 1].fecha && fecha) {
          out[out.length - 1].fecha = fecha;
        }
      } else {
        out.push({
          id: chatId + '-hj-' + i,
          fecha,
          mensajeCliente: '',
          respuestaBot: content,
        });
      }
    }
  }
  return out;
}

const histJsonByChat = new Map();
const histMetaByChat = new Map();
for (const h of historialChatRaw) {
  const id = String(h.chat_id || '').trim();
  if (!id || !h.historial_json) continue;
  histJsonByChat.set(id, h.historial_json);
  histMetaByChat.set(id, h);
}

const staticData = $getWorkflowStaticData('global');
const now = Date.now();

let stockRaw = [];
let stockError = '';
let stockSource = 'none';

function isRateLimitError(msg) {
  return /too many requests|quota|rate.?limit|429/i.test(String(msg || ''));
}

function loadLiveStock() {
  const stockItems = $('Leer Stock Propiedades').all().map((i) => i.json);
  const err = stockItems.find((r) => r && r.error);
  if (err) {
    return {
      rows: [],
      error: String(err.error),
    };
  }
  return {
    rows: stockItems.filter((r) => r && typeof r === 'object' && !r.error),
    error: '',
  };
}

try {
  let gate = { needStockRead: true, stockFromCache: [] };
  try {
    gate = $('Stock Cache Gate').first().json || gate;
  } catch (e) {
    gate = { needStockRead: true, stockFromCache: [] };
  }

  if (!gate.needStockRead && Array.isArray(gate.stockFromCache)) {
    stockRaw = gate.stockFromCache;
    stockSource = 'cache';
  } else {
    const live = loadLiveStock();
    stockError = live.error;
    if (!stockError) {
      stockRaw = live.rows;
      stockSource = 'live';
      staticData.stockCache = {
        at: now,
        rows: stockRaw,
      };
    } else if (
      staticData.stockCache &&
      Array.isArray(staticData.stockCache.rows) &&
      staticData.stockCache.rows.length
    ) {
      stockRaw = staticData.stockCache.rows;
      stockSource = 'stale-cache';
    } else {
      stockRaw = [];
      stockSource = 'error';
    }
  }
} catch (e) {
  stockError = String(e && e.message ? e.message : e);
  if (
    staticData.stockCache &&
    Array.isArray(staticData.stockCache.rows) &&
    staticData.stockCache.rows.length
  ) {
    stockRaw = staticData.stockCache.rows;
    stockSource = 'stale-cache';
  } else {
    stockRaw = [];
    stockSource = 'error';
  }
}

let leadsError = '';
try {
  const leadProbe = $('Leer Leads_Bot').all().map((i) => i.json);
  const err = leadProbe.find((r) => r && r.error);
  if (err) leadsError = String(err.error);
} catch (e) {}

const normTemp = (v) => {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return '';
  if (t === 'caliente' || t === 'hot') return 'caliente';
  if (t === 'tibio' || t === 'warm') return 'tibio';
  if (t === 'frio' || t === 'cold') return 'frio';
  return '';
};
const pickRawTemp = (...vals) => {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const n = normTemp(v);
    if (n) return n;
  }
  return '';
};
const tempFromEstadoActual = (text) => {
  const m = String(text || '').match(/###ESTADO_ACTUAL:(frio|tibio|caliente)###/i);
  return m ? String(m[1]).toLowerCase() : '';
};
const tempFromHistorialJson = (raw) => {
  let arr = [];
  try {
    if (typeof raw === 'string') arr = JSON.parse(raw);
    else if (Array.isArray(raw)) arr = raw;
  } catch (e) {
    return '';
  }
  if (!Array.isArray(arr)) return '';
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i] || {};
    const fromField = pickRawTemp(m.temperatura, m.temperature, m.estado);
    if (fromField) return fromField;
    const fromTag = tempFromEstadoActual(m.content || m.respuesta || '');
    if (fromTag) return fromTag;
  }
  return '';
};
const normCanal = (v) => {
  const c = String(v || 'telegram').trim().toLowerCase();
  if (c === 'whatsapp' || c === 'wa') return 'whatsapp';
  if (c === 'messenger') return 'messenger';
  return 'telegram';
};
const resolveLeadCompleto = (row) => {
  const v = String(row.lead_completo ?? '').trim().toLowerCase();
  if (v === 'si' || v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'no' || v === 'false' || v === '0') return false;
  return true;
};
const parsePropSeg = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return { id: '', referencia: '' };
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object') {
      return {
        id: String(o.id || o.codigo || '').trim(),
        referencia: String(o.referencia || o.ref || '').trim(),
      };
    }
  } catch (e) {}
  return { id: '', referencia: s };
};
const normKey = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const byChat = new Map();
for (const c of consultasRaw) {
  const id = String(c.chat_id || '').trim();
  if (!id) continue;
  if (!byChat.has(id)) byChat.set(id, []);
  // Preferir fecha_local (AR) cuando ISO de Sheets llega mal parseada
  const fechaRaw = String(c.fecha_local || c.fecha || '').trim();
  byChat.get(id).push({
    id: String(c.consulta_id || id + '-' + (c.fecha || '')),
    fecha: fechaRaw,
    mensajeCliente: String(c.mensaje_cliente || ''),
    respuestaBot: String(c.respuesta_bot || c.respuesta_wa || ''),
    temperatura: pickRawTemp(c.temperature, c.temperatura) || 'frio',
    canal: String(c.canal_origen || c.canal || '').toLowerCase() || undefined,
    leadCompletoFila: String(c.lead_completo || '').trim().toLowerCase(),
  });
}
function fechaSortKey(s) {
  const t = Date.parse(String(s || '').replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}
for (const [, list] of byChat) {
  list.sort((a, b) => fechaSortKey(a.fecha) - fechaSortKey(b.fecha));
}

const leadsMap = new Map();
for (const row of leadsRaw) {
  const chatId = String(row.chat_id || row.phone || '').trim();
  if (!chatId) continue;
  const canal = normCanal(row.canal_origen || row.source || 'telegram');
  let historial = (byChat.get(chatId) || []).map(
    ({ leadCompletoFila, ...rest }) => rest,
  );
  if (!historial.length && histJsonByChat.has(chatId)) {
    historial = historialFromJson(histJsonByChat.get(chatId), chatId);
  }
  const fromRow = parsePropSeg(
    row.propiedad_seguimiento || row.propiedad_id || row.propiedad,
  );
  leadsMap.set(chatId, {
    id: String(row.dedupe_key || canal + ':' + chatId),
    chatId,
    nombre: String(row.nombre || row.lead_name || 'Cliente').trim() || 'Cliente',
    zona: String(row.zona || '').trim(),
    presupuesto: String(row.presupuesto || '').trim(),
    canalOrigen: canal,
    temperatura:
      pickRawTemp(
        row.temperature,
        row.temperatura,
        (histMetaByChat.get(chatId) || {}).temperatura,
        (histMetaByChat.get(chatId) || {}).temperature,
      ) ||
      pickRawTemp(
        ...(historial || []).map((h) => h.temperatura || h.temperature).reverse(),
      ) ||
      tempFromHistorialJson(histJsonByChat.get(chatId)) ||
      'frio',
    leadCompleto: resolveLeadCompleto(row),
    estadoSeguimiento:
      String(row.estado_seguimiento || 'ninguno').trim().toLowerCase() ||
      'ninguno',
    status: String(row.status || 'abierto').trim(),
    tipoOperacion: String(row.tipo_operacion || row.operacion || '').trim(),
    ultimaActualizacion: String(
      row.ultima_actualizacion ||
        row.last_interaction_at ||
        row.updated_at ||
        '',
    ),
    lastMessage: String(row.last_message || ''),
    historial,
    propiedadId: fromRow.id,
    propiedadReferencia: fromRow.referencia,
  });
}

for (const [chatId, histFull] of byChat.entries()) {
  if (leadsMap.has(chatId)) continue;
  if (!histFull.length) continue;
  const last = histFull[histFull.length - 1];
  const algunaCompleta = histFull.some(
    (h) => h.leadCompletoFila === 'si' || h.leadCompletoFila === 'true',
  );
  const canal = normCanal(last.canal || 'telegram');
  leadsMap.set(chatId, {
    id: canal + ':' + chatId,
    chatId,
    nombre: 'Cliente',
    zona: '',
    presupuesto: '',
    canalOrigen: canal,
    temperatura:
      pickRawTemp(last.temperatura, last.temperature) ||
      tempFromHistorialJson(histJsonByChat.get(chatId)) ||
      'frio',
    leadCompleto: algunaCompleta,
    estadoSeguimiento: 'ninguno',
    status: 'abierto',
    tipoOperacion: '',
    ultimaActualizacion: String(last.fecha || ''),
    lastMessage: String(last.mensajeCliente || ''),
    historial: histFull.map(({ leadCompletoFila, ...rest }) => rest),
    propiedadId: '',
    propiedadReferencia: '',
  });
}

const leads = Array.from(leadsMap.values());

const propiedadesBase = stockRaw
  .map((row) => {
    const id = String(row.id ?? row.ID ?? row.codigo ?? '').trim();
    const zona = String(row.zona ?? row.Zona ?? row.barrio ?? '').trim();
    const tipo = String(row.tipo ?? row.Tipo ?? row.tipologia ?? '').trim();
    const precio = String(
      row.precio ?? row.Precio ?? row.precio_usd ?? '',
    ).trim();
    const ambientes = String(
      row.ambientes ?? row.Ambientes ?? row.dormitorios ?? row.Dormitorios ?? '',
    ).trim();
    const operacion = String(
      row.operacion ?? row.Operacion ?? row.tipo_operacion ?? '',
    ).trim();
    const estado = String(row.estado ?? row.Estado ?? '').trim();
    const descripcion = String(
      row.descripcion ?? row.Descripcion ?? row.detalle ?? '',
    ).trim();
    const honorarios = String(
      row.honorarios ?? row.Honorarios ?? row.comision ?? '',
    ).trim();
    const reserva = String(
      row.reserva ?? row.Reserva ?? row.sena ?? row['seña'] ?? '',
    ).trim();
    const mediosPago = String(
      row.medios_pago ?? row.mediosPago ?? row.forma_pago ?? '',
    ).trim();
    const aliasCbu = String(
      row.alias_cbu ?? row.alias ?? row.cbu ?? row.CBU ?? '',
    ).trim();
    const requisitos = String(
      row.requisitos ?? row.Requisitos ?? '',
    ).trim();
    if (!id && !zona && !tipo && !precio) return null;
    return {
      id: id || (zona + '-' + tipo + '-' + precio).slice(0, 48) || 'sin-id',
      zona,
      tipo,
      precio,
      ambientes,
      operacion,
      estado: estado || undefined,
      descripcion: descripcion || undefined,
      honorarios: honorarios || undefined,
      reserva: reserva || undefined,
      mediosPago: mediosPago || undefined,
      aliasCbu: aliasCbu || undefined,
      requisitos: requisitos || undefined,
    };
  })
  .filter(Boolean);

function leadMatchesProp(lead, prop) {
  const pid = normKey(lead.propiedadId);
  const pref = normKey(lead.propiedadReferencia);
  const propId = normKey(prop.id);
  const propZona = normKey(prop.zona);
  const propTipo = normKey(prop.tipo);
  if (
    pid &&
    propId &&
    (pid === propId || pid.includes(propId) || propId.includes(pid))
  )
    return true;
  if (pref && propId && pref.includes(propId)) return true;
  if (
    pref &&
    propZona &&
    pref.includes(propZona) &&
    (!propTipo || pref.includes(propTipo))
  )
    return true;
  return false;
}

const propiedades = propiedadesBase.map((prop) => {
  const interesados = leads
    .filter((l) => leadMatchesProp(l, prop))
    .map((l) => ({
      id: l.id,
      chatId: l.chatId,
      nombre: l.nombre,
      temperatura: l.temperatura,
      canalOrigen: l.canalOrigen,
      leadCompleto: l.leadCompleto,
      zona: l.zona,
      presupuesto: l.presupuesto,
      ultimaActualizacion: l.ultimaActualizacion,
    }));
  return { ...prop, interesadosCount: interesados.length, interesados };
});

const warnings = [];
if (leadsError) warnings.push('leads: ' + leadsError);
if (stockError) {
  if (stockSource === 'stale-cache') {
    warnings.push(
      'stock: cuota/Sheets limitado — mostrando caché reciente. ' + stockError,
    );
  } else {
    warnings.push('stock: ' + stockError);
  }
}

// Si leads fallaron por cuota pero hay caché completa, usarla
if (
  (!leads.length || !propiedades.length) &&
  staticData.fullCache &&
  staticData.fullCache.payload &&
  (leadsError || stockError)
) {
  const stale = staticData.fullCache.payload;
  return [
    {
      json: {
        generatedAt: new Date().toISOString(),
        leads: leads.length ? leads : stale.leads || [],
        propiedades: propiedades.length
          ? propiedades
          : stale.propiedades || [],
        stockSource: stockSource === 'none' ? 'stale-full-cache' : stockSource,
        stockCachedAt: staticData.stockCache?.at
          ? new Date(staticData.stockCache.at).toISOString()
          : undefined,
        stockTtlMs: STOCK_TTL_MS,
        warning: warnings.length
          ? warnings.join(' | ') + ' | usando caché previa'
          : 'usando caché previa',
      },
    },
  ];
}

const payloadOut = {
  generatedAt: new Date().toISOString(),
  leads,
  propiedades,
  stockSource,
  stockCachedAt: staticData.stockCache?.at
    ? new Date(staticData.stockCache.at).toISOString()
    : undefined,
  stockTtlMs: STOCK_TTL_MS,
  warning: warnings.length ? warnings.join(' | ') : undefined,
};

if (leads.length || propiedades.length) {
  staticData.fullCache = {
    at: now,
    payload: {
      leads: payloadOut.leads,
      propiedades: payloadOut.propiedades,
      warning: payloadOut.warning,
      stockSource: payloadOut.stockSource,
      stockCachedAt: payloadOut.stockCachedAt,
      stockTtlMs: STOCK_TTL_MS,
    },
  };
}

return [{ json: payloadOut }];
