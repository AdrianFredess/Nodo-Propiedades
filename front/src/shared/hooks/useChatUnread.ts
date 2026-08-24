import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { historialBubbleKeys } from '../lib/chatKeys';
import type { Lead } from '../types/lead';

const STORAGE_KEY = 'np-chat-unread-v1';

type UnreadMap = Record<string, string[]>;

function loadUnread(): UnreadMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: UnreadMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        out[k] = v.filter((x): x is string => typeof x === 'string');
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveUnread(map: UnreadMap) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Mensajes nuevos por lead. Al abrir la ficha se marcan leídos;
 * esas keys quedan como highlight “Nuevo” en el hilo.
 */
export function useChatUnread(leads: Lead[], openLeadId: string | null) {
  const knownRef = useRef<Map<string, Set<string>>>(new Map());
  const primed = useRef(false);
  const [unreadMap, setUnreadMap] = useState<UnreadMap>(() => loadUnread());
  const [highlightMap, setHighlightMap] = useState<Record<string, string[]>>(
    {},
  );

  useEffect(() => {
    const highlightAdds: Record<string, string[]> = {};
    let unreadChanged = false;

    setUnreadMap((prev) => {
      const next: UnreadMap = { ...prev };

      for (const lead of leads) {
        const keys = historialBubbleKeys(lead.historial);
        let known = knownRef.current.get(lead.id);

        if (!known) {
          known = new Set(keys);
          knownRef.current.set(lead.id, known);
          continue;
        }

        const fresh = keys.filter((k) => !known.has(k));
        if (!fresh.length) continue;
        for (const k of fresh) known.add(k);

        if (!primed.current) continue;

        if (openLeadId === lead.id) {
          highlightAdds[lead.id] = [
            ...new Set([...(highlightAdds[lead.id] ?? []), ...fresh]),
          ];
          if (next[lead.id]?.length) {
            delete next[lead.id];
            unreadChanged = true;
          }
          continue;
        }

        next[lead.id] = [...new Set([...(next[lead.id] ?? []), ...fresh])];
        unreadChanged = true;
      }

      if (!primed.current) primed.current = true;
      if (unreadChanged) saveUnread(next);
      return unreadChanged ? next : prev;
    });

    if (Object.keys(highlightAdds).length) {
      setHighlightMap((h) => {
        const next = { ...h };
        for (const [id, keys] of Object.entries(highlightAdds)) {
          next[id] = [...new Set([...(next[id] ?? []), ...keys])];
        }
        return next;
      });
    }
  }, [leads, openLeadId]);

  const markedOpenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!openLeadId) {
      markedOpenRef.current = null;
      return;
    }
    if (markedOpenRef.current === openLeadId) return;
    const pending = unreadMap[openLeadId];
    if (!pending?.length) {
      markedOpenRef.current = openLeadId;
      return;
    }
    markedOpenRef.current = openLeadId;
    setHighlightMap((h) => ({
      ...h,
      [openLeadId]: [...new Set([...(h[openLeadId] ?? []), ...pending])],
    }));
    setUnreadMap((prev) => {
      if (!prev[openLeadId]?.length) return prev;
      const next = { ...prev };
      delete next[openLeadId];
      saveUnread(next);
      return next;
    });
  }, [openLeadId, unreadMap]);

  const clearHighlight = useCallback((leadId: string) => {
    setHighlightMap((h) => {
      if (!h[leadId]?.length) return h;
      const next = { ...h };
      delete next[leadId];
      return next;
    });
  }, []);

  const unreadByLead = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, keys] of Object.entries(unreadMap)) {
      if (keys.length) map.set(id, keys.length);
    }
    return map;
  }, [unreadMap]);

  const totalUnread = useMemo(() => {
    let n = 0;
    for (const keys of Object.values(unreadMap)) n += keys.length;
    return n;
  }, [unreadMap]);

  function getHighlightKeys(leadId: string): Set<string> {
    return new Set(highlightMap[leadId] ?? []);
  }

  function getUnreadCount(leadId: string): number {
    return unreadMap[leadId]?.length ?? 0;
  }

  return {
    unreadByLead,
    totalUnread,
    getUnreadCount,
    getHighlightKeys,
    clearHighlight,
  };
}
