import { useCallback, useEffect, useRef, useState } from 'react';
import { config, fetchLeads, mapHistorial } from '../api/client';
import {
  normalizeCanal,
  normalizeEstadoSeguimiento,
  normalizeTemperatura,
} from '../lib/labels';
import type { HistorialMensaje, Lead, LeadsPayload, Propiedad } from '../types/lead';
import {
  useRealtime,
  type RealtimeEvent,
  type RealtimeStatus,
} from './useRealtime';

function localNowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Sheets OAuth inválido / vencido → PANEL-01 solo sirve caché vieja. */
function isSheetsAuthBroken(warning?: string | null): boolean {
  if (!warning) return false;
  return /authorization grant|refresh token is invalid|invalid_grant|expired, revoked|oauth/i.test(
    warning,
  );
}

function parseHistorialJson(raw: unknown): HistorialMensaje[] {
  if (Array.isArray(raw)) return mapHistorial(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return mapHistorial(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function stubLeadFromChat(input: {
  chatId: string;
  leadId?: string;
  nombre?: string;
  source?: string;
  at: string;
  text: string;
  side: 'client' | 'bot';
  temperatura?: string;
  presupuesto?: string;
  status?: string;
  historial?: HistorialMensaje[];
}): Lead {
  const canal = normalizeCanal(input.source || 'telegram');
  const historial =
    input.historial?.length && input.historial.length > 0
      ? input.historial
      : [
          {
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            fecha: input.at,
            mensajeCliente: input.side === 'client' ? input.text : '',
            respuestaBot: input.side === 'bot' ? input.text : '',
            pending: true,
          },
        ];
  const last = historial[historial.length - 1];
  const lastMessage =
    last?.respuestaBot.trim() ||
    last?.mensajeCliente.trim() ||
    input.text;
  return {
    id: input.leadId || `${canal}:${input.chatId}`,
    chatId: input.chatId,
    nombre: (input.nombre || 'Cliente').trim() || 'Cliente',
    zona: '',
    presupuesto: input.presupuesto?.trim() || '',
    canalOrigen: canal,
    temperatura: normalizeTemperatura(input.temperatura),
    leadCompleto: false,
    estadoSeguimiento: 'ninguno',
    status: (input.status || 'abierto').trim() || 'abierto',
    tipoOperacion: '',
    ultimaActualizacion: input.at,
    lastMessage,
    historial,
  };
}

function recentDuplicate(
  historial: HistorialMensaje[],
  text: string,
  side: 'client' | 'bot',
): boolean {
  const needle = text.trim();
  if (!needle) return true;
  for (let i = historial.length - 1; i >= Math.max(0, historial.length - 4); i -= 1) {
    const row = historial[i];
    const field =
      side === 'bot' ? row.respuestaBot.trim() : row.mensajeCliente.trim();
    if (field === needle) return true;
  }
  return false;
}

function isPendingMsg(m: HistorialMensaje): boolean {
  return m.pending === true || String(m.id).startsWith('live-');
}

function bubbleKey(m: HistorialMensaje): string | null {
  const bot = m.respuestaBot.trim();
  const client = m.mensajeCliente.trim();
  if (bot) return `bot:${bot}`;
  if (client) return `client:${client}`;
  return null;
}

/** Conserva mensajes optimistic/pending que Sheets aún no devolvió. */
function mergeHistorial(
  server: HistorialMensaje[],
  local: HistorialMensaje[] | undefined,
): HistorialMensaje[] {
  if (!local?.length) return server;
  const serverKeys = new Set(
    server.map(bubbleKey).filter((k): k is string => Boolean(k)),
  );
  const pending = local.filter((m) => {
    if (!isPendingMsg(m)) return false;
    const key = bubbleKey(m);
    return Boolean(key) && !serverKeys.has(key as string);
  });
  if (!pending.length) return server;
  return [...server, ...pending];
}

function mergeLeadsFromRefresh(
  prev: LeadsPayload | null,
  next: LeadsPayload,
  sheetsBroken: boolean,
): LeadsPayload {
  if (!prev?.leads?.length) return next;
  const byId = new Map(prev.leads.map((l) => [l.id, l]));
  const byChat = new Map<string, Lead>();
  for (const l of prev.leads) {
    if (l.chatId) byChat.set(l.chatId, l);
  }

  const seen = new Set<string>();
  const leads = next.leads.map((serverLead) => {
    const local =
      byId.get(serverLead.id) ??
      (serverLead.chatId ? byChat.get(serverLead.chatId) : undefined);
    if (local) {
      seen.add(local.id);
      if (local.chatId) seen.add(`chat:${local.chatId}`);
    }
    if (!local?.historial?.length) return serverLead;

    // OAuth caído: no pisar historial local (WS / staticData) con caché vieja.
    if (sheetsBroken && local) {
      const localPending = local.historial.some(isPendingMsg);
      const localLonger = local.historial.length > serverLead.historial.length;
      const localFresher =
        Boolean(local.ultimaActualizacion) &&
        local.ultimaActualizacion !== serverLead.ultimaActualizacion;
      const localChatMoved =
        Boolean(local.lastMessage) &&
        local.lastMessage !== serverLead.lastMessage;
      if (localPending || localLonger || localFresher || localChatMoved) {
        return {
          ...serverLead,
          nombre: local.nombre || serverLead.nombre,
          temperatura: local.temperatura || serverLead.temperatura,
          presupuesto: local.presupuesto || serverLead.presupuesto,
          status: local.status || serverLead.status,
          leadCompleto: local.leadCompleto,
          historial: local.historial,
          lastMessage: local.lastMessage || serverLead.lastMessage,
          ultimaActualizacion:
            local.ultimaActualizacion || serverLead.ultimaActualizacion,
        };
      }
    }

    const historial = mergeHistorial(serverLead.historial, local.historial);
    if (historial === serverLead.historial) return serverLead;

    const last = historial[historial.length - 1];
    const lastMessage = last
      ? last.respuestaBot.trim() ||
        last.mensajeCliente.trim() ||
        serverLead.lastMessage
      : serverLead.lastMessage;

    return {
      ...serverLead,
      historial,
      lastMessage,
      ultimaActualizacion:
        last && isPendingMsg(last) && last.fecha
          ? last.fecha
          : serverLead.ultimaActualizacion,
    };
  });

  // Leads creados solo por WS (aún no en caché Sheets)
  if (sheetsBroken) {
    for (const local of prev.leads) {
      if (seen.has(local.id)) continue;
      if (local.chatId && seen.has(`chat:${local.chatId}`)) continue;
      if (!local.historial.some(isPendingMsg) && local.historial.length === 0) {
        continue;
      }
      leads.unshift(local);
    }
  }

  return { ...next, leads };
}

export interface AppendChatMessageInput {
  chatId?: string;
  leadId?: string;
  text: string;
  side: 'client' | 'bot';
  at?: string;
  source?: string;
}

interface UseLeadsResult {
  leads: Lead[];
  propiedades: Propiedad[];
  payload: LeadsPayload | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => Promise<Lead[]>;
  findLead: (leadId: string) => Lead | undefined;
  patchPropiedad: (id: string, patch: Partial<Propiedad>) => void;
  patchLead: (id: string, patch: Partial<Lead>) => void;
  appendChatMessage: (input: AppendChatMessageInput) => boolean;
  realtimeStatus: RealtimeStatus;
}

const FIELD_TO_PROP: Record<string, keyof Propiedad> = {
  zona: 'zona',
  tipo: 'tipo',
  operacion: 'operacion',
  precio: 'precio',
  ambientes: 'ambientes',
  estado: 'estado',
  descripcion: 'descripcion',
  honorarios: 'honorarios',
  reserva: 'reserva',
  medios_pago: 'mediosPago',
  mediosPago: 'mediosPago',
  alias_cbu: 'aliasCbu',
  aliasCbu: 'aliasCbu',
  requisitos: 'requisitos',
};

export function useLeads(): UseLeadsResult {
  const [payload, setPayload] = useState<LeadsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const leadCache = useRef<Map<string, Lead>>(new Map());
  const propsCache = useRef<Propiedad[]>([]);
  const backoffUntil = useRef(0);
  const wsOpen = useRef(false);
  const refreshRef = useRef<() => Promise<Lead[]>>(async () => []);
  const refreshInFlight = useRef(false);
  const softRefreshTimer = useRef<number | undefined>(undefined);
  const lastSoftRefreshAt = useRef(0);
  const sheetsBrokenRef = useRef(false);

  const scheduleSoftRefresh = useCallback((delayMs: number) => {
    // Con Sheets OAuth roto el GET solo trae caché vieja → no pisar WS.
    if (sheetsBrokenRef.current) return;
    // Con WS vivo: refresh corto; sin martillar Sheets.
    const minGap = wsOpen.current ? 800 : 500;
    const wait = Math.max(
      delayMs,
      minGap - (Date.now() - lastSoftRefreshAt.current),
    );
    if (softRefreshTimer.current) window.clearTimeout(softRefreshTimer.current);
    softRefreshTimer.current = window.setTimeout(() => {
      if (refreshInFlight.current) {
        // Reintentar apenas termine el fetch en curso
        scheduleSoftRefresh(400);
        return;
      }
      lastSoftRefreshAt.current = Date.now();
      void refreshRef.current();
    }, Math.max(0, wait));
  }, []);

  const patchPropiedad = useCallback((id: string, patch: Partial<Propiedad>) => {
    setPayload((prev) => {
      const baseProps =
        prev?.propiedades?.length ? prev.propiedades : propsCache.current;
      const nextProps = baseProps.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      propsCache.current = nextProps;
      if (!prev) {
        return {
          generatedAt: new Date().toISOString(),
          leads: [],
          propiedades: nextProps,
          source: 'live',
        };
      }
      return { ...prev, propiedades: nextProps };
    });
  }, []);

  const patchLead = useCallback((id: string, patch: Partial<Lead>) => {
    setPayload((prev) => {
      if (!prev) return prev;
      const nextLeads = prev.leads.map((lead) => {
        if (lead.id !== id && lead.chatId !== id) return lead;
        const merged = { ...lead, ...patch };
        leadCache.current.set(merged.id, merged);
        if (merged.chatId) leadCache.current.set(`chat:${merged.chatId}`, merged);
        return merged;
      });
      return { ...prev, leads: nextLeads };
    });
  }, []);

  const applyStockEvent = useCallback(
    (raw: unknown) => {
      const r =
        raw !== null && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : {};
      const id = String(r.id ?? '').trim();
      if (!id) return;
      const patchRaw =
        r.patch !== null && typeof r.patch === 'object'
          ? (r.patch as Record<string, unknown>)
          : r;
      const patch: Partial<Propiedad> = {};
      for (const [k, v] of Object.entries(patchRaw)) {
        if (k === 'id' || k === 'source' || k === 'patch') continue;
        const propKey = FIELD_TO_PROP[k];
        if (!propKey) continue;
        (patch as Record<string, string>)[propKey] = v == null ? '' : String(v);
      }
      if (Object.keys(patch).length) patchPropiedad(id, patch);
    },
    [patchPropiedad],
  );

  const appendChatMessage = useCallback((input: AppendChatMessageInput) => {
    const text = input.text.trim();
    if (!text) return false;
    const chatId = String(input.chatId ?? '').trim();
    const leadId = String(input.leadId ?? '').trim();
    const at = input.at?.trim() || localNowIso();
    let applied = false;

    setPayload((prev) => {
      const base: LeadsPayload =
        prev ??
        ({
          generatedAt: new Date().toISOString(),
          leads: [],
          propiedades: propsCache.current,
          source: 'live',
        } as LeadsPayload);

      const idx = base.leads.findIndex(
        (l) =>
          (leadId &&
            (l.id === leadId ||
              l.chatId === leadId ||
              l.id.endsWith(`:${leadId}`))) ||
          (chatId && l.chatId === chatId),
      );

      if (idx < 0) {
        if (!chatId && !leadId) return prev;
        const created = stubLeadFromChat({
          chatId: chatId || leadId,
          leadId: leadId || undefined,
          source: input.source,
          at,
          text,
          side: input.side,
        });
        leadCache.current.set(created.id, created);
        if (created.chatId) {
          leadCache.current.set(`chat:${created.chatId}`, created);
        }
        applied = true;
        return { ...base, leads: [created, ...base.leads] };
      }

      const lead = base.leads[idx];
      if (recentDuplicate(lead.historial, text, input.side)) return prev;

      const entry: HistorialMensaje = {
        id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fecha: at,
        mensajeCliente: input.side === 'client' ? text : '',
        respuestaBot: input.side === 'bot' ? text : '',
        pending: true,
      };
      const nextLead: Lead = {
        ...lead,
        status:
          lead.status === 'cerrado_sin_respuesta' || lead.status === 'cerrado'
            ? 'abierto'
            : lead.status,
        lastMessage: text,
        ultimaActualizacion: at,
        historial: [...lead.historial, entry],
      };
      leadCache.current.set(nextLead.id, nextLead);
      if (nextLead.chatId) {
        leadCache.current.set(`chat:${nextLead.chatId}`, nextLead);
      }
      const nextLeads = base.leads.slice();
      nextLeads[idx] = nextLead;
      applied = true;
      return { ...base, leads: nextLeads };
    });

    return applied;
  }, []);

  const payloadRef = useRef<LeadsPayload | null>(null);
  payloadRef.current = payload;

  const refresh = useCallback(async (): Promise<Lead[]> => {
    if (Date.now() < backoffUntil.current) {
      return payloadRef.current?.leads ?? [];
    }
    if (refreshInFlight.current) {
      return payloadRef.current?.leads ?? [];
    }
    refreshInFlight.current = true;
    let result: Lead[] = payloadRef.current?.leads ?? [];
    try {
      const next = await fetchLeads();
      if (!mounted.current) return result;

      const rateLimited = Boolean(
        next.warning &&
          /too many requests|quota|429|rate.?limit/i.test(next.warning),
      );
      const sheetsBroken = isSheetsAuthBroken(next.warning);
      sheetsBrokenRef.current = sheetsBroken;

      if (rateLimited) {
        backoffUntil.current = Date.now() + 90_000;
        if (
          (!next.propiedades || next.propiedades.length === 0) &&
          propsCache.current.length
        ) {
          next.propiedades = propsCache.current;
        }
        if ((!next.leads || next.leads.length === 0) && leadCache.current.size) {
          next.leads = Array.from(
            new Map(
              [...leadCache.current.entries()]
                .filter(([k]) => !k.startsWith('chat:'))
                .map(([, v]) => [v.id, v]),
            ).values(),
          );
        }
      } else if (next.propiedades?.length) {
        propsCache.current = next.propiedades;
      }

      setPayload((prev) => {
        const merged = mergeLeadsFromRefresh(prev, next, sheetsBroken);
        for (const lead of merged.leads) {
          leadCache.current.set(lead.id, lead);
          if (lead.chatId) {
            leadCache.current.set(`chat:${lead.chatId}`, lead);
          }
        }
        result = merged.leads;
        return merged;
      });
      setError(
        sheetsBroken
          ? 'Google Sheets OAuth vencido: el panel muestra caché + mensajes en vivo por WebSocket. Reconectá la credencial Google en n8n (Settings → Credentials).'
          : rateLimited
            ? 'Google Sheets limitó lecturas. Reintento suave en ~90s; se mantiene la última data buena.'
            : null,
      );
    } catch (err) {
      if (!mounted.current) return result;
      const message =
        err instanceof Error ? err.message : 'Error al actualizar leads';
      const is429 = /429|too many|quota/i.test(message);
      if (is429) {
        backoffUntil.current = Date.now() + 90_000;
        setError(
          'Demasiadas lecturas a Sheets. Esperá un minuto; el panel no martilla.',
        );
      } else {
        setError(message);
      }
    } finally {
      refreshInFlight.current = false;
      if (mounted.current) setLoading(false);
    }
    return result;
  }, []);

  refreshRef.current = refresh;

  const onRealtime = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === 'stock.updated') {
        applyStockEvent(event.payload);
        return;
      }
      if (event.type === 'chat.message') {
        const p =
          event.payload !== null && typeof event.payload === 'object'
            ? (event.payload as Record<string, unknown>)
            : {};
        const chatId =
          String(p.chatId ?? p.chat_id ?? '').trim() || undefined;
        const leadId =
          String(p.leadId ?? p.lead_id ?? p.id ?? '').trim() || undefined;
        const at = typeof event.at === 'string' ? event.at : undefined;
        const source = String(p.source ?? '');
        const nombre = String(p.nombre ?? p.name ?? '').trim();
        const tempRaw = String(p.temperatura ?? p.temperature ?? '').trim();
        const presupuesto = String(p.presupuesto ?? '').trim();
        const status = String(p.status ?? '').trim();
        const fromJson = parseHistorialJson(
          p.historial_json ?? p.historialJson ?? p.historial,
        );

        // Snapshot completo desde el bot (staticData) cuando Sheets está caído
        if (fromJson.length && chatId) {
          const atIso = at || localNowIso();
          setPayload((prev) => {
            const base: LeadsPayload =
              prev ??
              ({
                generatedAt: new Date().toISOString(),
                leads: [],
                propiedades: propsCache.current,
                source: 'live',
              } as LeadsPayload);
            const idx = base.leads.findIndex(
              (l) =>
                l.chatId === chatId ||
                (leadId &&
                  (l.id === leadId ||
                    l.chatId === leadId ||
                    l.id.endsWith(`:${leadId}`))),
            );
            const last = fromJson[fromJson.length - 1];
            const lastMessage =
              last?.respuestaBot.trim() ||
              last?.mensajeCliente.trim() ||
              '';
            const patched: Lead =
              idx >= 0
                ? {
                    ...base.leads[idx],
                    ...(nombre ? { nombre } : {}),
                    ...(tempRaw
                      ? { temperatura: normalizeTemperatura(tempRaw) }
                      : {}),
                    ...(presupuesto ? { presupuesto } : {}),
                    status: status || 'abierto',
                    historial: fromJson,
                    lastMessage: lastMessage || base.leads[idx].lastMessage,
                    ultimaActualizacion: atIso,
                    leadCompleto: false,
                  }
                : stubLeadFromChat({
                    chatId,
                    leadId,
                    nombre,
                    source,
                    at: atIso,
                    text: lastMessage || '…',
                    side: 'bot',
                    temperatura: tempRaw,
                    presupuesto,
                    status: status || 'abierto',
                    historial: fromJson,
                  });
            leadCache.current.set(patched.id, patched);
            if (patched.chatId) {
              leadCache.current.set(`chat:${patched.chatId}`, patched);
            }
            if (idx < 0) {
              return { ...base, leads: [patched, ...base.leads] };
            }
            const nextLeads = base.leads.slice();
            nextLeads[idx] = patched;
            return { ...base, leads: nextLeads };
          });
          scheduleSoftRefresh(source === 'panel' ? 3_000 : 700);
          return;
        }

        const cliente = String(
          p.mensajeCliente ?? p.mensaje_cliente ?? p.userText ?? '',
        ).trim();
        const botReply = String(
          p.respuestaBot ?? p.respuesta_bot ?? p.reply ?? '',
        ).trim();
        const text = String(p.text ?? p.message ?? p.mensaje ?? '').trim();
        const sideRaw = String(p.side ?? p.from ?? '').toLowerCase();

        if (cliente) {
          appendChatMessage({
            chatId,
            leadId,
            text: cliente,
            side: 'client',
            at,
            source,
          });
        }
        if (botReply) {
          appendChatMessage({
            chatId,
            leadId,
            text: botReply,
            side: 'bot',
            at,
            source,
          });
        }
        if (!cliente && !botReply && text) {
          const side: 'client' | 'bot' =
            sideRaw === 'client' ||
            sideRaw === 'user' ||
            sideRaw === 'cliente'
              ? 'client'
              : 'bot';
          appendChatMessage({
            chatId,
            leadId,
            text,
            side,
            at,
            source,
          });
        }
        // Sin texto útil: no refetch (pisaría optimistic con Sheets viejo)
        if (!cliente && !botReply && !text) return;
        // Soft refresh: merge conserva pending hasta que Sheets confirme
        const delayMs = source === 'panel' ? 3_000 : 700;
        scheduleSoftRefresh(delayMs);
        return;
      }
      if (event.type === 'leads.refresh' || event.type === 'lead.updated') {
        const p =
          event.payload !== null && typeof event.payload === 'object'
            ? (event.payload as Record<string, unknown>)
            : {};
        const chatId = String(p.chatId ?? p.chat_id ?? '').trim();
        const leadId = String(p.leadId ?? p.lead_id ?? p.id ?? '').trim();
        const tempRaw = String(p.temperatura ?? p.temperature ?? '').trim();
        const nombre = String(p.nombre ?? p.name ?? '').trim();
        const status = String(p.status ?? '').trim();
        const presupuesto = String(p.presupuesto ?? '').trim();
        const lastMessage = String(
          p.lastMessage ?? p.last_message ?? p.mensaje ?? '',
        ).trim();
        const estadoSeg = String(
          p.estadoSeguimiento ?? p.estado_seguimiento ?? '',
        ).trim();

        if (chatId || leadId) {
          setPayload((prev) => {
            const base: LeadsPayload =
              prev ??
              ({
                generatedAt: new Date().toISOString(),
                leads: [],
                propiedades: propsCache.current,
                source: 'live',
              } as LeadsPayload);
            let touched = false;
            const nextLeads = base.leads.map((lead) => {
              const match =
                (chatId && lead.chatId === chatId) ||
                (leadId &&
                  (lead.id === leadId ||
                    lead.chatId === leadId ||
                    lead.id.endsWith(`:${leadId}`)));
              if (!match) return lead;
              touched = true;
              const merged: Lead = {
                ...lead,
                ...(tempRaw
                  ? { temperatura: normalizeTemperatura(tempRaw) }
                  : {}),
                ...(nombre ? { nombre } : {}),
                ...(status ? { status } : {}),
                ...(presupuesto ? { presupuesto } : {}),
                ...(lastMessage ? { lastMessage } : {}),
                ...(estadoSeg
                  ? { estadoSeguimiento: normalizeEstadoSeguimiento(estadoSeg) }
                  : {}),
                ultimaActualizacion:
                  typeof event.at === 'string'
                    ? event.at
                    : lead.ultimaActualizacion,
              };
              leadCache.current.set(merged.id, merged);
              if (merged.chatId) {
                leadCache.current.set(`chat:${merged.chatId}`, merged);
              }
              return merged;
            });
            if (!touched && chatId) {
              const created = stubLeadFromChat({
                chatId,
                leadId: leadId || undefined,
                nombre,
                source: String(p.source ?? 'telegram'),
                at:
                  typeof event.at === 'string' ? event.at : localNowIso(),
                text: lastMessage || '…',
                side: 'bot',
                temperatura: tempRaw,
                presupuesto,
                status: status || 'abierto',
              });
              leadCache.current.set(created.id, created);
              leadCache.current.set(`chat:${created.chatId}`, created);
              return { ...base, leads: [created, ...base.leads] };
            }
            return touched ? { ...base, leads: nextLeads } : prev;
          });
        }
        scheduleSoftRefresh(event.type === 'leads.refresh' ? 350 : 500);
      }
    },
    [appendChatMessage, applyStockEvent, scheduleSoftRefresh],
  );

  const { status: realtimeStatus } = useRealtime({
    enabled: !config.useMock,
    onEvent: onRealtime,
  });

  useEffect(() => {
    wsOpen.current = realtimeStatus === 'open';
  }, [realtimeStatus]);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    let timer: number | undefined;

    function scheduleNext() {
      const ms = wsOpen.current
        ? config.pollIntervalWsMs
        : config.pollIntervalMs;
      timer = window.setTimeout(() => {
        if (refreshInFlight.current) {
          if (mounted.current) scheduleNext();
          return;
        }
        void refresh().finally(() => {
          if (mounted.current) scheduleNext();
        });
      }, ms);
    }

    scheduleNext();

    return () => {
      mounted.current = false;
      if (timer) window.clearTimeout(timer);
      if (softRefreshTimer.current) window.clearTimeout(softRefreshTimer.current);
    };
  }, [refresh]);

  function findLead(leadId: string): Lead | undefined {
    const fromPayload = payload?.leads.find(
      (item) =>
        item.id === leadId ||
        item.chatId === leadId ||
        item.id.endsWith(`:${leadId}`),
    );
    if (fromPayload) return fromPayload;
    return (
      leadCache.current.get(leadId) ??
      leadCache.current.get(`chat:${leadId}`)
    );
  }

  return {
    leads: payload?.leads ?? [],
    propiedades:
      payload?.propiedades?.length
        ? payload.propiedades
        : propsCache.current,
    payload,
    loading,
    error,
    lastUpdated: payload?.generatedAt ?? null,
    refresh,
    findLead,
    patchPropiedad,
    patchLead,
    appendChatMessage,
    realtimeStatus,
  };
}
