import { useNavigate } from 'react-router-dom';
import { CanalChip } from '../../shared/ui/CanalChip';
import { relativeTimeFrom } from '../../shared/lib/time';
import type { Lead } from '../../shared/types/lead';

interface LeadCardProps {
  lead: Lead;
  /** Orden visual en la columna (#1, #2…) — 1-based */
  ordinal: number;
  selected: boolean;
  onToggleSelect: (leadId: string) => void;
  unreadCount?: number;
}

export function LeadCard({
  lead,
  ordinal,
  selected,
  onToggleSelect,
  unreadCount = 0,
}: LeadCardProps) {
  const navigate = useNavigate();
  const canSelect = lead.canalOrigen === 'telegram';
  const detailPath = `/leads/${encodeURIComponent(lead.id)}`;
  const colClass = lead.temperatura;

  function openDetail() {
    navigate(detailPath);
  }

  return (
    <article
      className={`lead-card lead-card--compact lead-card--${colClass}${selected ? ' lead-card--selected' : ''}`}
      role="link"
      tabIndex={0}
      data-lead-id={lead.id}
      data-ordinal={ordinal}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail();
        }
      }}
      aria-label={`#${ordinal} ${lead.nombre}`}
    >
      <div className="lead-card__top">
        <span className="lead-card__ordinal" aria-hidden>
          #{ordinal}
        </span>
        <div className="lead-card__identity">
          <span className="lead-card__name">{lead.nombre}</span>
        </div>
        {unreadCount > 0 ? (
          <span
            className="lead-card__unread"
            title={`${unreadCount} mensaje(s) sin leer`}
            aria-label={`${unreadCount} sin leer`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
        <label
          className="check-wrap"
          title={canSelect ? 'Incluir en mensaje Telegram' : 'Solo Telegram'}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            disabled={!canSelect}
            onChange={() => onToggleSelect(lead.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={
              canSelect
                ? `Seleccionar ${lead.nombre}`
                : `${lead.nombre} no disponible (WhatsApp)`
            }
          />
        </label>
      </div>
      <div className="lead-card__meta lead-card__meta--compact">
        <span>{lead.zona || 'Sin zona'}</span>
        <span className="lead-card__dot" aria-hidden>
          ·
        </span>
        <span>{lead.presupuesto || 'Sin presupuesto'}</span>
      </div>
      <div className="lead-card__footer lead-card__footer--compact">
        <CanalChip canal={lead.canalOrigen} />
        {lead.botPaused || lead.handoff ? (
          <span className="lead-card__paused" title="Bot pausado — te toca a vos">
            Tu turno
          </span>
        ) : null}
        <span className="lead-card__time">
          {relativeTimeFrom(lead.ultimaActualizacion)}
        </span>
      </div>
    </article>
  );
}
