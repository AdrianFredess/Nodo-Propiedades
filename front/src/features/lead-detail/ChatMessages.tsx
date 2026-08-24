import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, MessageCircle, User } from 'lucide-react';
import {
  formatChatDayLabel,
  formatChatTime,
  isSameDay,
  parseDate,
} from '../../shared/lib/time';
import type { HistorialMensaje } from '../../shared/types/lead';

export interface ChatMessagesProps {
  historial: HistorialMensaje[];
  fallbackMessage?: string;
  /** Cambia al navegar entre leads para resetear scroll / animaciones. */
  leadKey: string;
  leadName?: string;
  canalLabel?: string;
  /** Keys de burbujas nuevas / no leídas al abrir. */
  highlightKeys?: Set<string>;
  onConsumedHighlight?: () => void;
}

type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'bubble';
      key: string;
      side: 'client' | 'bot';
      text: string;
      time: string;
    };

function buildChatRows(historial: HistorialMensaje[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay: Date | null = null;

  for (const item of historial) {
    const day = parseDate(item.fecha);
    if (day && (!lastDay || !isSameDay(day, lastDay))) {
      rows.push({
        kind: 'day',
        key: `day-${item.id}-${item.fecha}`,
        label: formatChatDayLabel(item.fecha),
      });
      lastDay = day;
    }

    if (item.mensajeCliente.trim()) {
      rows.push({
        kind: 'bubble',
        key: `${item.id}-client`,
        side: 'client',
        text: item.mensajeCliente.trim(),
        time: formatChatTime(item.fecha),
      });
    }
    if (item.respuestaBot.trim()) {
      rows.push({
        kind: 'bubble',
        key: `${item.id}-bot`,
        side: 'bot',
        text: item.respuestaBot.trim(),
        time: formatChatTime(item.fecha),
      });
    }
  }

  return rows;
}

const NEAR_BOTTOM_PX = 80;

/**
 * Hilo de chat del lead. Scroll solo acá; datos vía WS + polling suave.
 */
export function ChatMessages({
  historial,
  fallbackMessage,
  leadKey,
  leadName,
  canalLabel,
  highlightKeys,
  onConsumedHighlight,
}: ChatMessagesProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevLeadRef = useRef(leadKey);
  const animSeenRef = useRef<Set<string>>(new Set());
  const seededLeadRef = useRef<string | null>(null);

  const rows = useMemo(() => buildChatRows(historial), [historial]);
  const bubbles = useMemo(
    () =>
      rows.filter(
        (r): r is Extract<ChatRow, { kind: 'bubble' }> => r.kind === 'bubble',
      ),
    [rows],
  );
  const bubbleCount = bubbles.length;
  const tailKey = bubbles.length
    ? `${bubbles[bubbles.length - 1].key}:${bubbles[bubbles.length - 1].text}`
    : 'empty';

  if (seededLeadRef.current !== leadKey) {
    seededLeadRef.current = leadKey;
    animSeenRef.current = new Set(bubbles.map((b) => b.key));
  }

  useEffect(() => {
    for (const b of bubbles) {
      animSeenRef.current.add(b.key);
    }
  }, [bubbles]);

  useEffect(() => {
    if (!highlightKeys?.size || !onConsumedHighlight) return;
    const t = window.setTimeout(() => onConsumedHighlight(), 12_000);
    return () => window.clearTimeout(t);
  }, [highlightKeys, leadKey, onConsumedHighlight]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    if (prevLeadRef.current !== leadKey) {
      prevLeadRef.current = leadKey;
      stickToBottomRef.current = true;
    }

    if (!stickToBottomRef.current) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [leadKey, bubbleCount, tailKey]);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance <= NEAR_BOTTOM_PX;
  }

  const subtitle = [
    canalLabel,
    bubbleCount ? `${bubbleCount} mensajes` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="chat-panel">
      <header className="chat-panel__header">
        <div className="chat-panel__header-icon" aria-hidden>
          <MessageCircle size={14} strokeWidth={2} />
        </div>
        <div className="chat-panel__header-text">
          <strong>{leadName?.trim() || 'Conversación'}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <span
          className="chat-panel__live"
          title="Se actualiza por WebSocket; si cae, polling suave"
        >
          En vivo
        </span>
      </header>

      {bubbleCount === 0 ? (
        <div className="chat-thread chat-thread--empty">
          <div className="empty-state empty-state--compact">
            {fallbackMessage?.trim()
              ? `Último mensaje: ${fallbackMessage}`
              : 'Sin mensajes registrados'}
          </div>
        </div>
      ) : (
        <div
          className="chat-thread"
          ref={scrollerRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Conversación"
          aria-live="polite"
        >
          <AnimatePresence initial={false}>
            {rows.map((row) => {
              if (row.kind === 'day') {
                return (
                  <div
                    key={row.key}
                    className="chat-thread__day"
                    role="separator"
                  >
                    <span>{row.label}</span>
                  </div>
                );
              }

              const isFresh = !animSeenRef.current.has(row.key);
              const isUnread = Boolean(highlightKeys?.has(row.key));
              const isNew = isFresh || isUnread;

              return (
                <motion.div
                  key={row.key}
                  className={`chat-bubble chat-bubble--${row.side}${isNew ? ' chat-bubble--new' : ''}`}
                  initial={
                    isFresh ? { opacity: 0, y: 8, scale: 0.98 } : false
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className={`chat-bubble__avatar chat-bubble__avatar--${row.side}`}
                    aria-hidden
                  >
                    {row.side === 'client' ? (
                      <User size={11} strokeWidth={2.2} />
                    ) : (
                      <Bot size={11} strokeWidth={2.2} />
                    )}
                  </div>
                  <div className="chat-bubble__stack">
                    <div className="chat-bubble__meta">
                      <span className="chat-bubble__who">
                        {row.side === 'client' ? 'Cliente' : 'Asistente'}
                      </span>
                      {isNew ? (
                        <span className="chat-bubble__new-tag">Nuevo</span>
                      ) : null}
                      {row.time ? (
                        <time className="chat-bubble__time" dateTime={row.time}>
                          {row.time}
                        </time>
                      ) : null}
                    </div>
                    <p className="chat-bubble__text">{row.text}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
