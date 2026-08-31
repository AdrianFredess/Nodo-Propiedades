import { Link } from 'react-router-dom';
import { InteresadoRow } from './PropiedadCard';
import type { Propiedad } from '../../shared/types/lead';

interface PropiedadDetailPageProps {
  propiedad: Propiedad | undefined;
  loading?: boolean;
}

export function PropiedadDetailPage({
  propiedad,
  loading = false,
}: PropiedadDetailPageProps) {
  if (!propiedad && loading) {
    return <div className="empty-state">Cargando propiedad…</div>;
  }

  if (!propiedad) {
    return (
      <div className="page-frame">
        <header className="page-head page-head--compact">
          <div>
            <h1>Propiedad no encontrada</h1>
            <p>Volvé al catálogo e intentá de nuevo.</p>
          </div>
        </header>
        <Link className="btn btn--ghost" to="/catalogo">
          Volver al catálogo
        </Link>
      </div>
    );
  }

  const interesados = propiedad.interesados ?? [];

  return (
    <div className="page-frame page-frame--detail">
      <header className="page-head page-head--compact">
        <div>
          <p className="prop-detail__eyebrow">#{propiedad.id}</p>
          <h1>
            {propiedad.tipo || 'Propiedad'} · {propiedad.zona || 'Sin zona'}
          </h1>
          <p>
            {propiedad.operacion || 'Operación sin definir'}
            {propiedad.estado ? ` · ${propiedad.estado}` : ''}
          </p>
        </div>
        <Link className="btn btn--ghost btn--sm" to="/catalogo">
          Volver
        </Link>
      </header>

      {propiedad.fotos && propiedad.fotos.length > 0 ? (
        <div className="prop-gallery">
          {propiedad.fotos.map((src) => (
            <img key={src} className="prop-gallery__img" src={src} alt="" loading="lazy" />
          ))}
        </div>
      ) : null}

      <div className="detail-layout detail-layout--fill">
        <aside className="detail-side panel-card detail-side--scroll">
          <h2 className="detail-section-title">Ficha</h2>
          <dl>
            <div>
              <dt>Zona</dt>
              <dd>{propiedad.zona || '—'}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{propiedad.tipo || '—'}</dd>
            </div>
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
          {propiedad.descripcion ? (
            <p className="prop-detail__desc">{propiedad.descripcion}</p>
          ) : null}

          {(propiedad.honorarios ||
            propiedad.reserva ||
            propiedad.mediosPago ||
            propiedad.aliasCbu ||
            propiedad.requisitos) && (
            <div className="prop-detail__pagos">
              <h2 style={{ margin: '1.25rem 0 0.75rem', fontSize: '1.05rem' }}>
                Condiciones / medios de pago
              </h2>
              <dl>
                {propiedad.honorarios ? (
                  <div>
                    <dt>Honorarios</dt>
                    <dd>{propiedad.honorarios}</dd>
                  </div>
                ) : null}
                {propiedad.reserva ? (
                  <div>
                    <dt>Reserva / seña</dt>
                    <dd>{propiedad.reserva}</dd>
                  </div>
                ) : null}
                {propiedad.mediosPago ? (
                  <div>
                    <dt>Medios de pago</dt>
                    <dd>{propiedad.mediosPago}</dd>
                  </div>
                ) : null}
                {propiedad.aliasCbu ? (
                  <div>
                    <dt>Alias / CBU</dt>
                    <dd>{propiedad.aliasCbu}</dd>
                  </div>
                ) : null}
                {propiedad.requisitos ? (
                  <div>
                    <dt>Requisitos</dt>
                    <dd>{propiedad.requisitos}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="prop-detail__hint">
                Datos desde Sheets (stock). Si ves EDITAR_EN_SHEETS, completá la
                planilla.
              </p>
            </div>
          )}
        </aside>

        <section className="detail-main panel-card detail-main--chat">
          <h2 className="detail-section-title">Interesados</h2>
          <p className="prop-detail__hint">
            Leads vinculados a esta propiedad por seguimiento o referencia.
          </p>
          {interesados.length === 0 ? (
            <div className="empty-state empty-state--compact">Sin interesados aún</div>
          ) : (
            <div className="interesados-list interesados-list--scroll">
              {interesados.map((item) => (
                <InteresadoRow key={item.id} interesado={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
