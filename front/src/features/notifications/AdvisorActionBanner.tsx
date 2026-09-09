import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  emitRealtime,
  sendTelegramBroadcast,
  sendWhatsAppMessage,
} from '../../shared/api/client';
import {
  buildAgendaMessage,
  buildFichasMessage,
} from '../../shared/lib/fichaMessage';
import type { AdvisorAction } from '../../shared/types/advisorAction';
import { Zap, X } from 'lucide-react';

interface AdvisorActionBannerProps {
  action: AdvisorAction | null;
  onDismiss: (id: string) => void;
  onSent?: (action: AdvisorAction, text: string) => void;
}

export function AdvisorActionBanner({
  action,
  onDismiss,
  onSent,
}: AdvisorActionBannerProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;

  const ctaLabel =
    action.kind === 'fichas'
      ? 'Enviar ficha ahora'
      : action.kind === 'link'
        ? 'Enviar link ahora'
        : action.kind === 'rate_limit'
          ? 'Avisar al cliente'
          : 'Abrir chat';

  async function handlePrimary() {
    if (!action) return;
    setError(null);

    if (action.kind === 'handoff' && !action.link && !action.propIds.length) {
      onDismiss(action.id);
      return;
    }

    let text = '';
    if (action.kind === 'fichas' || (action.kind === 'rate_limit' && action.propIds.length)) {
      text = buildFichasMessage(action.propIds);
    } else if (action.kind === 'link' || action.link) {
      text = buildAgendaMessage(action.link, {
        chatId: action.chatId,
        nombre: action.nombre,
        canal: action.canal,
      });
    } else if (action.kind === 'rate_limit') {
      text = 'Dame un segundo que se me trabo, ya te mando lo que pediste.';
    } else {
      onDismiss(action.id);
      return;
    }

    setSending(true);
    try {
      if (action.canal === 'telegram') {
        const result = await sendTelegramBroadcast({
          chat_ids: [action.chatId],
          text,
        });
        if (!result.ok) {
          setError(result.error ?? 'No se pudo enviar');
          return;
        }
      } else if (action.canal === 'whatsapp') {
        const result = await sendWhatsAppMessage({
          chatId: action.chatId,
          text,
        });
        if (!result.ok) {
          setError(result.error ?? 'No se pudo enviar');
          return;
        }
      } else {
        setError('Canal no soporta envío rápido');
        return;
      }

      void emitRealtime('chat.message', {
        chatId: action.chatId,
        leadId: action.leadId,
        text,
        side: 'bot',
        source: 'panel-advisor',
        nombre: action.nombre,
      });
      onSent?.(action, text);
      onDismiss(action.id);
    } catch {
      setError('Error de conexión');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`advisor-banner advisor-banner--${action.kind}`}
      role="alertdialog"
      aria-label={action.title}
    >
      <div className="advisor-banner__icon" aria-hidden>
        <Zap size={18} strokeWidth={2.2} />
      </div>
      <div className="advisor-banner__body">
        <strong>{action.title}</strong>
        <p>
          <Link to={`/leads/${encodeURIComponent(action.leadId)}`}>
            {action.nombre}
          </Link>
          {' — '}
          {action.detail}
        </p>
        {error ? <p className="advisor-banner__error">{error}</p> : null}
      </div>
      <div className="advisor-banner__actions">
        {action.kind === 'handoff' && !action.link && !action.propIds.length ? (
          <Link
            className="btn btn--primary btn--sm"
            to={`/leads/${encodeURIComponent(action.leadId)}`}
            onClick={() => onDismiss(action.id)}
          >
            Abrir chat
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={sending}
            onClick={() => void handlePrimary()}
          >
            {sending ? 'Enviando…' : ctaLabel}
          </button>
        )}
        <button
          type="button"
          className="advisor-banner__close"
          aria-label="Descartar"
          onClick={() => onDismiss(action.id)}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
