import { useEffect, useMemo, useState } from 'react';
import { config } from '../../shared/api/client';

type Tono = 'profesional_cercano' | 'formal' | 'distendido';
type Umbral = 'conservador' | 'normal' | 'agresivo';
type MsgDeriv = 'te_paso' | 'ya_aviso' | 'te_contacta';

export interface BotConfig {
  tono: Tono;
  umbral_derivacion: Umbral;
  horario_humano_desde: string;
  horario_humano_hasta: string;
  mensaje_derivacion: MsgDeriv;
  vendedor_nombre: string;
  panel_base_url: string;
}

const DEFAULTS: BotConfig = {
  tono: 'profesional_cercano',
  umbral_derivacion: 'normal',
  horario_humano_desde: '09:00',
  horario_humano_hasta: '18:00',
  mensaje_derivacion: 'te_paso',
  vendedor_nombre: 'Adrian',
  panel_base_url: 'http://localhost:5173',
};

function previewText(c: BotConfig): string {
  const tonoLabel =
    c.tono === 'formal'
      ? 'Formal, frases completas, menos slang.'
      : c.tono === 'distendido'
        ? 'Mas informal, corto, tipo chat.'
        : 'Profesional cercano (default Matias).';
  const umbralLabel =
    c.umbral_derivacion === 'conservador'
      ? 'Deriva tarde; tolera mas ambiguedad.'
      : c.umbral_derivacion === 'agresivo'
        ? 'Avisa al vendedor antes ante dudas.'
        : 'Equilibrio normal A/B/C.';
  const msg =
    c.mensaje_derivacion === 'ya_aviso'
      ? `Dale, ya le aviso a ${c.vendedor_nombre} y te escribe por aca.`
      : c.mensaje_derivacion === 'te_contacta'
        ? `${c.vendedor_nombre} te va a escribir en un rato para seguir con esto.`
        : `Te paso con ${c.vendedor_nombre}, en un momento te escribe.`;
  return [
    `Tono: ${tonoLabel}`,
    `Derivacion: ${umbralLabel}`,
    `Horario humano: ${c.horario_humano_desde}–${c.horario_humano_hasta}`,
    `Si deriva (C), el cliente ve: “${msg}”`,
  ].join('\n');
}

function bridgeBase(): string {
  const fromEnv = String(import.meta.env.VITE_WS_BRIDGE_HTTP || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'http://127.0.0.1:3099';
}

export function ConfigBotPage() {
  const [cfg, setCfg] = useState<BotConfig>(DEFAULTS);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<{ id: string }[]>([]);
  const preview = useMemo(() => previewText(cfg), [cfg]);

  async function loadHistory() {
    try {
      const r = await fetch(`${bridgeBase()}/bot-config/history`);
      const j = (await r.json()) as { items?: { id: string }[] };
      setHistory(j.items || []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${bridgeBase()}/bot-config`);
        const j = (await r.json()) as { config?: BotConfig };
        if (!cancelled && j.config) setCfg({ ...DEFAULTS, ...j.config });
      } catch {
        const raw = localStorage.getItem('nodo_bot_config');
        if (!cancelled && raw) {
          try {
            setCfg({ ...DEFAULTS, ...JSON.parse(raw) });
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) void loadHistory();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setStatus('Guardando…');
    localStorage.setItem('nodo_bot_config', JSON.stringify(cfg));
    try {
      const r = await fetch(`${bridgeBase()}/bot-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const j = (await r.json()) as { ok?: boolean; note?: string; error?: string };
      if (!r.ok || !j.ok) {
        setStatus(j.error || 'No se pudo guardar en el bridge');
        return;
      }
      setStatus(
        (j.note || 'Guardado.') +
          ' Para n8n vivo: node scripts/patch-advisor-learning.js --deploy',
      );
      void loadHistory();
    } catch {
      setStatus('Guardado local. Bridge offline — revisá ws-bridge :3099');
    }
  }

  async function restore(id: string) {
    setStatus('Restaurando…');
    try {
      const r = await fetch(`${bridgeBase()}/bot-config/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = (await r.json()) as { ok?: boolean; config?: BotConfig; error?: string };
      if (!r.ok || !j.ok || !j.config) {
        setStatus(j.error || 'No se pudo restaurar');
        return;
      }
      setCfg({ ...DEFAULTS, ...j.config });
      localStorage.setItem('nodo_bot_config', JSON.stringify(j.config));
      setStatus('Restaurado. Para n8n vivo: node scripts/patch-advisor-learning.js --deploy');
      void loadHistory();
    } catch {
      setStatus('Bridge offline — revisá ws-bridge :3099');
    }
  }

  if (loading) return <p className="muted">Cargando config…</p>;

  return (
    <div className="config-bot">
      <header className="config-bot__head">
        <h1>Configuración del bot</h1>
        <p>
          Un solo vendedor ({cfg.vendedor_nombre}). Opciones fijas — el prompt base no se
          reescribe.
        </p>
        {config.useMock ? (
          <p className="muted">Modo mock: la config igual se guarda en el bridge/archivo.</p>
        ) : null}
      </header>

      <div className="config-bot__grid">
        <section className="config-bot__form">
          <fieldset>
            <legend>Tono</legend>
            {(
              [
                ['profesional_cercano', 'Profesional cercano'],
                ['formal', 'Formal'],
                ['distendido', 'Distendido'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="tono"
                  checked={cfg.tono === value}
                  onChange={() => setCfg((c) => ({ ...c, tono: value }))}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Umbral de derivación</legend>
            {(
              [
                ['conservador', 'Conservador'],
                ['normal', 'Normal'],
                ['agresivo', 'Agresivo (avisa antes)'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="umbral"
                  checked={cfg.umbral_derivacion === value}
                  onChange={() =>
                    setCfg((c) => ({ ...c, umbral_derivacion: value }))
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Horario atención humana</legend>
            <label>
              Desde
              <input
                type="time"
                value={cfg.horario_humano_desde}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    horario_humano_desde: e.target.value,
                  }))
                }
              />
            </label>
            <label>
              Hasta
              <input
                type="time"
                value={cfg.horario_humano_hasta}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    horario_humano_hasta: e.target.value,
                  }))
                }
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>Mensaje al derivar (C)</legend>
            {(
              [
                ['te_paso', 'Te paso con [nombre]…'],
                ['ya_aviso', 'Ya le aviso a [nombre]…'],
                ['te_contacta', '[nombre] te va a escribir…'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="msg"
                  checked={cfg.mensaje_derivacion === value}
                  onChange={() =>
                    setCfg((c) => ({ ...c, mensaje_derivacion: value }))
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>

          <label>
            Nombre del vendedor
            <input
              type="text"
              value={cfg.vendedor_nombre}
              onChange={(e) =>
                setCfg((c) => ({ ...c, vendedor_nombre: e.target.value }))
              }
            />
          </label>

          <button type="button" className="btn" onClick={() => void save()}>
            Guardar
          </button>
          {history.length > 0 ? (
            <div>
              <h2>Versiones anteriores</h2>
              <ul>
                {history.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => void restore(item.id)}
                    >
                      Restaurar {item.id.replace('.json', '')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {status ? <p className="config-bot__status">{status}</p> : null}
        </section>

        <aside className="config-bot__preview">
          <h2>Vista previa</h2>
          <pre>{preview}</pre>
        </aside>
      </div>
    </div>
  );
}
