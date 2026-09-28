import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Lead } from '../../shared/types/lead';
import { armarHoy, hoyVacio } from './hoy';

interface VisitaHoy {
  id: string;
  nombre: string;
  hora: string;
  zona: string;
}

interface HoyPageProps {
  leads: Lead[];
  visitas?: VisitaHoy[];
}

export function HoyPage({ leads, visitas = [] }: HoyPageProps) {
  const grupos = useMemo(() => armarHoy(leads, new Date()), [leads]);
  const vacio = hoyVacio(grupos, visitas.length);

  return (
    <div className="page-frame">
      <header className="page-head page-head--compact">
        <div>
          <h1>Hoy</h1>
          <p className="page-head__subtitle">Lo que pide una respuesta</p>
        </div>
        <Link to="/resumen" className="btn btn--ghost btn--sm">
          Resumen
        </Link>
      </header>

      {vacio ? (
        <div className="empty-state">
          Nada pendiente por ahora. Cuando haya un lead caliente sin respuesta, una visita de hoy,
          un seguimiento vencido o una derivación, aparece en esta pantalla.
        </div>
      ) : (
        <div className="stat-grid">
          {grupos.calientes.length > 0 ? (
            <Lista titulo="Calientes sin respuesta" leads={grupos.calientes} />
          ) : null}
          {visitas.length > 0 ? (
            <article className="panel-card">
              <h2>Visitas de hoy</h2>
              <ul>
                {visitas.map((v) => (
                  <li key={v.id}>
                    {v.hora} · {v.nombre} · {v.zona}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
          {grupos.seguimientos.length > 0 ? (
            <Lista titulo="Seguimientos vencidos" leads={grupos.seguimientos} />
          ) : null}
          {grupos.derivaciones.length > 0 ? (
            <Lista titulo="Derivaciones pendientes" leads={grupos.derivaciones} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function Lista({ titulo, leads }: { titulo: string; leads: Lead[] }) {
  return (
    <article className="panel-card">
      <h2>{titulo}</h2>
      <ul>
        {leads.map((lead) => (
          <li key={lead.id}>
            <Link to={'/leads/' + lead.id}>{lead.nombre || lead.chatId}</Link>
            {lead.zona ? ' · ' + lead.zona : ''}
          </li>
        ))}
      </ul>
    </article>
  );
}
