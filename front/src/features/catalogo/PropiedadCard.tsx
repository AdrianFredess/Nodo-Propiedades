import { Link } from 'react-router-dom';
import {
  CANAL_LABEL,
  PIPELINE_COLUMNA_LABEL,
  TEMPERATURA_LABEL,
} from '../../shared/lib/labels';
import { relativeTimeFrom } from '../../shared/lib/time';
import type { Propiedad } from '../../shared/types/lead';

interface PropiedadCardProps {
  propiedad: Propiedad;
}

export function PropiedadCard({ propiedad }: PropiedadCardProps) {
  const count = propiedad.interesadosCount ?? propiedad.interesados?.length ?? 0;
  const detailPath = `/catalogo/${encodeURIComponent(propiedad.id)}`;

  return (
    <Link to={detailPath} className="prop-card panel-card">
      <div className="prop-card__top">
        <span className="prop-card__id">#{propiedad.id}</span>
        {propiedad.estado ? (
          <span className="chip chip--sm chip--neutral">{propiedad.estado}</span>
        ) : null}
      </div>
      <h2 className="prop-card__title">
        {propiedad.tipo || 'Propiedad'} · {propiedad.zona || 'Sin zona'}
      </h2>
      <dl className="prop-card__facts">
        <div>
          <dt>Precio</dt>
          <dd>{propiedad.precio || '—'}</dd>
        </div>
        <div>
          <dt>Ambientes</dt>
          <dd>{propiedad.ambientes || '—'}</dd>
        </div>
        <div>
          <dt>Operación</dt>
          <dd>{propiedad.operacion || '—'}</dd>
        </div>
      </dl>
      <div className="prop-card__footer">
        <span className="prop-card__interesados">
          {count === 0
            ? 'Sin interesados aún'
            : `${count} interesado${count === 1 ? '' : 's'}`}
        </span>
        <span className="prop-card__cta">Ver ficha →</span>
      </div>
    </Link>
  );
}

interface InteresadoRowProps {
  interesado: NonNullable<Propiedad['interesados']>[number];
}

export function InteresadoRow({ interesado }: InteresadoRowProps) {
  return (
    <Link
      to={`/leads/${encodeURIComponent(interesado.id)}`}
      className="interesado-row"
    >
      <div className="interesado-row__main">
        <strong>{interesado.nombre}</strong>
      </div>
      <div className="interesado-row__meta">
        <span className={`chip chip--sm chip--${interesado.canalOrigen}`}>
          {CANAL_LABEL[interesado.canalOrigen]}
        </span>
        {interesado.leadCompleto ? (
          <span className={`chip chip--sm chip--${interesado.temperatura}`}>
            {TEMPERATURA_LABEL[interesado.temperatura]}
          </span>
        ) : (
          <span className="chip chip--sm chip--conversando">
            {PIPELINE_COLUMNA_LABEL.conversando}
          </span>
        )}
        <span className="interesado-row__time">
          {relativeTimeFrom(interesado.ultimaActualizacion)}
        </span>
      </div>
    </Link>
  );
}
