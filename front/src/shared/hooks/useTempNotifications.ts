import { useEffect, useRef, useState } from 'react';
import type { Lead, Temperatura } from '../types/lead';

export interface TempToast {
  id: string;
  leadId: string;
  nombre: string;
  from: Temperatura | 'nuevo';
  to: Temperatura;
  canalOrigen: string;
  at: number;
  highlighted: boolean;
  read: boolean;
}

const SESSION_KEY = 'np-temp-notif-seen-v1';
const RANK: Record<Temperatura, number> = {
  frio: 0,
  tibio: 1,
  caliente: 2,
};

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify([...seen].slice(-200)),
    );
  } catch {
    /* ignore quota */
  }
}

function playSoftChime(highlighted: boolean) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = highlighted ? 880 : 660;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.start(now);
    osc.stop(now + 0.25);
    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    /* autoplay / unsupported */
  }
}

function fingerprint(leadId: string, from: string, to: string): string {
  return `${leadId}|${from}|${to}`;
}

/**
 * Detecta subidas de temperatura (frio→tibio, tibio→caliente, etc.)
 * al comparar polls. Persiste fingerprints en sessionStorage para no spamear.
 */
export function useTempNotifications(leads: Lead[]): {
  toasts: TempToast[];
  dismiss: (id: string) => void;
  markAllRead: () => void;
  unreadCount: number;
} {
  const prevTemps = useRef<Map<string, Temperatura>>(new Map());
  const primed = useRef(false);
  const seen = useRef<Set<string>>(loadSeen());
  const [toasts, setToasts] = useState<TempToast[]>([]);

  useEffect(() => {
    if (!leads.length) return;

    if (!primed.current) {
      for (const lead of leads) {
        prevTemps.current.set(lead.id, lead.temperatura);
      }
      primed.current = true;
      return;
    }

    const nextToasts: TempToast[] = [];

    for (const lead of leads) {
      const prev = prevTemps.current.get(lead.id);
      const next = lead.temperatura;
      prevTemps.current.set(lead.id, next);

      if (!prev) {
        if (next === 'tibio' || next === 'caliente') {
          const fp = fingerprint(lead.id, 'nuevo', next);
          if (seen.current.has(fp)) continue;
          seen.current.add(fp);
          nextToasts.push({
            id: `${fp}-${Date.now()}`,
            leadId: lead.id,
            nombre: lead.nombre,
            from: 'nuevo',
            to: next,
            canalOrigen: lead.canalOrigen,
            at: Date.now(),
            highlighted: next === 'caliente',
            read: false,
          });
        }
        continue;
      }

      if (prev === next) continue;
      if (RANK[next] <= RANK[prev]) continue;
      if (next !== 'tibio' && next !== 'caliente') continue;

      const fp = fingerprint(lead.id, prev, next);
      if (seen.current.has(fp)) continue;
      seen.current.add(fp);

      nextToasts.push({
        id: `${fp}-${Date.now()}`,
        leadId: lead.id,
        nombre: lead.nombre,
        from: prev,
        to: next,
        canalOrigen: lead.canalOrigen,
        at: Date.now(),
        highlighted: next === 'caliente',
        read: false,
      });
    }

    if (nextToasts.length) {
      saveSeen(seen.current);
      setToasts((cur) => [...nextToasts, ...cur].slice(0, 12));
      playSoftChime(nextToasts.some((t) => t.highlighted));
    }
  }, [leads]);

  function dismiss(id: string) {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }

  function markAllRead() {
    setToasts((cur) => {
      if (!cur.some((t) => !t.read)) return cur;
      return cur.map((t) => (t.read ? t : { ...t, read: true }));
    });
  }

  return {
    toasts,
    dismiss,
    markAllRead,
    unreadCount: toasts.filter((t) => !t.read).length,
  };
}
