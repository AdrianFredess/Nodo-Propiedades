import { useState } from 'react';
import { Link } from 'react-router-dom';
import { InteresadoRow } from './PropiedadCard';
import {
  extractDireccion,
  extractHighlights,
  formatPrecioUsd,
  splitDescripcion,
} from '../../shared/lib/propiedadInfo';
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

function PropiedadGallery({
  fotos,
  alt,
}: {
  fotos: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const safeIndex = Math.min(active, fotos.length - 1);
  const hero = fotos[safeIndex] ?? fotos[0];

  return (
    <div className="prop-gallery-hero np-glass">
      <a
        className="prop-gallery-hero__main"
        href={hero}
        target="_blank"
        rel="noreferrer"
      >
        <img src={hero} alt={alt} loading="eager" />
        <span className="prop-gallery-hero__count">
          {safeIndex + 1} / {fotos.length}
        </span>
      </a>
      {fotos.length > 1 ? (
        <div className="prop-gallery-hero__thumbs" role="list">
          {fotos.map((src, i) => (
            <button
              key={src}
              type="button"
              role="listitem"
              className={
                i === safeIndex
                  ? 'prop-gallery-hero__thumb is-active'
                  : 'prop-gallery-hero__thumb'
              }
              onClick={() => setActive(i)}
              aria-label={`Foto ${i + 1}`}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
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

  const { principal } = splitDescripcion(propiedad.descripcion);
  const direccion =
    propiedad.direccion || extractDireccion(propiedad.descripcion);
  const highlights =
    propiedad.highlights?.length
      ? propiedad.highlights
      : extractHighlights(propiedad.descripcion, undefined, propiedad.tipo);
  const titulo =
    propiedad.titulo ||
    [propiedad.tipo || 'Propiedad', propiedad.zona ? `en ${propiedad.zona}` : '']
      .filter(Boolean)
      .join(' ');
  const precioLabel = formatPrecioUsd(propiedad.precioUsd, propiedad.precio);
  const fotoAlt = `${propiedad.tipo || 'Propiedad'} ${propiedad.zona || ''}`.trim();
  const fotos = propiedad.fotos ?? [];

  return (
    <div className="page-frame page-frame--detail prop-detail">
      <header className="page-head page-head--compact prop-detail__head">
        <div>
          <p className="prop-detail__eyebrow">#{propiedad.id}</p>
          <h1>{titulo}</h1>
          {propiedad.caption ? (
            <p className="prop-detail__caption">{propiedad.caption}</p>
          ) : null}
          <div className="prop-detail__head-chips">
            {propiedad.operacion ? (
              <span className="chip chip--sm chip--neutral">{propiedad.operacion}</span>
            ) : null}
            {propiedad.estado ? (
              <span className="chip chip--sm chip--neutral">{propiedad.estado}</span>
            ) : null}
            {fotos.length > 0 ? (
              <span className="chip chip--sm chip--neutral">
                {fotos.length} foto{fotos.length === 1 ? '' : 's'}
              </span>
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

      <div className="prop-detail__layout">
        <div className="prop-detail__media">
          {fotos.length > 0 ? (
            <PropiedadGallery fotos={fotos} alt={fotoAlt} />
          ) : (
            <div className="prop-gallery-hero prop-gallery-hero--empty np-glass">
              <p>Sin fotos cargadas</p>
            </div>
          )}
        </div>

        <div className="prop-detail__info">
          <div className="prop-detail__price-bar np-glass">
            <span className="prop-detail__price">{precioLabel}</span>
            <div className="prop-detail__price-aside">
              {propiedad.ambientes ? (
                <span className="prop-detail__price-meta">
                  {propiedad.ambientes} amb.
                </span>
              ) : null}
              {propiedad.metrosCuadrados ? (
                <span className="prop-detail__price-meta">
                  {propiedad.metrosCuadrados} m²
                </span>
              ) : null}
            </div>
          </div>

          <dl className="prop-detail__specs np-glass">
            <SpecItem label="Zona" value={propiedad.zona || '—'} />
            <SpecItem label="Tipo" value={propiedad.tipo || '—'} />
            <SpecItem label="Operación" value={propiedad.operacion || '—'} />
            <SpecItem label="Ambientes" value={propiedad.ambientes || '—'} />
            <SpecItem label="Dormitorios" value={propiedad.dormitorios || '—'} />
            <SpecItem label="Baños" value={propiedad.banos || '—'} />
            <SpecItem label="Superficie" value={propiedad.metrosCuadrados ? `${propiedad.metrosCuadrados} m²` : '—'} />
            <SpecItem label="Expensas" value={propiedad.expensas || '—'} />
            <SpecItem label="Dirección" value={direccion || '—'} />
            <SpecItem label="Estado" value={propiedad.estado || '—'} />
            {!isPublic && propiedad.linkFicha ? (
              <div className="prop-detail__spec prop-detail__spec--link">
                <dt>Ficha pública</dt>
                <dd>
                  <a href={propiedad.linkFicha} target="_blank" rel="noreferrer">
                    Abrir enlace
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>

          {highlights.length > 0 ? (
            <div className="prop-detail__highlights np-glass">
              <h2 className="prop-detail__block-title">Características</h2>
              <ul className="prop-detail__highlight-list">
                {highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {principal ? (
        <section className="prop-detail__block np-glass">
          <h2 className="prop-detail__block-title">Descripción</h2>
          <p className="prop-detail__desc">{principal}</p>
        </section>
      ) : null}

      {!isPublic && hasPagos ? (
        <section className="prop-detail__block np-glass">
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
        <section className="prop-detail__block prop-detail__block--interesados np-glass">
          <div className="prop-detail__block-head">
            <h2 className="prop-detail__block-title">Interesados</h2>
            <span className="prop-detail__block-meta">
              Leads vinculados por seguimiento
            </span>
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
