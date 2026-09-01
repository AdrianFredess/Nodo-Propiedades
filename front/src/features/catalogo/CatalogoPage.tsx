import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { updateStockCell } from '../../shared/api/client';
import type { Propiedad } from '../../shared/types/lead';
import { EditableCell } from './EditableCell';

interface CatalogoPageProps {
  propiedades: Propiedad[];
  loading?: boolean;
  error?: string | null;
  realtimeLabel?: string;
  onLocalPatch?: (id: string, patch: Partial<Propiedad>) => void;
}

type SortKey =
  | 'id'
  | 'zona'
  | 'tipo'
  | 'operacion'
  | 'precio'
  | 'ambientes'
  | 'interesados'
  | 'estado';

type SortDir = 'asc' | 'desc';

type EditableField = Exclude<SortKey, 'id' | 'interesados'>;

function parsePrecio(raw: string): number {
  const n = Number(
    String(raw).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'),
  );
  return Number.isFinite(n) ? n : 0;
}

function compareProp(
  a: Propiedad,
  b: Propiedad,
  key: SortKey,
  dir: SortDir,
): number {
  const mul = dir === 'asc' ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case 'precio':
      cmp = parsePrecio(a.precio) - parsePrecio(b.precio);
      break;
    case 'interesados': {
      const ai = a.interesadosCount ?? a.interesados?.length ?? 0;
      const bi = b.interesadosCount ?? b.interesados?.length ?? 0;
      cmp = ai - bi;
      break;
    }
    case 'ambientes': {
      const ai = Number.parseInt(String(a.ambientes), 10) || 0;
      const bi = Number.parseInt(String(b.ambientes), 10) || 0;
      cmp = ai - bi;
      break;
    }
    default: {
      const av = String(a[key] ?? '');
      const bv = String(b[key] ?? '');
      cmp = av.localeCompare(bv, 'es', { numeric: true, sensitivity: 'base' });
    }
  }
  if (cmp !== 0) return mul * cmp;
  return a.id.localeCompare(b.id, 'es', { numeric: true, sensitivity: 'base' });
}

const SORT_PRESETS: { key: SortKey; dir: SortDir; label: string }[] = [
  { key: 'precio', dir: 'asc', label: 'Precio ↑' },
  { key: 'precio', dir: 'desc', label: 'Precio ↓' },
  { key: 'zona', dir: 'asc', label: 'Zona A–Z' },
  { key: 'zona', dir: 'desc', label: 'Zona Z–A' },
  { key: 'id', dir: 'asc', label: 'ID' },
  { key: 'interesados', dir: 'desc', label: 'Interesados' },
];

const COLUMNS: {
  key: SortKey;
  label: string;
  editable?: boolean;
  multiline?: boolean;
  mono?: boolean;
  numeric?: boolean;
}[] = [
  { key: 'id', label: 'ID', mono: true },
  { key: 'zona', label: 'Zona', editable: true, multiline: true },
  { key: 'tipo', label: 'Tipo', editable: true, multiline: true },
  { key: 'operacion', label: 'Operación', editable: true },
  { key: 'precio', label: 'Precio', editable: true, numeric: true },
  { key: 'ambientes', label: 'Amb.', editable: true, numeric: true },
  { key: 'interesados', label: 'Interesados', numeric: true },
  { key: 'estado', label: 'Estado', editable: true },
];

function friendlyError(error: string | null | undefined): string | null {
  if (!error) return null;
  if (/too many requests|quota|429|rate.?limit/i.test(error)) {
    return 'Google Sheets está limitando lecturas (cuota). El catálogo se reintenta solo; no hace falta refrescar a mano.';
  }
  return error;
}

function cellValue(p: Propiedad, key: EditableField): string {
  return String(p[key] ?? '');
}

