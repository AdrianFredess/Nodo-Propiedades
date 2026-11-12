import { useMemo, useState } from 'react';
import { config } from '../../shared/api/client';
import {
  ENTREVISTA_PREGUNTAS,
  MAX_RESPUESTA_CHARS,
  type EntrevistaPregunta,
} from './entrevista-preguntas';

export type GuiaTipo = 'estilo' | 'preguntar_antes' | 'derivar';
export type Tono = 'profesional_cercano' | 'formal' | 'distendido';

export interface EntrevistaDraft {
  inmobiliaria_nombre: string;
  asesor_nombre: string;
  tono: Tono;
  zonas: string[];
  operaciones: string[];
  guias: { tipo: GuiaTipo; texto: string }[];
  horario_humano_desde: string;
  horario_humano_hasta: string;
  ejemplo_estilo: string;
}

type Phase = 'chat' | 'review';

function entrevistaUrl(): string {
  const fromEnv = String(import.meta.env.VITE_ENTREVISTA_URL || '').trim();
  if (fromEnv) return fromEnv;
  const base = String(import.meta.env.VITE_PUBLIC_BASE_URL || 'http://localhost:5678').replace(
    /\/$/,
    '',
  );
  return `${base}/webhook/panel-entrevista-config`;
}

function panelHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = config.panelApiToken.trim();
  if (token) headers['X-Panel-Token'] = token;
  return headers;
}

function emptyDraft(answers: string[]): EntrevistaDraft {
  return {
    inmobiliaria_nombre: answers[0]?.slice(0, 120) || '',
    asesor_nombre: 'Matías',
    tono: 'profesional_cercano',
    zonas: answers[1]
      ? answers[1]
          .split(/[,;]/)
          .map((z) => z.trim())
          .filter(Boolean)
      : [],
    operaciones: ['venta', 'alquiler'],
    guias: answers[4]
      ? [{ tipo: 'preguntar_antes', texto: answers[4].slice(0, 300) }]
      : [],
    horario_humano_desde: '09:00',
    horario_humano_hasta: '18:00',
    ejemplo_estilo: (answers[3] || '').slice(0, 400),
  };
}

interface Props {
  onCancel: () => void;
  onSaved: (msg: string) => void;
  bridgeBase: string;
  baseConfig: Record<string, unknown>;
}

