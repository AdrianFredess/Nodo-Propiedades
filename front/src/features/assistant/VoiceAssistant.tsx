import { useState, type FormEvent } from 'react';
import type { RealtimeStatus } from '../../shared/hooks/useRealtime';
import type { Lead } from '../../shared/types/lead';
import { AssistantIcon } from './AssistantIcon';
import { useVoiceAssistant } from './useVoiceAssistant';

const QUICK_COMMANDS = [
  'Poneme al día',
  '¿Qué pasó en Telegram?',
  'Resumen de ayer',
  '¿A quién le hablo?',
  'Ayuda',
] as const;

interface VoiceAssistantProps {
  leads: Lead[];
  realtimeStatus?: RealtimeStatus;
  onRefreshLeads?: () => Promise<Lead[]>;
}

export function VoiceAssistant({
  leads,
  realtimeStatus = 'off',
  onRefreshLeads,
}: VoiceAssistantProps) {
  const assistant = useVoiceAssistant({ leads, realtimeStatus, onRefreshLeads });
  const [textInput, setTextInput] = useState('');

  const busy =
    assistant.listening ||
    assistant.thinking ||
    assistant.speaking ||
    assistant.syncing;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = textInput.trim();
    if (!t || busy) return;
    setTextInput('');
    void assistant.submitText(t);
  };

  const runQuick = (cmd: string) => {
    if (busy) return;
    void assistant.submitText(cmd);
  };

  const statusLabel = assistant.syncing
    ? 'Sincronizando Telegram y panel…'
    : assistant.listening
    ? 'Escuchando…'
    : assistant.thinking
      ? 'Pensando…'
      : assistant.speaking
        ? 'Hablando…'
        : assistant.realtimeConnected
          ? 'Conectado en vivo — al día con canales'
          : 'Listo — leyendo historial del panel';

  return (
    <>
      <button
        type="button"
        className={`assistant-fab${assistant.open ? ' assistant-fab--open' : ''}${assistant.listening ? ' assistant-fab--active' : ''}${assistant.thinking ? ' assistant-fab--thinking' : ''}${assistant.realtimeConnected ? ' assistant-fab--live' : ''}`}
        aria-label="Asistente — comandos de voz"
        title="Asistente"
        onClick={() => {
          if (assistant.listening) {
            assistant.stopListening();
          } else if (assistant.open) {
            assistant.setOpen(false);
          } else {
            assistant.setOpen(true);
            assistant.startListening();
          }
        }}
      >
        <span className="assistant-fab__icon" aria-hidden>
          <AssistantIcon size={24} />
        </span>
        {assistant.realtimeConnected ? (
          <span className="assistant-fab__live-dot" aria-hidden />
        ) : null}
      </button>

      {assistant.open ? (
        <div
          className="assistant-panel"
          role="dialog"
          aria-label="Asistente del panel"
        >
          <header className="assistant-panel__head">
            <div className="assistant-panel__brand">
              <span className="assistant-panel__brand-icon" aria-hidden>
                <AssistantIcon size={18} />
              </span>
              <div>
                <strong className="assistant-panel__title">Asistente</strong>
                <span
                  className={`assistant-panel__sub${assistant.realtimeConnected ? ' assistant-panel__sub--live' : ''}`}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="assistant-panel__close"
              onClick={() => {
                assistant.stopListening();
                assistant.setOpen(false);
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </header>

          <div className="assistant-panel__messages">
            {assistant.messages.length === 0 ? (
              <div className="assistant-panel__welcome">
                <p>
                  Hola, soy tu Asistente. Al abrir reviso Telegram, WhatsApp y el
                  panel para ponerte al día.
                </p>
                <p className="assistant-panel__hint">
                  Probá: «poneme al día», «qué pasó en Telegram», «resumen de
                  ayer».
                </p>
              </div>
            ) : (
              assistant.messages.map((m) => (
                <div
                  key={m.id}
                  className={`assistant-msg assistant-msg--${m.role}`}
                >
                  {m.text}
                </div>
              ))
            )}
            {assistant.interim ? (
              <div className="assistant-msg assistant-msg--interim">
                {assistant.interim}
              </div>
            ) : null}
            {assistant.thinking ? (
              <div
                className="assistant-msg assistant-msg--thinking"
                aria-live="polite"
              >
                <span className="assistant-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            ) : null}
          </div>

          {assistant.lastReply?.leads?.length ? (
            <div className="assistant-panel__cards">
              {assistant.lastReply.leads.slice(0, 4).map((lead) => (
                <div key={lead.id} className="assistant-card">
                  <strong>{lead.nombre || 'Sin nombre'}</strong>
                  <span>
                    {[lead.zona, lead.presupuesto, lead.temperatura]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="assistant-panel__chips">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                className="assistant-chip"
                disabled={busy}
                onClick={() => runQuick(cmd)}
              >
                {cmd}
              </button>
            ))}
          </div>

          {assistant.error ? (
            <div className="assistant-panel__error">{assistant.error}</div>
          ) : null}

          <form className="assistant-panel__form" onSubmit={onSubmit}>
            <input
              className="assistant-panel__input"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Escribí un comando…"
              aria-label="Comando de texto"
              disabled={busy}
            />
            <button
              type="submit"
              className="assistant-panel__send"
              disabled={busy || !textInput.trim()}
            >
              Enviar
            </button>
          </form>

          <footer className="assistant-panel__foot">
            <label className="assistant-panel__toggle">
              <input
                type="checkbox"
                checked={assistant.voiceEnabled}
                onChange={(e) => assistant.setVoiceEnabled(e.target.checked)}
              />
              Voz
            </label>
            <label className="assistant-panel__toggle">
              <input
                type="checkbox"
                checked={assistant.liveAlerts}
                onChange={(e) => assistant.setLiveAlerts(e.target.checked)}
                disabled={!assistant.realtimeConnected}
              />
              Avisos Telegram
            </label>
            <span className="assistant-panel__tts" title={assistant.ttsVoiceLabel}>
              {assistant.ttsVoiceLabel}
            </span>
          </footer>
        </div>
      ) : null}
    </>
  );
}
