import { useCallback, useEffect, useRef, useState } from 'react';
import { config, fetchLeads } from '../api/client';
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
): LeadsPayload {
  if (!prev?.leads?.length) return next;
  const byId = new Map(prev.leads.map((l) => [l.id, l]));
  const byChat = new Map<string, Lead>();
  for (const l of prev.leads) {
    if (l.chatId) byChat.set(l.chatId, l);
  }

  const leads = next.leads.map((serverLead) => {
    const local =
      byId.get(serverLead.id) ??
      (serverLead.chatId ? byChat.get(serverLead.chatId) : undefined);
    if (!local?.historial?.length) return serverLead;
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
  refresh: () => Promise<void>;
  findLead: (leadId: string) => Lead | undefined;
  patchPropiedad: (id: string, patch: Partial<Propiedad>) => void;
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
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

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
      if (!prev?.leads?.length) return prev;
      const idx = prev.leads.findIndex(
        (l) =>
          (leadId &&
            (l.id === leadId ||
              l.chatId === leadId ||
              l.id.endsWith(`:${leadId}`))) ||
          (chatId && l.chatId === chatId),
      );
      if (idx < 0) return prev;
      const lead = prev.leads[idx];
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
        lastMessage: text,
        ultimaActualizacion: at,
        historial: [...lead.historial, entry],
      };
      leadCache.current.set(nextLead.id, nextLead);
      if (nextLead.chatId) {
        leadCache.current.set(`chat:${nextLead.chatId}`, nextLead);
      }
      const nextLeads = prev.leads.slice();
      nextLeads[idx] = nextLead;
      applied = true;
      return { ...prev, leads: nextLeads };
    });

    return applied;
  }, []);

  const refresh = useCallback(async () => {
    if (Date.now() < backoffUntil.current) return;
    try {
      const next = await fetchLeads();
      if (!mounted.current) return;

      const rateLimited = Boolean(
        next.warning &&
          /too many requests|quota|429|rate.?limit/i.test(next.warning),
      );

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
        const merged = mergeLeadsFromRefresh(prev, next);
        for (const lead of merged.leads) {
          leadCache.current.set(lead.id, lead);
          if (lead.chatId) {
            leadCache.current.set(`chat:${lead.chatId}`, lead);
          }
        }
        return merged;
      });
      setError(
        rateLimited
          ? 'Google Sheets limitó lecturas. Reintento suave en ~90s; se mantiene la última data buena.'
          : null,
      );
    } catch (err) {
      if (!mounted.current) return;
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
      if (mounted.current) setLoading(false);
    }
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
        const delayMs = source === 'panel' ? 8_000 : 2_500;
        window.setTimeout(() => {
          void refreshRef.current();
        }, delayMs);
        return;
      }
      if (event.type === 'leads.refresh' || event.type === 'lead.updated') {
        void refreshRef.current();
      }
    },
    [appendChatMessage, applyStockEvent],
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
        void refresh().finally(() => {
          if (mounted.current) scheduleNext();
        });
      }, ms);
    }

    scheduleNext();

    return () => {
      mounted.current = false;
      if (timer) window.clearTimeout(timer);
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
    appendChatMessage,
    realtimeStatus,
  };
}
