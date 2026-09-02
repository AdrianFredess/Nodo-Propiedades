import { getMockPayload } from '../../data/seed';
import propiedadMedia from '../../data/propiedadMedia.json';
import { extractHighlights } from '../lib/propiedadInfo';
import {
  normalizeCanal,
  normalizeEstadoSeguimiento,
  normalizeLeadCompleto,
  normalizeTemperatura,
} from '../lib/labels';
import type {
  EnvioMasivoRequest,
  EnvioMasivoResponse,
  HistorialMensaje,
  Lead,
  LeadInteresadoResumen,
  LeadsPayload,
  Propiedad,
} from '../types/lead';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = import.meta.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

function envUrl(name: string, fallback: string): string {
  const raw = import.meta.env[name];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
}

export const config = {
  useMock: envFlag('VITE_USE_MOCK', false),
  leadsApiUrl: envUrl(
    'VITE_LEADS_API_URL',
    'http://localhost:5678/webhook/panel-leads',
  ),
  envioMasivoUrl: envUrl(
    'VITE_ENVIO_MASIVO_URL',
    'http://localhost:5678/webhook/envio-masivo',
  ),
  stockUpdateUrl: envUrl(
    'VITE_STOCK_UPDATE_URL',
    'http://localhost:5678/webhook/panel-stock-update',
  ),
  leadActionsUrl: envUrl(
    'VITE_LEAD_ACTIONS_URL',
    'http://localhost:5678/webhook/panel-lead-actions',
  ),
  /** Header X-Panel-Token — vacío = no enviar (auth off en n8n si PANEL_API_TOKEN vacío) */
  panelApiToken: envUrl('VITE_PANEL_API_TOKEN', ''),
  /** ws://localhost:3099/ws — vacío desactiva realtime */
  wsUrl: envUrl('VITE_WS_URL', 'ws://127.0.0.1:3099/ws'),
  /** http://127.0.0.1:3099/emit — el panel puede emitir tras enviar */
  wsEmitUrl: envUrl('VITE_WS_EMIT_URL', 'http://127.0.0.1:3099/emit'),
  pollIntervalMs: Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 45_000,
  /** Polling suave mientras el WS está conectado (ahorra cuota Sheets). */
  pollIntervalWsMs:
    Number(import.meta.env.VITE_POLL_INTERVAL_WS_MS) || 120_000,
};

function panelHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(extra ?? {}),
  };
  if (config.panelApiToken) {
    headers['X-Panel-Token'] = config.panelApiToken;
  }
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

export function mapHistorial(raw: unknown): HistorialMensaje[] {
  if (!Array.isArray(raw)) return [];

  // Formato rol/content (historial_json canónico) → pares cliente/bot
  const looksRoleBased = raw.some((item) => {
    const r = asRecord(item);
    return Boolean(r.role || r.content);
  });
  if (looksRoleBased) {
    const paired: HistorialMensaje[] = [];
    let pendingUser = '';
    let pendingFecha = '';
    let idx = 0;
    for (const item of raw) {
      const r = asRecord(item);
      const role = String(r.role ?? '').toLowerCase();
      const content = String(r.content ?? r.mensaje ?? '').trim();
      const fecha = String(
        r.fecha ?? r.ts ?? r.timestamp ?? r.date ?? r.created_at ?? '',
      );
      if (!content) continue;
      if (role === 'user' || role === 'cliente') {
        if (pendingUser) {
          paired.push({
            id: String(r.id ?? `h-${idx++}`),
            fecha: pendingFecha,
            mensajeCliente: pendingUser,
            respuestaBot: '',
          });
        }
        pendingUser = content;
        pendingFecha = fecha;
      } else if (role === 'assistant' || role === 'bot') {
        paired.push({
          id: String(r.id ?? `h-${idx++}`),
          fecha: fecha || pendingFecha,
          mensajeCliente: pendingUser,
          respuestaBot: content,
        });
        pendingUser = '';
        pendingFecha = '';
      }
    }
    if (pendingUser) {
      paired.push({
        id: `h-${idx++}`,
        fecha: pendingFecha,
        mensajeCliente: pendingUser,
        respuestaBot: '',
      });
    }
    return paired;
  }

  return raw.map((item, index) => {
    const r = asRecord(item);
    return {
      id: String(r.id ?? `h-${index}`),
      fecha: String(
        r.fecha ??
          r.fecha_local ??
          r.timestamp ??
          r.ts ??
          r.date ??
          r.created_at ??
          '',
      ),
      mensajeCliente: String(r.mensajeCliente ?? r.mensaje_cliente ?? ''),
      respuestaBot: String(
        r.respuestaBot ?? r.respuesta_bot ?? r.respuesta_wa ?? '',
      ),
      temperatura: r.temperatura
        ? normalizeTemperatura(r.temperatura)
        : undefined,
      canal: r.canal ? String(r.canal) : undefined,
    };
  });
}

