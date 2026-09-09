import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeCanal } from '../lib/labels';
import type { AdvisorAction, AdvisorActionKind } from '../types/advisorAction';
import { advisorActionTitle } from '../types/advisorAction';
import type { RealtimeEvent } from './useRealtime';

function playUrgentChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = i === 0 ? 720 : 920;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = now + i * 0.16;
      gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    }
    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parsePropIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim().toUpperCase()).filter(Boolean).slice(0, 3);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => String(x).trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 3);
      }
    } catch {
      const m = raw.match(/\bMZA-\d{3}\b/gi);
      if (m) return m.map((x) => x.toUpperCase()).slice(0, 3);
    }
  }
  return [];
}

function inferKind(p: Record<string, unknown>): AdvisorActionKind | null {
  const rate =
    p.rateLimit === true ||
    p.rate_limit === true ||
    String(p.rateLimit ?? p.rate_limit ?? '') === 'si';
  const handoff =
    p.handoff === true ||
    String(p.handoff ?? '') === 'si' ||
    String(p.botPaused ?? p.bot_paused ?? '') === 'si';
  const props = parsePropIds(p.propiedadesMostrar ?? p.propiedades_mostrar ?? p.propIds);
  const link = String(p.citaLink ?? p.cita_link ?? p.link ?? '').trim();
  const needs =
    p.needsAdvisor === true ||
    p.needs_advisor === true ||
    String(p.needsAdvisor ?? '') === 'si';

  if (rate && props.length) return 'fichas';
  if (rate && link) return 'link';
  if (rate) return 'rate_limit';
  if (handoff && link) return 'link';
  if (handoff && props.length) return 'fichas';
  if (handoff) return 'handoff';
  if (needs && props.length) return 'fichas';
  if (needs && link) return 'link';
  if (needs) return 'handoff';
  return null;
}

export function actionFromRealtimePayload(
  payload: unknown,
  eventType: string,
): AdvisorAction | null {
  const p = asRecord(payload);
  const chatId = String(p.chatId ?? p.chat_id ?? '').trim();
  if (!chatId) return null;

  let kind: AdvisorActionKind | null = null;
  if (eventType === 'advisor.action') {
    const rawKind = String(p.kind ?? p.action ?? '').trim();
    if (
      rawKind === 'fichas' ||
      rawKind === 'link' ||
      rawKind === 'handoff' ||
      rawKind === 'rate_limit'
    ) {
      kind = rawKind;
    } else {
      kind = inferKind(p);
    }
  } else {
    kind = inferKind(p);
  }
  if (!kind) return null;

  const canal = normalizeCanal(p.source ?? p.canal ?? 'telegram');
  const nombre = String(p.nombre ?? p.lead_name ?? 'Cliente').trim() || 'Cliente';
  const leadId = String(p.leadId ?? p.lead_id ?? `${canal}:${chatId}`);
  const propIds = parsePropIds(
    p.propIds ?? p.propiedadesMostrar ?? p.propiedades_mostrar,
  );
  const link = String(p.citaLink ?? p.cita_link ?? p.link ?? '').trim();

  let detail = String(p.detail ?? p.message ?? '').trim();
  if (!detail) {
    if (kind === 'fichas') detail = `Reenviar ${propIds.join(', ') || 'fichas'}`;
    else if (kind === 'link') detail = 'Enviar link de agenda al cliente';
    else if (kind === 'rate_limit') detail = 'El bot se quedó sin tokens';
    else detail = 'El bot pausó: tomá el chat';
  }

  return {
    id: `${chatId}|${kind}|${propIds.join('-')}|${Date.now()}`,
    kind,
    chatId,
    leadId,
    nombre,
    canal,
    title: advisorActionTitle(kind),
    detail,
    propIds,
    link,
    at: Date.now(),
    read: false,
  };
}

export function useAdvisorActions(): {
  actions: AdvisorAction[];
  latest: AdvisorAction | null;
  pushFromEvent: (event: RealtimeEvent) => void;
  dismiss: (id: string) => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  unreadCount: number;
} {
  const [actions, setActions] = useState<AdvisorAction[]>([]);
  const recentFp = useRef<Map<string, number>>(new Map());

  const pushFromEvent = useCallback((event: RealtimeEvent) => {
    if (event.type !== 'advisor.action' && event.type !== 'chat.message') return;
    const action = actionFromRealtimePayload(event.payload, event.type);
    if (!action) return;

    const fp = `${action.chatId}|${action.kind}|${action.propIds.join(',')}|${action.link}`;
    const now = Date.now();
    const prev = recentFp.current.get(fp) || 0;
    if (now - prev < 8000) return;
    recentFp.current.set(fp, now);

    setActions((cur) => [action, ...cur].slice(0, 8));
    playUrgentChime();
  }, []);

  // cleanup old fps
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      for (const [k, ts] of recentFp.current) {
        if (now - ts > 60_000) recentFp.current.delete(k);
      }
    }, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const dismiss = useCallback((id: string) => {
    setActions((cur) => cur.filter((a) => a.id !== id));
  }, []);

  const markRead = useCallback((id: string) => {
    setActions((cur) =>
      cur.map((a) => (a.id === id ? { ...a, read: true } : a)),
    );
  }, []);

  const clearAll = useCallback(() => setActions([]), []);

  return {
    actions,
    latest: actions[0] ?? null,
    pushFromEvent,
    dismiss,
    markRead,
    clearAll,
    unreadCount: actions.filter((a) => !a.read).length,
  };
}