export function EntrevistaFlow({ onCancel, onSaved, bridgeBase, baseConfig }: Props) {
  const [phase, setPhase] = useState<Phase>('chat');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() =>
    ENTREVISTA_PREGUNTAS.map(() => ''),
  );
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const [draft, setDraft] = useState<EntrevistaDraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const pregunta: EntrevistaPregunta = ENTREVISTA_PREGUNTAS[step];
  const progressLabel = `Pregunta ${step + 1} de ${ENTREVISTA_PREGUNTAS.length}`;
  const valorActual = answers[step] ?? '';

  const reviewZonas = useMemo(
    () => (draft?.zonas ?? []).join(', '),
    [draft?.zonas],
  );

  async function generarBorrador() {
    setBusy(true);
    setStatus('Generando borrador…');
    setErrors([]);
    try {
      const respuestas = ENTREVISTA_PREGUNTAS.map((p, i) => ({
        id: p.id,
        pregunta: p.texto,
        respuesta: skipped.has(i) ? '' : String(answers[i] || '').trim(),
        saltada: skipped.has(i),
      }));
      const r = await fetch(entrevistaUrl(), {
        method: 'POST',
        headers: panelHeaders(true),
        body: JSON.stringify({ respuestas, preguntas: ENTREVISTA_PREGUNTAS }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        draft?: EntrevistaDraft;
        errors?: string[];
        error?: string;
      };
      if (!r.ok || !j.ok || !j.draft) {
        setErrors(j.errors || (j.error ? [j.error] : ['entrevista_fallo']));
        setStatus('No se pudo generar el borrador.');
        return;
      }
      setDraft(j.draft);
      setPhase('review');
      setStatus('');
    } catch {
      setStatus('No se pudo contactar n8n (PANEL-07).');
    } finally {
      setBusy(false);
    }
  }

  function completarAMano() {
    setDraft(emptyDraft(answers));
    setPhase('review');
    setErrors([]);
    setStatus('');
  }

  async function guardarBorrador() {
    if (!draft) return;
    setBusy(true);
    setStatus('Guardando…');
    const body = {
      ...baseConfig,
      tono: draft.tono,
      inmobiliaria_nombre: draft.inmobiliaria_nombre,
      asesor_nombre: draft.asesor_nombre,
      vendedor_nombre: draft.asesor_nombre,
      zonas: draft.zonas,
      operaciones: draft.operaciones,
      guias: draft.guias.filter((g) => g.texto.trim()),
      horario_humano_desde: draft.horario_humano_desde,
      horario_humano_hasta: draft.horario_humano_hasta,
      ejemplo_estilo: draft.ejemplo_estilo,
    };
    try {
      const r = await fetch(`${bridgeBase}/bot-config`, {
        method: 'POST',
        headers: panelHeaders(true),
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setStatus(j.error || 'No se pudo guardar');
        return;
      }
      onSaved('Listo. Matías responde así desde el próximo mensaje.');
    } catch {
      setStatus('Bridge offline.');
    } finally {
      setBusy(false);
    }
  }

  const progressPct = Math.round(((step + 1) / ENTREVISTA_PREGUNTAS.length) * 100);

  if (phase === 'review' && draft) {
    return (
      <section className="entrevista entrevista--review">
        <h2>Revisá el borrador</h2>
        <p className="muted">Ajustá lo que quieras antes de guardar.</p>
        <label>
          Inmobiliaria
          <input
            type="text"
            value={draft.inmobiliaria_nombre}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, inmobiliaria_nombre: e.target.value } : d))
            }
          />
        </label>
        <label>
          Nombre del asesor
          <input
            type="text"
            value={draft.asesor_nombre}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, asesor_nombre: e.target.value } : d))
            }
          />
        </label>
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
                name="entrevista-tono"
                checked={draft.tono === value}
                onChange={() => setDraft((d) => (d ? { ...d, tono: value } : d))}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label>
          Zonas (separadas por coma)
          <input
            type="text"
            value={reviewZonas}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      zonas: e.target.value
                        .split(',')
                        .map((z) => z.trim())
                        .filter(Boolean),
                    }
                  : d,
              )
            }
          />
        </label>
        <label>
          Desde
          <input
            type="time"
            value={draft.horario_humano_desde}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, horario_humano_desde: e.target.value } : d))
            }
          />
        </label>
        <label>
          Hasta
          <input
            type="time"
            value={draft.horario_humano_hasta}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, horario_humano_hasta: e.target.value } : d))
            }
          />
        </label>
        <div className="entrevista__guias">
          <h3>Guías</h3>
          {draft.guias.map((g, idx) => (
            <div key={`${g.tipo}-${idx}`} className="entrevista__guia-row">
              <select
                value={g.tipo}
                onChange={(e) =>
                  setDraft((d) => {
                    if (!d) return d;
                    const guias = [...d.guias];
                    guias[idx] = {
                      ...guias[idx],
                      tipo: e.target.value as GuiaTipo,
                    };
                    return { ...d, guias };
                  })
                }
              >
                <option value="estilo">Estilo</option>
                <option value="preguntar_antes">Preguntar antes</option>
                <option value="derivar">Derivar</option>
              </select>
              <textarea
                maxLength={300}
                value={g.texto}
                onChange={(e) =>
                  setDraft((d) => {
                    if (!d) return d;
                    const guias = [...d.guias];
                    guias[idx] = { ...guias[idx], texto: e.target.value };
                    return { ...d, guias };
                  })
                }
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  setDraft((d) =>
                    d ? { ...d, guias: d.guias.filter((_, i) => i !== idx) } : d,
                  )
                }
              >
                Borrar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={draft.guias.length >= 15}
            onClick={() =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      guias: [...d.guias, { tipo: 'estilo', texto: '' }],
                    }
                  : d,
              )
            }
          >
            Agregar guía
          </button>
        </div>
        <div className="entrevista__actions">
          <button type="button" className="btn btn--ghost" onClick={() => void generarBorrador()}>
            Regenerar
          </button>
          <button type="button" className="btn" onClick={() => void guardarBorrador()} disabled={busy}>
            Guardar
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cerrar
          </button>
        </div>
        {status ? <p className="config-bot__status">{status}</p> : null}
      </section>
    );
  }

  return (
    <section className="entrevista">
      <header className="entrevista__head">
        <h2>Configurar con una entrevista</h2>
        <p className="entrevista__progress">{progressLabel}</p>
        <div
          className="entrevista__bar"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="entrevista__bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </header>
      <p className="entrevista__pregunta">{pregunta.texto}</p>
      <p className="muted entrevista__ayuda">{pregunta.ayuda}</p>
      <textarea
        className="entrevista__input"
        maxLength={MAX_RESPUESTA_CHARS}
        rows={5}
        value={valorActual}
        onChange={(e) =>
          setAnswers((prev) => {
            const next = [...prev];
            next[step] = e.target.value.slice(0, MAX_RESPUESTA_CHARS);
            return next;
          })
        }
        placeholder="Tu respuesta…"
      />
      <p className="muted">
        {valorActual.length}/{MAX_RESPUESTA_CHARS}
      </p>
      <div className="entrevista__actions">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Atrás
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setSkipped((prev) => new Set(prev).add(step));
            setAnswers((prev) => {
              const next = [...prev];
              next[step] = '';
              return next;
            });
            if (step < ENTREVISTA_PREGUNTAS.length - 1) setStep((s) => s + 1);
            else void generarBorrador();
          }}
        >
          Saltear
        </button>
        {step < ENTREVISTA_PREGUNTAS.length - 1 ? (
          <button type="button" className="btn" onClick={() => setStep((s) => s + 1)}>
            Siguiente
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => void generarBorrador()}>
            Ver borrador
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {errors.length ? (
        <div className="entrevista__errors">
          <p>No validó el JSON ({errors.join(', ')}).</p>
          <button type="button" className="btn btn--ghost" onClick={completarAMano}>
            Completar a mano
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void generarBorrador()}>
            Regenerar
          </button>
        </div>
      ) : null}
      {status ? <p className="config-bot__status">{status}</p> : null}
    </section>
  );
}
