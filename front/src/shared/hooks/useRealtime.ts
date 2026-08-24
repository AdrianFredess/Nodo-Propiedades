import { useEffect, useRef, useState } from 'react';
import { config } from '../api/client';

export type RealtimeEventType =
  | 'bridge.hello'
  | 'pong'
  | 'lead.updated'
  | 'chat.message'
  | 'stock.updated'
  | 'leads.refresh'
  | string;

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload?: unknown;
  at?: string;
}

export type RealtimeStatus = 'off' | 'connecting' | 'open' | 'closed';

interface UseRealtimeOptions {
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

export function useRealtime({
  enabled = true,
  onEvent,
}: UseRealtimeOptions = {}): {
  status: RealtimeStatus;
  lastEventAt: string | null;
} {
  const [status, setStatus] = useState<RealtimeStatus>('off');
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || config.useMock || !config.wsUrl) {
      setStatus('off');
      return;
    }

    let stopped = false;
    let ws: WebSocket | null = null;
    let retryMs = 1500;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;

    function cleanupSocket() {
      if (pingTimer) window.clearInterval(pingTimer);
      pingTimer = undefined;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      ws = null;
    }

    function connect() {
      if (stopped) return;
      cleanupSocket();
      setStatus('connecting');
      try {
        ws = new WebSocket(config.wsUrl);
      } catch {
        setStatus('closed');
        scheduleRetry();
        return;
      }

      ws.onopen = () => {
        if (stopped) return;
        setStatus('open');
        retryMs = 1500;
        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as RealtimeEvent;
          if (!data || typeof data.type !== 'string') return;
          setLastEventAt(data.at ?? new Date().toISOString());
          onEventRef.current?.(data);
        } catch {
          /* ignore non-json */
        }
      };

      ws.onerror = () => {
        /* onclose handles retry */
      };

      ws.onclose = () => {
        setStatus('closed');
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = undefined;
        scheduleRetry();
      };
    }

    function scheduleRetry() {
      if (stopped) return;
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryMs = Math.min(30_000, Math.round(retryMs * 1.6));
        connect();
      }, retryMs);
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      cleanupSocket();
    };
  }, [enabled]);

  return { status, lastEventAt };
}
