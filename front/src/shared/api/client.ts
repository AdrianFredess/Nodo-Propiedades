import { getMockPayload } from '../../data/seed';
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
  /** ws://localhost:3099/ws — vacío desactiva realtime */
  wsUrl: envUrl('VITE_WS_URL', 'ws://127.0.0.1:3099/ws'),
  /** http://127.0.0.1:3099/emit — el panel puede emitir tras enviar */
  wsEmitUrl: envUrl('VITE_WS_EMIT_URL', 'http://127.0.0.1:3099/emit'),
  pollIntervalMs: Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 45_000,
  /** Polling suave mientras el WS está conectado (ahorra cuota Sheets). */
  pollIntervalWsMs:
    Number(import.meta.env.VITE_POLL_INTERVAL_WS_MS) || 120_000,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function mapHistorial(raw: unknown): HistorialMensaje[] {
  if (!Array.isArray(raw)) return [];
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

function mapPropiedad(raw: unknown): Propiedad | null {
  const r = asRecord(raw);
  const id = String(r.id ?? r.ID ?? r.codigo ?? '').trim();
  const zona = String(r.zona ?? r.Zona ?? r.barrio ?? '').trim();
  const tipo = String(r.tipo ?? r.Tipo ?? r.tipologia ?? '').trim();
  const precio = String(r.precio ?? r.Precio ?? r.precio_usd ?? '').trim();
  const ambientes = String(
    r.ambientes ?? r.Ambientes ?? r.dormitorios ?? r.Dormitorios ?? '',
  ).trim();
  const operacion = String(
    r.operacion ?? r.Operacion ?? r.tipo_operacion ?? '',
  ).trim();
  if (!id && !zona && !tipo && !precio) return null;
  const interesadosRaw = Array.isArray(r.interesados) ? r.interesados : [];
  const interesados = interesadosRaw
    .map(mapInteresado)
    .filter((i): i is LeadInteresadoResumen => i !== null);
  return {
    id: id || `${zona}-${tipo}-${precio}`.slice(0, 48) || 'sin-id',
    zona,
    tipo,
    precio,
    ambientes,
    operacion,
    estado: String(r.estado ?? r.Estado ?? '').trim() || undefined,
    descripcion: String(r.descripcion ?? '').trim() || undefined,
    honorarios: String(r.honorarios ?? '').trim() || undefined,
    reserva: String(r.reserva ?? '').trim() || undefined,
    mediosPago:
      String(r.mediosPago ?? r.medios_pago ?? '').trim() || undefined,
    aliasCbu: String(r.aliasCbu ?? r.alias_cbu ?? r.cbu ?? '').trim() || undefined,
    requisitos: String(r.requisitos ?? '').trim() || undefined,
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
  const propiedadId = String(
    r.propiedadId ?? r.propiedad_id ?? '',
  ).trim();
  const propiedadReferencia = String(
    r.propiedadReferencia ?? r.propiedad_referencia ?? r.propiedad_seguimiento ?? '',
  ).trim();
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

function mapPayload(data: unknown, source: 'live' | 'mock'): LeadsPayload {
  const root = asRecord(data);
  const list = Array.isArray(root.leads) ? root.leads : [];
  const leads = list
    .map(mapLead)
    .filter((lead): lead is Lead => lead !== null);
  const propRaw = Array.isArray(root.propiedades) ? root.propiedades : [];
  const propiedades = propRaw
    .map(mapPropiedad)
    .filter((p): p is Propiedad => p !== null);
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
    headers: { Accept: 'application/json' },
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
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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
