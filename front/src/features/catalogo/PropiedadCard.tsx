import { Link } from 'react-router-dom';
import {
  PIPELINE_COLUMNA_LABEL,
  TEMPERATURA_LABEL,
} from '../../shared/lib/labels';
import { CanalChip } from '../../shared/ui/CanalChip';
import { relativeTimeFrom } from '../../shared/lib/time';
import type { Propiedad } from '../../shared/types/lead';

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
        {interesado.zona ? (
          <span className="interesado-row__sub">{interesado.zona}</span>
        ) : null}
      </div>
      <div className="interesado-row__meta">
        <CanalChip canal={interesado.canalOrigen} />
        {interesado.leadCompleto ? (
          <span className={`chip chip--sm chip--${interesado.temperatura}`}>
            {TEMPERATURA_LABEL[interesado.temperatura]}
          </span>
        ) : (
          <span className="chip chip--sm chip--conversando">
            {PIPELINE_COLUMNA_LABEL.conversando}
          </span>
        )}
        {interesado.presupuesto ? (
          <span className="interesado-row__presupuesto">{interesado.presupuesto}</span>
        ) : null}
        <span className="interesado-row__time">
          {relativeTimeFrom(interesado.ultimaActualizacion)}
        </span>
      </div>
    </Link>
  );
}
