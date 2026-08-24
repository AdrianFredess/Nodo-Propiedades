import { useMemo, useState } from 'react';
import { sendTelegramBroadcast } from '../../shared/api/client';
import type { Lead } from '../../shared/types/lead';

interface BroadcastBarProps {
  leads: Lead[];
  selectedIds: Set<string>;
  onClear: () => void;
}

export function BroadcastBar({ leads, selectedIds, onClear }: BroadcastBarProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTelegram = useMemo(
    () =>
      leads.filter(
        (lead) =>
          selectedIds.has(lead.id) && lead.canalOrigen === 'telegram' && lead.chatId,
      ),
    [leads, selectedIds],
  );

  if (selectedTelegram.length === 0) return null;

  async function handleSend() {
    const body = text.trim();
    if (!body) {
      setError('Escribí un mensaje antes de enviar.');
      return;
    }
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await sendTelegramBroadcast({
        chat_ids: selectedTelegram.map((l) => l.chatId),
        text: body,
      });
      if (!result.ok) {
        setError(result.error ?? 'No se pudo enviar el mensaje.');
        return;
      }
      setMessage(
        `Mensaje enviado a ${result.sent ?? selectedTelegram.length} contacto(s) por Telegram.`,
      );
      setText('');
      onClear();
    } catch {
      setError('Error de conexión al enviar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}
      <div className="broadcast-bar panel-card">
        <div>
          <p style={{ marginBottom: '0.45rem', fontWeight: 650 }}>
            Mensaje a {selectedTelegram.length} seleccionado(s) · Telegram
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribí el mensaje que recibirán por Telegram…"
            aria-label="Texto del mensaje masivo"
          />
        </div>
        <div className="broadcast-bar__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={sending}
            onClick={() => void handleSend()}
          >
            {sending ? 'Enviando…' : 'Enviar por Telegram'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClear}>
            Limpiar selección
          </button>
        </div>
      </div>
    </>
  );
}
