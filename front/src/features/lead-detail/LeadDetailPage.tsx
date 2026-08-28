import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  emitRealtime,
  sendTelegramBroadcast,
  sendWhatsAppMessage,
  updateLeadSeguimiento,
} from '../../shared/api/client';
import {
  CANAL_LABEL,
  PIPELINE_COLUMNA_LABEL,
  SEGUIMIENTO_LABEL,
  TEMPERATURA_LABEL,
} from '../../shared/lib/labels';
import { formatDateTime, relativeTimeFrom } from '../../shared/lib/time';
import type { AppendChatMessageInput } from '../../shared/hooks/useLeads';
import type { EstadoSeguimiento, Lead } from '../../shared/types/lead';
import { ChatMessages } from './ChatMessages';

interface LeadDetailPageProps {
  lead: Lead | undefined;
  loading?: boolean;
  highlightKeys?: Set<string>;
  onClearHighlight?: () => void;
  appendChatMessage?: (input: AppendChatMessageInput) => boolean;
  onLeadPatch?: (leadId: string, patch: Partial<Lead>) => void;
}

export function LeadDetailPage({
  lead,
  loading = false,
  highlightKeys,
  onClearHighlight,
  appendChatMessage,
  onLeadPatch,
}: LeadDetailPageProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingSeg, setUpdatingSeg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const clearHighlight = useCallback(() => {
    onClearHighlight?.();
  }, [onClearHighlight]);

  if (!lead && loading) {
    return <div className="empty-state">Cargando ficha…</div>;
  }

  if (!lead) {
    return (
      <div className="page-frame page-frame--detail">
        <header className="page-head page-head--compact page-head--detail">
          <div>
            <h1>Lead no encontrado</h1>
            <p>Volvé al pipeline e intentá de nuevo.</p>
          </div>
        </header>
        <Link className="btn btn--ghost btn--sm" to="/pipeline">
          Volver al pipeline
        </Link>
      </div>
    );
  }

  const canSendTelegram =
    lead.canalOrigen === 'telegram' && Boolean(lead.chatId);
  const canSendWhatsApp =
    lead.canalOrigen === 'whatsapp' && Boolean(lead.chatId);
  const canSend = canSendTelegram || canSendWhatsApp;

  async function handleSend() {
    const body = text.trim();
    if (!body) {
      setError('Escribí un mensaje antes de enviar.');
      return;
    }
    if (!canSend || !lead) {
      setError('Este canal no admite envío manual desde el panel.');
      return;
    }
    setSending(true);
    setError(null);
    setOkMsg(null);
    try {
      if (canSendTelegram) {
        const result = await sendTelegramBroadcast({
          chat_ids: [lead.chatId],
          text: body,
        });
        if (!result.ok) {
          setError(result.error ?? 'No se pudo enviar el mensaje.');
          return;
        }
      } else {
        const result = await sendWhatsAppMessage({
          chatId: lead.chatId,
          text: body,
        });
        if (!result.ok) {
          setError(result.error ?? 'No se pudo enviar por WhatsApp.');
          return;
        }
      }
      appendChatMessage?.({
        leadId: lead.id,
        chatId: lead.chatId,
        text: body,
        side: 'bot',
        source: 'panel',
      });
      void emitRealtime('chat.message', {
        chatId: lead.chatId,
        leadId: lead.id,
        text: body,
        side: 'bot',
        source: canSendTelegram ? 'panel' : 'panel-wa',
      });
      setOkMsg(canSendTelegram ? 'Enviado por Telegram' : 'Enviado por WhatsApp');
      setText('');
      window.setTimeout(() => setOkMsg(null), 2200);
    } catch {
      setError('Error de conexión al enviar.');
    } finally {
      setSending(false);
    }
  }

  async function handleSeguimiento(
    estadoSeguimiento: EstadoSeguimiento,
    status?: string,
  ) {
    if (!lead?.chatId) return;
    setUpdatingSeg(true);
    setError(null);
    setOkMsg(null);
    try {
      const result = await updateLeadSeguimiento({
        chatId: lead.chatId,
        estadoSeguimiento,
        status,
      });
      if (!result.ok) {
        setError(result.error ?? 'No se pudo actualizar el seguimiento.');
        return;
      }
      onLeadPatch?.(lead.id, {
        estadoSeguimiento,
        ...(status ? { status } : {}),
      });
      void emitRealtime('lead.updated', {
        chatId: lead.chatId,
        leadId: lead.id,
        estadoSeguimiento,
        status,
        source: 'panel',
      });
      setOkMsg('Seguimiento actualizado');
      window.setTimeout(() => setOkMsg(null), 2200);
    } catch {
      setError('Error de conexión al actualizar seguimiento.');
    } finally {
      setUpdatingSeg(false);
    }
  }

  return (
    <div className="page-frame page-frame--detail">
      <header className="page-head page-head--compact page-head--detail">
        <div>
          <h1>{lead.nombre}</h1>
          <p>
            {CANAL_LABEL[lead.canalOrigen]} ·{' '}
            {relativeTimeFrom(lead.ultimaActualizacion)}
          </p>
        </div>
        <Link className="btn btn--ghost btn--sm" to="/pipeline">
          Volver
        </Link>
      </header>

      {error ? <div className="error-banner error-banner--compact">{error}</div> : null}
      {okMsg ? (
        <div className="success-banner success-banner--compact">{okMsg}</div>
      ) : null}

      <div className="detail-layout detail-layout--fill">
        <aside className="detail-side panel-card detail-side--compact">
          <h2 className="detail-section-title">Ficha</h2>
          <dl className="detail-meta">
            <div>
              <dt>Etapa</dt>
              <dd>
                {lead.leadCompleto ? (
                  <span className={`chip chip--sm chip--${lead.temperatura}`}>
                    {TEMPERATURA_LABEL[lead.temperatura]}
                  </span>
                ) : (
                  <span className="chip chip--sm chip--conversando">
                    {PIPELINE_COLUMNA_LABEL.conversando}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Canal</dt>
              <dd>{CANAL_LABEL[lead.canalOrigen]}</dd>
            </div>
            <div>
              <dt>Zona</dt>
              <dd>{lead.zona || '—'}</dd>
            </div>
            <div>
              <dt>Presupuesto</dt>
              <dd>{lead.presupuesto || '—'}</dd>
            </div>
            <div>
              <dt>Operación</dt>
              <dd>{lead.tipoOperacion || '—'}</dd>
            </div>
            <div>
              <dt>Seguimiento</dt>
              <dd>{SEGUIMIENTO_LABEL[lead.estadoSeguimiento]}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{lead.status || '—'}</dd>
            </div>
            <div>
              <dt>Actualizado</dt>
              <dd>{formatDateTime(lead.ultimaActualizacion)}</dd>
            </div>
          </dl>

          <div className="detail-send detail-send--compact">
            <h2 className="detail-section-title detail-section-title--spaced">
              Seguimiento automático
            </h2>
            <p className="detail-send__hint" style={{ marginBottom: '0.6rem' }}>
              Si el cliente responde, el bot lo detecta solo y corta los
              recordatorios. Este botón es solo para frenarlos vos a mano.
            </p>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={updatingSeg}
              title="Cortar el seguimiento automático (no molestar más)"
              onClick={() => void handleSeguimiento('cerrado', 'cerrado')}
            >
              Pausar recordatorios
            </button>
          </div>

          <div className="detail-send detail-send--compact">
            <h2 className="detail-section-title detail-section-title--spaced">
              Enviar
            </h2>
            {canSend ? (
              <>
                <textarea
                  className="detail-send__textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    canSendTelegram
                      ? 'Mensaje Telegram…'
                      : 'Mensaje WhatsApp…'
                  }
                  aria-label="Mensaje a este lead"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={sending}
                  onClick={() => void handleSend()}
                >
                  {sending
                    ? 'Enviando…'
                    : canSendTelegram
                      ? 'Enviar Telegram'
                      : 'Enviar WhatsApp'}
                </button>
              </>
            ) : (
              <p className="detail-send__hint">
                Envío manual no disponible para este canal.
              </p>
            )}
          </div>
        </aside>

        <section className="detail-main panel-card detail-main--chat">
          <ChatMessages
            leadKey={lead.id}
            leadName={lead.nombre}
            canalLabel={CANAL_LABEL[lead.canalOrigen]}
            historial={lead.historial}
            fallbackMessage={lead.lastMessage}
            highlightKeys={highlightKeys}
            onConsumedHighlight={clearHighlight}
          />
        </section>
      </div>
    </div>
  );
}
