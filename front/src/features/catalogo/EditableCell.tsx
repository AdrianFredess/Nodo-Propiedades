import { useEffect, useRef, useState } from 'react';

interface EditableCellProps {
  value: string;
  /** Si false, solo muestra texto (id / interesados). */
  editable?: boolean;
  multiline?: boolean;
  mono?: boolean;
  numeric?: boolean;
  ariaLabel: string;
  onSave: (next: string) => Promise<void> | void;
  onOpenRow?: () => void;
}

/**
 * Celda inline: click edita, Enter/blur guarda, Esc cancela.
 * multiline = wrap + auto-height sin romper scroll de la tabla.
 */
export function EditableCell({
  value,
  editable = true,
  multiline = false,
  mono = false,
  numeric = false,
  ariaLabel,
  onSave,
  onOpenRow,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? taRef.current : inputRef.current;
    el?.focus();
    el?.select();
    if (multiline && taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = `${Math.max(28, taRef.current.scrollHeight)}px`;
    }
  }, [editing, multiline]);

  async function commit() {
    const next = draft;
    if (next === value) {
      setEditing(false);
      setError(false);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      setError(true);
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
    setError(false);
  }

  const className = [
    'sheet-cell',
    mono ? 'sheet-cell--mono' : '',
    numeric ? 'sheet-cell--num' : '',
    multiline ? 'sheet-cell--wrap' : '',
    editable ? 'sheet-cell--editable' : '',
    editing ? 'is-editing' : '',
    saving ? 'is-saving' : '',
    error ? 'is-error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!editable) {
    return (
      <div className={className}>
        <button
          type="button"
          className="sheet-cell__readonly"
          onClick={onOpenRow}
          aria-label={ariaLabel}
        >
          {value || '—'}
        </button>
      </div>
    );
  }

  if (editing) {
    if (multiline) {
      return (
        <div className={className}>
          <textarea
            ref={taRef}
            className="sheet-cell__input sheet-cell__input--area"
            aria-label={ariaLabel}
            rows={2}
            value={draft}
            disabled={saving}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.max(28, e.target.scrollHeight)}px`;
            }}
            onBlur={() => {
              void commit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void commit();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      );
    }
    return (
      <div className={className}>
        <input
          ref={inputRef}
          className="sheet-cell__input"
          aria-label={ariaLabel}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="sheet-cell__display"
        aria-label={`Editar ${ariaLabel}`}
        title="Click para editar"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        {value || '—'}
      </button>
    </div>
  );
}
