import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  emitRealtime,
  sendTelegramBroadcast,
  sendWhatsAppMessage,
  updateLeadSeguimiento,
} from '../../shared/api/client';
import {
  buildAgendaMessage,
  buildFichasMessage,
} from '../../shared/lib/fichaMessage';
import {
  CANAL_LABEL,
  SEGUIMIENTO_LABEL,
  TEMPERATURA_LABEL,
} from '../../shared/lib/labels';
import { CanalChip } from '../../shared/ui/CanalChip';
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

const PROP_ID_RE = /\b(MZA-\d{3})\b/gi;

function extractPropiedadesVistas(lead: Lead): string[] {
  const ids = new Set<string>();
  if (lead.propiedadId) ids.add(lead.propiedadId.toUpperCase());
  const ref = lead.propiedadReferencia || '';
  const refMatch = ref.match(/\b(MZA-\d{3})\b/i);
  if (refMatch) ids.add(refMatch[0].toUpperCase());
  try {
    const parsed = JSON.parse(ref);
    if (parsed?.id) ids.add(String(parsed.id).toUpperCase());
  } catch {
    /* not JSON */
  }
  for (const h of lead.historial) {
    const blob = `${h.mensajeCliente} ${h.respuestaBot}`;
    let m: RegExpExecArray | null;
    const re = new RegExp(PROP_ID_RE.source, PROP_ID_RE.flags);
    while ((m = re.exec(blob)) !== null) {
      ids.add(m[0].toUpperCase());
    }
  }
  return [...ids];
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

  const propiedadesVistas = useMemo(
    () => (lead ? extractPropiedadesVistas(lead) : []),
    [lead],
  );

  const clearHighlight = useCallback(() => {
    onClearHighlight?.();
  }, [onClearHighlight]);

  if (!lead && loading) {
    return <div className="empty-state">Cargando…</div>;
  }

  if (!lead) {
    return (
      <div className="page-frame page-frame--detail">
        <header className="page-head page-head--compact page-head--detail">
          <div>
            <h1>Lead no encontrado</h1>
            <p>Volvé al pipeline.</p>
          </div>
        </header>
        <Link className="btn btn--ghost btn--sm" to="/pipeline">
          Volver
        </Link>
      </div>
    );
  }

  const canSendTelegram =
    lead.canalOrigen === 'telegram' && Boolean(lead.chatId);
  const canSendWhatsApp =
    lead.canalOrigen === 'whatsapp' && Boolean(lead.chatId);
  const canSend = canSendTelegram || canSendWhatsApp;
  const botPaused = Boolean(lead.botPaused || lead.handoff);

  async function handleSend(overrideText?: string) {
    const body = (overrideText ?? text).trim();
    if (!body) {
      setError('Escribí un mensaje.');
      return;
    }
    if (!canSend || !lead) {
      setError('Este canal no admite envío desde el panel.');
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
          setError(result.error ?? 'No se pudo enviar.');
          return;
        }
      } else {
        const result = await sendWhatsAppMessage({
          chatId: lead.chatId,
          text: body,
        });
        if (!result.ok) {
          setError(result.error ?? 'No se pudo enviar.');
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
      setOkMsg('Enviado');
      if (!overrideText) setText('');
      window.setTimeout(() => setOkMsg(null), 2200);
    } catch {
      setError('Error de conexión.');
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
    try {
      const result = await updateLeadSeguimiento({
        chatId: lead.chatId,
        estadoSeguimiento,
        status,
      });
      if (!result.ok) {
        setError(result.error ?? 'No se pudo actualizar.');
        return;
      }
      onLeadPatch?.(lead.id, {
        estadoSeguimiento,
        ...(status ? { status } : {}),
      });
      setOkMsg('Listo');
      window.setTimeout(() => setOkMsg(null), 1800);
    } catch {
      setError('Error de conexión.');
    } finally {
      setUpdatingSeg(false);
    }
  }

  function handleReactivarBot() {
    onLeadPatch?.(lead.id, { botPaused: false, handoff: false });
    setOkMsg('Bot reactivado en panel (marcá bot_paused=no en Sheets si hace falta)');
    window.setTimeout(() => setOkMsg(null), 2800);
  }

  return (
    <div className="page-frame page-frame--detail">
      <header className="page-head page-head--compact page-head--detail">
        <div>
          <h1>{lead.nombre}</h1>
          <p className="lead-detail__channel-meta">
            <CanalChip canal={lead.canalOrigen} />
            <span className={`chip chip--sm chip--${lead.temperatura}`}>
              {TEMPERATURA_LABEL[lead.temperatura]}
            </span>
            {botPaused ? (
              <span className="chip chip--sm chip--paused">Bot pausado</span>
            ) : null}
            <span>{relativeTimeFrom(lead.ultimaActualizacion)}</span>
          </p>
        </div>
        <Link className="btn btn--ghost btn--sm" to="/pipeline">
          Volver
        </Link>
      </header>

      {botPaused ? (
        <div className="handoff-banner" role="status">
          <div>
            <strong>Te toca a vos</strong>
            <p>La IA dejó de responder. Enviá ficha o link con un clic.</p>
          </div>
          <div className="handoff-banner__actions">
            {propiedadesVistas.length > 0 && canSend ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={sending}
                onClick={() =>
                  void handleSend(buildFichasMessage(propiedadesVistas))
                }
              >
                Enviar ficha
              </button>
            ) : null}
            {canSend ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={sending}
                onClick={() =>
                  void handleSend(
                    buildAgendaMessage('', {
                      chatId: lead.chatId,
                      nombre: lead.nombre,
                      canal: lead.canalOrigen,
                    }),
                  )
                }
              >
                Enviar link visita
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleReactivarBot}
            >
              Reactivar bot
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="error-banner error-banner--compact">{error}</div>
      ) : null}
      {okMsg ? (
        <div className="success-banner success-banner--compact">{okMsg}</div>
      ) : null}

      <div className="detail-layout detail-layout--fill">
        <aside className="detail-side panel-card detail-side--compact">
          <h2 className="detail-section-title">Cliente</h2>
          <dl className="detail-meta">
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
              <dd>{lead.tipoOperacion || 'Venta'}</dd>
            </div>
            <div>
              <dt>Seguimiento</dt>
              <dd>{SEGUIMIENTO_LABEL[lead.estadoSeguimiento]}</dd>
            </div>
            <div>
              <dt>Actualizado</dt>
              <dd>{formatDateTime(lead.ultimaActualizacion)}</dd>
            </div>
          </dl>

          {propiedadesVistas.length > 0 ? (
            <div className="detail-props-vistas">
              <h2 className="detail-section-title detail-section-title--spaced">
                Propiedades
              </h2>
              <ul className="detail-props-vistas__list">
                {propiedadesVistas.map((id) => (
                  <li key={id}>
                    <Link to={`/catalogo/${encodeURIComponent(id)}`}>{id}</Link>
                    {canSend ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        disabled={sending}
                        onClick={() => void handleSend(buildFichasMessage([id]))}
                      >
                        Enviar
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="detail-send detail-send--compact">
            <h2 className="detail-section-title detail-section-title--spaced">
              Escribile
            </h2>
            {canSend ? (
              <>
                <textarea
                  className="detail-send__textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    canSendTelegram ? 'Mensaje…' : 'Mensaje WhatsApp…'
                  }
                  aria-label="Mensaje"
                  rows={3}
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
                  {sending ? 'Enviando…' : 'Enviar'}
                </button>
              </>
            ) : (
              <p className="detail-send__hint">
                Envío no disponible en este canal.
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn btn--ghost btn--sm detail-side__mute"
            disabled={updatingSeg}
            onClick={() => void handleSeguimiento('cerrado', 'cerrado')}
          >
            Pausar recordatorios auto
          </button>
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
