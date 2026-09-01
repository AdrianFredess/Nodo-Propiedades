import { Link } from 'react-router-dom';
import { InteresadoRow } from './PropiedadCard';
import type { Propiedad } from '../../shared/types/lead';

interface PropiedadDetailPageProps {
  propiedad: Propiedad | undefined;
  loading?: boolean;
  /** Ficha pública compartida por link — sin datos internos del CRM */
  variant?: 'internal' | 'public';
}

function SpecItem({ label, value }: { label: string; value: string }) {
  if (!value || value === '—') return null;
  return (
    <div className="prop-detail__spec">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function PropiedadDetailPage({
  propiedad,
  loading = false,
  variant = 'internal',
}: PropiedadDetailPageProps) {
  const isPublic = variant === 'public';
  if (!propiedad && loading) {
    return <div className="empty-state">Cargando propiedad…</div>;
  }

  if (!propiedad) {
    return (
      <div className="page-frame">
        <header className="page-head page-head--compact">
          <div>
            <h1>Propiedad no encontrada</h1>
            <p>
              {isPublic
                ? 'El link no corresponde a una propiedad disponible.'
                : 'Volvé al catálogo e intentá de nuevo.'}
            </p>
          </div>
        </header>
        {!isPublic ? (
          <Link className="btn btn--ghost" to="/catalogo">
            Volver al catálogo
          </Link>
        ) : null}
      </div>
    );
  }

  const interesados = propiedad.interesados ?? [];
  const count = propiedad.interesadosCount ?? interesados.length;
  const hasPagos =
    propiedad.honorarios ||
    propiedad.reserva ||
    propiedad.mediosPago ||
    propiedad.aliasCbu ||
    propiedad.requisitos;

  return (
    <div className="page-frame page-frame--detail prop-detail">
      <header className="page-head page-head--compact prop-detail__head">
        <div>
          <p className="prop-detail__eyebrow">#{propiedad.id}</p>
          <h1>
            {propiedad.tipo || 'Propiedad'}
            {propiedad.zona ? ` · ${propiedad.zona}` : ''}
          </h1>
          <div className="prop-detail__head-chips">
            {propiedad.operacion ? (
              <span className="chip chip--sm chip--neutral">{propiedad.operacion}</span>
            ) : null}
            {propiedad.estado ? (
              <span className="chip chip--sm chip--neutral">{propiedad.estado}</span>
            ) : null}
            {!isPublic && count > 0 ? (
              <span className="prop-detail__interesados-badge">
                {count} interesado{count === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </div>
        {!isPublic ? (
          <Link className="btn btn--ghost btn--sm" to="/catalogo">
            Volver
          </Link>
        ) : null}
      </header>

      <div className="prop-detail__price-bar">
        <span className="prop-detail__price">{propiedad.precio || 'Precio sin cargar'}</span>
        {propiedad.ambientes ? (
          <span className="prop-detail__price-meta">{propiedad.ambientes} amb.</span>
        ) : null}
      </div>

      {propiedad.fotos && propiedad.fotos.length > 0 ? (
        <div className="prop-gallery prop-gallery--detail">
          {propiedad.fotos.map((src) => (
            <a
              key={src}
              className="prop-gallery__link"
              href={src}
              target="_blank"
              rel="noreferrer"
            >
              <img className="prop-gallery__img" src={src} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}

      <div className="prop-detail__specs">
        <SpecItem label="Zona" value={propiedad.zona || '—'} />
        <SpecItem label="Tipo" value={propiedad.tipo || '—'} />
        <SpecItem label="Operación" value={propiedad.operacion || '—'} />
        <SpecItem label="Ambientes" value={propiedad.ambientes || '—'} />
        <SpecItem label="Estado" value={propiedad.estado || '—'} />
        {!isPublic && propiedad.linkFicha ? (
          <div className="prop-detail__spec prop-detail__spec--link">
            <dt>Ficha</dt>
            <dd>
              <a href={propiedad.linkFicha} target="_blank" rel="noreferrer">
                Abrir enlace
              </a>
            </dd>
          </div>
        ) : null}
      </div>

      {propiedad.descripcion ? (
        <section className="prop-detail__block">
          <h2 className="prop-detail__block-title">Descripción</h2>
          <p className="prop-detail__desc">{propiedad.descripcion}</p>
        </section>
      ) : null}

      {!isPublic && hasPagos ? (
        <section className="prop-detail__block">
          <h2 className="prop-detail__block-title">Condiciones comerciales</h2>
          <dl className="prop-detail__specs prop-detail__specs--dense">
            <SpecItem label="Honorarios" value={propiedad.honorarios ?? ''} />
            <SpecItem label="Reserva / seña" value={propiedad.reserva ?? ''} />
            <SpecItem label="Medios de pago" value={propiedad.mediosPago ?? ''} />
            <SpecItem label="Alias / CBU" value={propiedad.aliasCbu ?? ''} />
            <SpecItem label="Requisitos" value={propiedad.requisitos ?? ''} />
          </dl>
        </section>
      ) : null}

      {!isPublic ? (
        <section className="prop-detail__block prop-detail__block--interesados">
          <div className="prop-detail__block-head">
            <h2 className="prop-detail__block-title">Interesados</h2>
            <span className="prop-detail__block-meta">Leads vinculados por seguimiento</span>
          </div>
          {interesados.length === 0 ? (
            <div className="empty-state empty-state--compact">Sin interesados aún</div>
          ) : (
            <div className="interesados-list interesados-list--dense">
              {interesados.map((item) => (
                <InteresadoRow key={item.id} interesado={item} />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
