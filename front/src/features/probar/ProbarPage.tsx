import { useCallback, useState } from 'react';
import { config } from '../../shared/api/client';

type ChatTurn = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  temperatura?: string;
  derivacion?: string;
  motivo?: string;
};

function newChatId(): string {
  const suffix = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `894${suffix}`;
}

function panelHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.panelApiToken) headers['X-Panel-Token'] = config.panelApiToken;
  return headers;
}

export function ProbarPage() {
  const [chatId, setChatId] = useState(() => newChatId());
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = useCallback(() => {
    setChatId(newChatId());
    setTurns([]);
    setInput('');
    setError('');
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: 'user', text };
    setTurns((t) => [...t, userTurn]);
    setInput('');
    try {
      const r = await fetch(config.probarBotUrl, {
        method: 'POST',
        headers: panelHeaders(),
        body: JSON.stringify({
          chat_id: chatId,
          text,
          nombre: 'Dueño prueba',
        }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        respuesta?: string;
        temperatura?: string;
        derivacion?: string;
        motivo?: string;
        error?: string;
      };
      if (!r.ok || j.ok === false) {
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      setTurns((t) => [
        ...t,
        {
          id: `b-${Date.now()}`,
          role: 'bot',
          text: String(j.respuesta || '—'),
          temperatura: j.temperatura ? String(j.temperatura) : undefined,
          derivacion: j.derivacion ? String(j.derivacion) : undefined,
          motivo: j.motivo ? String(j.motivo) : undefined,
        },
      ]);
    } catch {
      setError('No se pudo contactar el bot de prueba. Revisá que el panel esté conectado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="probar-page">
      <header>
        <h1>Probar a Matías</h1>
        <p className="probar-banner" role="status">
          Esto es una prueba: no le llega a ningún cliente.
        </p>
      </header>
      <div className="probar-chat" aria-live="polite">
        {turns.length === 0 ? (
          <p className="muted">Escribí un mensaje como si fueras un cliente.</p>
        ) : (
          turns.map((t) => (
            <div
              key={t.id}
              className={
                t.role === 'user' ? 'probar-msg probar-msg--user' : 'probar-msg'
              }
            >
              <div>{t.text}</div>
              {t.role === 'bot' && (t.temperatura || t.derivacion) ? (
                <p className="probar-msg__meta">
                  Temperatura: {t.temperatura || '—'} · Derivación: {t.derivacion || '—'}
                  {t.motivo ? ` (${t.motivo})` : ''}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
      {error ? <p className="error-banner">{error}</p> : null}
      <div className="probar-compose">
        <textarea
          rows={2}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Mensaje de prueba…"
        />
        <button type="button" className="btn" disabled={busy || !input.trim()} onClick={() => void send()}>
          Enviar
        </button>
        <button type="button" className="btn btn--ghost" onClick={reset}>
          Empezar de nuevo
        </button>
      </div>
    </div>
  );
}
