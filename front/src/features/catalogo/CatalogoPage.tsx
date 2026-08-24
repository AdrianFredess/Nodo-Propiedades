import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  switch (key) {
    case 'precio':
      return mul * (parsePrecio(a.precio) - parsePrecio(b.precio));
    case 'interesados': {
      const ai = a.interesadosCount ?? a.interesados?.length ?? 0;
      const bi = b.interesadosCount ?? b.interesados?.length ?? 0;
      return mul * (ai - bi);
    }
    case 'ambientes': {
      const ai = Number.parseInt(String(a.ambientes), 10) || 0;
      const bi = Number.parseInt(String(b.ambientes), 10) || 0;
      return mul * (ai - bi);
    }
    default: {
      const av = String(a[key] ?? '');
      const bv = String(b[key] ?? '');
      return mul * av.localeCompare(bv, 'es', { numeric: true, sensitivity: 'base' });
    }
  }
}

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

export function CatalogoPage({
  propiedades,
  loading = false,
  error = null,
  realtimeLabel,
  onLocalPatch,
}: CatalogoPageProps) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('interesados');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
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
          <h1>Catálogo de propiedades</h1>
          <p>
            Planilla editable · click en celda para editar · Enter guarda · Esc
            cancela. ID / interesados abren el detalle.
          </p>
        </div>
        <div className="badge-live">
          <span className="badge-live__dot" />
          {sorted.length} propiedades
          {realtimeLabel ? ` · ${realtimeLabel}` : ''}
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
                return (
                  <tr key={p.id}>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