function mapInteresado(raw: unknown): LeadInteresadoResumen | null {
  const r = asRecord(raw);
  const chatId = String(r.chatId ?? r.chat_id ?? '').trim();
  const id = String(r.id ?? '').trim();
  if (!id && !chatId) return null;
  const canal = normalizeCanal(r.canalOrigen ?? r.canal_origen ?? r.source);
  return {
    id: id || `${canal}:${chatId}`,
    chatId,
    nombre: String(r.nombre ?? r.lead_name ?? 'Cliente').trim() || 'Cliente',
    temperatura: normalizeTemperatura(r.temperatura ?? r.temperature),
    canalOrigen: canal,
    leadCompleto: normalizeLeadCompleto(
      r.leadCompleto ?? r.lead_completo ?? true,
    ),
    zona: String(r.zona ?? '').trim(),
    presupuesto: String(r.presupuesto ?? '').trim(),
    ultimaActualizacion: String(
      r.ultimaActualizacion ?? r.ultima_actualizacion ?? '',
    ),
  };
}

function mediaString(
  mediaRec: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!mediaRec) return '';
  for (const k of keys) {
    const v = String(mediaRec[k] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function mediaStringList(
  mediaRec: Record<string, unknown> | undefined,
  key: string,
): string[] | undefined {
  const v = mediaRec?.[key];
  if (!Array.isArray(v)) return undefined;
  const list = v.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function mapPropiedad(raw: unknown): Propiedad | null {
  const r = asRecord(raw);
  const id = String(r.id ?? r.ID ?? r.codigo ?? '').trim();
  const zona = String(r.zona ?? r.Zona ?? r.barrio ?? '').trim();
  const tipo = String(r.tipo ?? r.Tipo ?? r.tipologia ?? '').trim();
  const precio = String(r.precio ?? r.Precio ?? r.precio_usd ?? '').trim();
  const mediaKey = id || '';
  const media =
    propiedadMedia[mediaKey as keyof typeof propiedadMedia] ?? undefined;
  const mediaRec =
    media && typeof media === 'object'
      ? (media as Record<string, unknown>)
      : undefined;
  const ambientes = String(
    r.ambientes ??
      r.Ambientes ??
      mediaRec?.ambientes ??
      '',
  ).trim();
  const operacion = String(
    r.operacion ?? r.Operacion ?? r.tipo_operacion ?? '',
  ).trim();
  if (!id && !zona && !tipo && !precio) return null;
  const interesadosRaw = Array.isArray(r.interesados) ? r.interesados : [];
  const interesados = interesadosRaw
    .map(mapInteresado)
    .filter((i): i is LeadInteresadoResumen => i !== null);
  const pick = (csvVal: string, mediaKeyName: string): string =>
    csvVal || String(mediaRec?.[mediaKeyName] ?? '').trim();
  const descripcion =
    String(r.descripcion ?? '').trim() ||
    String(mediaRec?.descripcion ?? '').trim() ||
    undefined;
  const precioUsdRaw = r.precioUsd ?? r.precio_usd ?? mediaRec?.precioUsd;
  const precioUsdNum = Number(precioUsdRaw);
  const precioUsd =
    typeof precioUsdRaw === 'number'
      ? precioUsdRaw
      : Number.isFinite(precioUsdNum) && String(precioUsdRaw ?? '').trim() !== ''
        ? precioUsdNum
        : undefined;
  const mediaHighlights = mediaStringList(mediaRec, 'highlights');
  const highlights = extractHighlights(descripcion, mediaHighlights, pick(tipo, 'tipo'));
  return {
    id: id || `${zona}-${tipo}-${precio}`.slice(0, 48) || 'sin-id',
    zona: pick(zona, 'zona'),
    tipo: pick(tipo, 'tipo'),
    precio: pick(precio, 'precio'),
    ambientes,
    operacion: pick(operacion, 'operacion'),
    estado: String(r.estado ?? r.Estado ?? '').trim() || undefined,
    descripcion,
    honorarios: String(r.honorarios ?? '').trim() || undefined,
    reserva: String(r.reserva ?? '').trim() || undefined,
    mediosPago:
      String(r.mediosPago ?? r.medios_pago ?? '').trim() || undefined,
    aliasCbu: String(r.aliasCbu ?? r.alias_cbu ?? r.cbu ?? '').trim() || undefined,
    requisitos: String(r.requisitos ?? '').trim() || undefined,
    fotos: Array.isArray(mediaRec?.fotos)
      ? (mediaRec.fotos as string[])
      : undefined,
    linkFicha: mediaRec?.linkFicha ? String(mediaRec.linkFicha) : undefined,
    titulo: mediaString(mediaRec, 'titulo') || undefined,
    caption: mediaString(mediaRec, 'caption') || undefined,
    precioUsd:
      typeof precioUsd === 'number' && Number.isFinite(precioUsd)
        ? precioUsd
        : undefined,
    direccion:
      String(r.direccion ?? r.address ?? '').trim() ||
      mediaString(mediaRec, 'direccion', 'address') ||
      undefined,
    metrosCuadrados:
      String(r.metrosCuadrados ?? r.area_m2 ?? r.m2 ?? '').trim() ||
      mediaString(mediaRec, 'metrosCuadrados', 'area_m2', 'm2') ||
      undefined,
    dormitorios:
      String(r.dormitorios ?? r.bedrooms ?? '').trim() ||
      mediaString(mediaRec, 'dormitorios', 'bedrooms') ||
      undefined,
    banos:
      String(r.banos ?? r.bathrooms ?? '').trim() ||
      mediaString(mediaRec, 'banos', 'bathrooms') ||
      undefined,
    expensas:
      String(r.expensas ?? r.expenses ?? '').trim() ||
      mediaString(mediaRec, 'expensas', 'expenses') ||
      undefined,
    highlights: highlights.length ? highlights : undefined,
    interesados,
    interesadosCount:
      typeof r.interesadosCount === 'number'
        ? r.interesadosCount
        : interesados.length,
  };
}

export function mapLead(raw: unknown): Lead | null {
  const r = asRecord(raw);
  const chatId = String(r.chatId ?? r.chat_id ?? '').trim();
  if (!chatId && !r.id) return null;
  const canal = normalizeCanal(r.canalOrigen ?? r.canal_origen ?? r.source);
  const propiedadReferenciaRaw = String(
    r.propiedadReferencia ?? r.propiedad_referencia ?? r.propiedad_seguimiento ?? '',
  ).trim();
  let propiedadId = String(r.propiedadId ?? r.propiedad_id ?? '').trim();
  let propiedadReferencia = propiedadReferenciaRaw;
  if (!propiedadId && propiedadReferenciaRaw.startsWith('{')) {
    try {
      const seg = JSON.parse(propiedadReferenciaRaw);
      if (seg?.id) propiedadId = String(seg.id).trim();
      if (seg?.referencia) propiedadReferencia = String(seg.referencia).trim();
    } catch {
      /* keep raw */
    }
  }
  if (!propiedadId) {
    const m = propiedadReferenciaRaw.match(/\b(MZA-\d{3})\b/i);
    if (m) propiedadId = m[0].toUpperCase();
  }
  return {
    id: String(r.id ?? `${canal}:${chatId}`),
    chatId,
    nombre: String(r.nombre ?? r.lead_name ?? 'Cliente').trim() || 'Cliente',
    zona: String(r.zona ?? '').trim(),
    presupuesto: String(r.presupuesto ?? '').trim(),
    canalOrigen: canal,
    temperatura: normalizeTemperatura(r.temperatura ?? r.temperature),
    leadCompleto: normalizeLeadCompleto(
      r.leadCompleto ?? r.lead_completo ?? true,
    ),
    estadoSeguimiento: normalizeEstadoSeguimiento(
      r.estadoSeguimiento ?? r.estado_seguimiento,
    ),
    status: String(r.status ?? 'abierto').trim(),
    tipoOperacion: String(r.tipoOperacion ?? r.tipo_operacion ?? '').trim(),
    ultimaActualizacion: String(
      r.ultimaActualizacion ??
        r.ultima_actualizacion ??
        r.last_interaction_at ??
        '',
    ),
    lastMessage: String(r.lastMessage ?? r.last_message ?? '').trim(),
    historial: mapHistorial(r.historial),
    propiedadId: propiedadId || undefined,
    propiedadReferencia: propiedadReferencia || undefined,
  };
}

/**
 * Filtra filas de prueba / seeds viejos que quedaron en Sheets o caché PANEL-01.
 * Borrarlas también en Google Sheets (Leads_Bot) para no recargarlas.
 */
export function isJunkLeadKey(
  chatId: string,
  id: string,
  nombre: string,
): boolean {
  const chat = chatId.trim().toUpperCase();
  const leadId = id.trim().toUpperCase();
  const name = nombre.trim().toLowerCase();

  if (chat.startsWith('TEST_SEG') || leadId.includes('TEST_SEG')) return true;
  if (/^TEST[_-]/.test(chat) || /[:/]TEST[_-]/.test(leadId)) return true;
  if (chat.includes('5492619999999') || leadId.includes('5492619999999')) {
    return true;
  }
  if (name === 'cliente test' || name.startsWith('prueba ')) return true;
  // Nombres del seed histórico (si alguien los re-sembró en Sheets)
  if (
    name === 'carla méndez' ||
    name === 'diego conversando' ||
    name === 'martín ríos' ||
    name === 'martin rios' ||
    name === 'sofía blanco' ||
    name === 'sofia blanco' ||
    name === 'solo miraba'
  ) {
    return true;
  }
  return false;
}

export function isJunkLead(lead: Lead): boolean {
  return isJunkLeadKey(lead.chatId, lead.id, lead.nombre);
}

function scrubInteresados(propiedades: Propiedad[]): Propiedad[] {
  return propiedades.map((p) => {
    const interesados = (p.interesados ?? []).filter(
      (i) => !isJunkLeadKey(i.chatId, i.id, i.nombre),
    );
    return {
      ...p,
      interesados,
      interesadosCount: interesados.length,
    };
  });
}

function mapPayload(data: unknown, source: 'live' | 'mock'): LeadsPayload {
  const root = asRecord(data);
  const list = Array.isArray(root.leads) ? root.leads : [];
  const leads = list
    .map(mapLead)
    .filter((lead): lead is Lead => lead !== null)
    .filter((lead) => !isJunkLead(lead));
  const propRaw = Array.isArray(root.propiedades) ? root.propiedades : [];
  const propiedades = scrubInteresados(
    propRaw
      .map(mapPropiedad)
      .filter((p): p is Propiedad => p !== null),
  );
  return {
    generatedAt: String(root.generatedAt ?? new Date().toISOString()),
    leads,
    propiedades,
    source,
    warning: root.warning ? String(root.warning) : undefined,
  };
}

export async function fetchLeads(): Promise<LeadsPayload> {
  if (config.useMock) {
    return getMockPayload();
  }

  const response = await fetch(config.leadsApiUrl, {
    method: 'GET',
    headers: panelHeaders(),
  });

  if (!response.ok) {
    throw new Error(`No se pudieron cargar los leads (${response.status})`);
  }

  const data: unknown = await response.json();
  return mapPayload(data, 'live');
}

export interface StockUpdateRequest {
  id: string;
  field?: string;
  value?: string;
  patch?: Record<string, string>;
}

export interface StockUpdateResponse {
  ok: boolean;
  id?: string;
  patch?: Record<string, string>;
  error?: string;
}

export async function updateStockCell(
  body: StockUpdateRequest,
): Promise<StockUpdateResponse> {
  if (config.useMock) {
    await new Promise((r) => setTimeout(r, 200));
    return {
      ok: true,
      id: body.id,
      patch: body.patch ?? (body.field ? { [body.field]: String(body.value ?? '') } : {}),
    };
  }

  const response = await fetch(config.stockUpdateUrl, {
    method: 'POST',
    headers: panelHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json().catch(() => ({}));
  const parsed = asRecord(data);

  if (!response.ok || parsed.ok === false) {
    return {
      ok: false,
      error: String(parsed.error ?? `HTTP ${response.status}`),
    };
  }

  return {
    ok: true,
    id: parsed.id ? String(parsed.id) : body.id,
    patch:
      parsed.patch && typeof parsed.patch === 'object'
        ? (parsed.patch as Record<string, string>)
        : body.patch,
  };
}

/** Emite evento al ws-bridge (no bloquea UX si falla). */
export async function emitRealtime(
  type: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!config.wsEmitUrl || config.useMock) return false;
  try {
    const response = await fetch(config.wsEmitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ type, payload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendTelegramBroadcast(
  body: EnvioMasivoRequest,
): Promise<EnvioMasivoResponse> {
  if (config.useMock) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      ok: true,
      sent: body.chat_ids.length,
      failed: 0,
      results: body.chat_ids.map((chat_id) => ({
        chat_id,
        ok: true,
        description: 'enviado (simulado)',
      })),
    };
  }

  const response = await fetch(config.envioMasivoUrl, {
    method: 'POST',
    headers: panelHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json().catch(() => ({}));
  const parsed = asRecord(data);

  if (!response.ok) {
    return {
      ok: false,
      error: String(parsed.error ?? `HTTP ${response.status}`),
      results: Array.isArray(parsed.results)
        ? (parsed.results as EnvioMasivoResponse['results'])
        : [],
    };
  }

  return {
    ok: Boolean(parsed.ok ?? true),
    sent: typeof parsed.sent === 'number' ? parsed.sent : undefined,
    failed: typeof parsed.failed === 'number' ? parsed.failed : undefined,
    error: parsed.error ? String(parsed.error) : undefined,
    results: Array.isArray(parsed.results)
      ? (parsed.results as EnvioMasivoResponse['results'])
      : [],
  };
}

export interface LeadActionResponse {
  ok: boolean;
  error?: string;
  action?: string;
  chat_id?: string;
  estado_seguimiento?: string | null;
  status?: string | null;
}

export async function sendWhatsAppMessage(input: {
  chatId: string;
  text: string;
}): Promise<LeadActionResponse> {
  if (config.useMock) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, action: 'send_whatsapp', chat_id: input.chatId };
  }
  const response = await fetch(config.leadActionsUrl, {
    method: 'POST',
    headers: panelHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      action: 'send_whatsapp',
      chat_id: input.chatId,
      text: input.text,
    }),
  });
  const data: unknown = await response.json().catch(() => ({}));
  const parsed = asRecord(data);
  if (!response.ok || parsed.ok === false) {
    return {
      ok: false,
      error: String(parsed.error ?? `HTTP ${response.status}`),
    };
  }
  return {
    ok: true,
    action: 'send_whatsapp',
    chat_id: parsed.chat_id ? String(parsed.chat_id) : input.chatId,
  };
}

export async function updateLeadSeguimiento(input: {
  chatId: string;
  estadoSeguimiento?: string;
  status?: string;
}): Promise<LeadActionResponse> {
  if (config.useMock) {
    await new Promise((r) => setTimeout(r, 250));
    return {
      ok: true,
      action: 'update_seguimiento',
      chat_id: input.chatId,
      estado_seguimiento: input.estadoSeguimiento ?? null,
      status: input.status ?? null,
    };
  }
  const response = await fetch(config.leadActionsUrl, {
    method: 'POST',
    headers: panelHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      action: 'update_seguimiento',
      chat_id: input.chatId,
      estado_seguimiento: input.estadoSeguimiento,
      status: input.status,
    }),
  });
  const data: unknown = await response.json().catch(() => ({}));
  const parsed = asRecord(data);
  if (!response.ok || parsed.ok === false) {
    return {
      ok: false,
      error: String(parsed.error ?? `HTTP ${response.status}`),
    };
  }
  return {
    ok: true,
    action: 'update_seguimiento',
    chat_id: parsed.chat_id ? String(parsed.chat_id) : input.chatId,
    estado_seguimiento: parsed.estado_seguimiento
      ? String(parsed.estado_seguimiento)
      : input.estadoSeguimiento ?? null,
    status: parsed.status ? String(parsed.status) : input.status ?? null,
  };
}