function CatalogoExpandPreview({ propiedad }: { propiedad: Propiedad }) {
  const detailPath = `/catalogo/${encodeURIComponent(propiedad.id)}`;
  const foto = propiedad.fotos?.[0];
  const count =
    propiedad.interesadosCount ?? propiedad.interesados?.length ?? 0;

  return (
    <div className="catalogo-expand">
      {foto ? (
        <img
          className="catalogo-expand__thumb"
          src={foto}
          alt=""
          loading="lazy"
        />
      ) : (
        <div className="catalogo-expand__thumb catalogo-expand__thumb--empty" />
      )}
      <div className="catalogo-expand__body">
        <div className="catalogo-expand__meta">
          {propiedad.operacion ? (
            <span className="chip chip--sm chip--neutral">{propiedad.operacion}</span>
          ) : null}
          {propiedad.estado ? (
            <span className="chip chip--sm chip--neutral">{propiedad.estado}</span>
          ) : null}
          {count > 0 ? (
            <span className="catalogo-expand__count">
              {count} interesado{count === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {propiedad.descripcion ? (
          <p className="catalogo-expand__desc">{propiedad.descripcion}</p>
        ) : (
          <p className="catalogo-expand__desc catalogo-expand__desc--muted">
            Sin descripción cargada.
          </p>
        )}
        <div className="catalogo-expand__actions">
          <Link className="btn btn--ghost btn--sm" to={detailPath}>
            Ver ficha completa
          </Link>
          {propiedad.linkFicha ? (
            <a
              className="btn btn--ghost btn--sm"
              href={propiedad.linkFicha}
              target="_blank"
              rel="noreferrer"
            >
              Link externo
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CatalogoPage({
  propiedades,
  loading = false,
  error = null,
  realtimeLabel,
  onLocalPatch,
}: CatalogoPageProps) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('precio');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [saveError, setSaveError] = useState<string | null>(null);
  const softError = friendlyError(error);

  const sorted = useMemo(
    () => [...propiedades].sort((a, b) => compareProp(a, b, sortKey, sortDir)),
    [propiedades, sortKey, sortDir],
  );

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'interesados' || key === 'precio' ? 'desc' : 'asc');
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function saveCell(id: string, field: EditableField, value: string) {
    const prev = propiedades.find((p) => p.id === id);
    const prevVal = prev ? cellValue(prev, field) : '';
    onLocalPatch?.(id, { [field]: value });
    setSaveError(null);
    const res = await updateStockCell({ id, field, value });
    if (!res.ok) {
      onLocalPatch?.(id, { [field]: prevVal });
      setSaveError(res.error || 'No se pudo guardar en Sheets');
      throw new Error(res.error || 'save_failed');
    }
  }

  return (
    <div className="page-frame page-frame--catalogo catalogo">
      <header className="page-head page-head--compact">
        <div>
          <h1>Catálogo</h1>
        </div>
        <div className="catalogo-toolbar">
          <label className="catalogo-sort">
            <span className="catalogo-sort__label">Orden</span>
            <select
              className="catalogo-sort__select"
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(':') as [SortKey, SortDir];
                setSortKey(key);
                setSortDir(dir);
              }}
              aria-label="Ordenar propiedades"
            >
              {SORT_PRESETS.map((preset) => (
                <option
                  key={`${preset.key}:${preset.dir}`}
                  value={`${preset.key}:${preset.dir}`}
                >
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className="badge-live">
            <span className="badge-live__dot" />
            {sorted.length}
            {realtimeLabel ? ` · ${realtimeLabel}` : ''}
          </div>
        </div>
      </header>

      {softError ? <div className="error-banner">{softError}</div> : null}
      {saveError ? <div className="error-banner">{saveError}</div> : null}

      {loading && sorted.length === 0 ? (
        <div className="empty-state">Cargando catálogo…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          No hay propiedades en el stock o no se pudo leer la planilla.
        </div>
      ) : (
        <div className="sheet-wrap sheet-wrap--fill">
          <table className="sheet-table sheet-table--editable">
            <thead>
              <tr>
                <th scope="col" className="sheet-table__expand-col" aria-label="Expandir" />
                {COLUMNS.map((col) => {
                  const active = sortKey === col.key;
                  return (
                    <th key={col.key} scope="col">
                      <button
                        type="button"
                        className={`sheet-table__sort${active ? ' is-active' : ''}`}
                        onClick={() => onSort(col.key)}
                      >
                        {col.label}
                        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const count =
                  p.interesadosCount ?? p.interesados?.length ?? 0;
                const openDetail = () =>
                  navigate(`/catalogo/${encodeURIComponent(p.id)}`);
                const expanded = expandedId === p.id;

                return (
                  <Fragment key={p.id}>
                    <tr className={expanded ? 'is-expanded' : undefined}>
                      <td className="sheet-table__expand-col">
                        <button
                          type="button"
                          className={`catalogo-expand-btn${expanded ? ' is-open' : ''}`}
                          onClick={() => toggleExpand(p.id)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Cerrar' : 'Expandir'} ${p.id}`}
                        >
                          ›
                        </button>
                      </td>
                      {COLUMNS.map((col) => {
                        if (col.key === 'interesados') {
                          return (
                            <td key={col.key} className="sheet-table__num">
                              <button
                                type="button"
                                className="sheet-cell__readonly"
                                onClick={openDetail}
                                aria-label={`Ver interesados de ${p.id}`}
                              >
                                {count > 0 ? (
                                  <span className="sheet-table__count">
                                    {count}
                                  </span>
                                ) : (
                                  '0'
                                )}
                              </button>
                            </td>
                          );
                        }
                        if (col.key === 'id') {
                          return (
                            <td key={col.key}>
                              <EditableCell
                                value={p.id || '—'}
                                editable={false}
                                mono
                                ariaLabel={`Abrir ${p.id}`}
                                onSave={() => undefined}
                                onOpenRow={openDetail}
                              />
                            </td>
                          );
                        }
                        const field = col.key as EditableField;
                        return (
                          <td key={col.key}>
                            <EditableCell
                              value={cellValue(p, field)}
                              editable={Boolean(col.editable)}
                              multiline={Boolean(col.multiline)}
                              numeric={Boolean(col.numeric)}
                              ariaLabel={`${col.label} de ${p.id}`}
                              onSave={(next) => saveCell(p.id, field, next)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                    {expanded ? (
                      <tr className="catalogo-expand-row">
                        <td colSpan={COLUMNS.length + 1}>
                          <CatalogoExpandPreview propiedad={p} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
