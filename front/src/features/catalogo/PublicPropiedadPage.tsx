import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PropiedadDetailPage } from './PropiedadDetailPage';
import { lookupPublicPropiedad } from '../../shared/lib/shareToken';
import type { Propiedad } from '../../shared/types/lead';

function toPropiedad(entry: ReturnType<typeof lookupPublicPropiedad>): Propiedad | undefined {
  if (!entry) return undefined;
  return {
    id: entry.id,
    zona: entry.zona ?? '',
    tipo: entry.tipo ?? '',
    precio: entry.precio ?? '',
    ambientes: entry.ambientes ?? '',
    operacion: entry.operacion ?? 'Venta',
    descripcion: entry.descripcion,
    fotos: entry.fotos,
    titulo: entry.titulo,
    caption: entry.caption,
    precioUsd: entry.precioUsd,
    direccion: entry.direccion,
    metrosCuadrados: entry.metrosCuadrados,
    dormitorios: entry.dormitorios,
    banos: entry.banos,
    expensas: entry.expensas,
    highlights: entry.highlights,
    linkFicha: entry.linkFicha,
  };
}

export function PublicPropiedadPage() {
  const { propiedadId = '', token = '' } = useParams();
  const decodedId = propiedadId ? decodeURIComponent(propiedadId) : '';
  const entry = lookupPublicPropiedad(decodedId, token);
  const propiedad = toPropiedad(entry);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = propiedad
      ? `${propiedad.tipo} · ${propiedad.zona} | Nodo Propiedades`
      : 'Ficha no disponible | Nodo Propiedades';
    return () => {
      document.head.removeChild(meta);
    };
  }, [propiedad]);

  if (!token || !entry) {
    return (
      <div className="public-ficha public-ficha--invalid">
        <div className="public-ficha__card">
          <h1>Link no válido</h1>
          <p>Esta ficha no existe o el enlace expiró. Pedí un link nuevo a tu asesor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-ficha">
      <PropiedadDetailPage propiedad={propiedad} variant="public" />
    </div>
  );
}
