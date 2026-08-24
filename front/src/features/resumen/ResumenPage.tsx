import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { computeResumenMetrics, filterLeadsByDay } from './computeMetrics';
import { CANAL_LABEL, TEMPERATURA_LABEL } from '../../shared/lib/labels';
import { leadTimestampMs, sortLeadsByRecency } from '../../shared/lib/leadsOrder';
import {
  formatDateTime,
  isSameDay,
  startOfDay,
  toInputDate,
} from '../../shared/lib/time';
import type { Lead, Temperatura } from '../../shared/types/lead';

interface ResumenPageProps {
  leads: Lead[];
  sourceLabel: string;
  lastUpdatedLabel: string;
}

const TEMP_ORDER: Temperatura[] = ['caliente', 'tibio', 'frio'];

function fromInputDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return startOfDay(new Date(y, m - 1, d));
}

/** Fecha local (input date) del lead más reciente con actividad parseable. */
function latestActivityInputDate(allLeads: Lead[]): string | null {
  let bestMs = 0;
  for (const lead of allLeads) {
    const ms = leadTimestampMs(lead);
    if (ms > bestMs) bestMs = ms;
  }
  if (bestMs <= 0) return null;
  return toInputDate(new Date(bestMs));
}

export function ResumenPage({
  leads,
  sourceLabel,
  lastUpdatedLabel,
}: ResumenPageProps) {
  const [dayValue, setDayValue] = useState(() => toInputDate(new Date()));
  const selectedDay = useMemo(() => fromInputDate(dayValue), [dayValue]);
  const isToday = isSameDay(selectedDay, new Date());

  const dayLeads = useMemo(
    () => sortLeadsByRecency(filterLeadsByDay(leads, selectedDay)),
    [leads, selectedDay],
  );
  const metrics = useMemo(
    () => computeResumenMetrics(dayLeads, selectedDay),
    [dayLeads, selectedDay],
  );

  const maxTemp = Math.max(1, ...Object.values(metrics.porTemperatura));
  const maxCanal = Math.max(1, ...Object.values(metrics.porCanal));

  const otherDaysHint = useMemo(() => {
    if (dayLeads.length > 0 || leads.length === 0) return null;
    const latest = latestActivityInputDate(leads);
    if (!latest || latest === dayValue) {
      return { count: leads.length, latest: null as string | null };
    }
    return { count: leads.length, latest };
  }, [dayLeads.length, leads, dayValue]);

  return (
    <div className="page-frame page-frame--resumen">
      <header className="page-head page-head--compact">
        <div>
          <h1>Resumen ejecutivo</h1>
          <p>
            KPIs y leads del día. Polling actualiza sin cambiar la fecha.
          </p>
        </div>
        <div className="resumen-toolbar">
          <label className="date-picker">
            <span className="date-picker__label">Día</span>
            <input
              type="date"
              className="date-picker__input"
              value={dayValue}
              onChange={(e) => setDayValue(e.target.value)}
              aria-label="Filtrar por fecha"
            />
          </label>
          {!isToday ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setDayValue(toInputDate(new Date()))}
            >
              Hoy
            </button>
          ) : null}
          <div className="badge-live">
            <span
              className={`badge-live__dot${sourceLabel === 'mock' ? ' badge-live__dot--mock' : ''}`}
            />
            {sourceLabel === 'mock' ? 'Demo' : 'En vivo'} · {lastUpdatedLabel}
          </div>
        </div>
      </header>

      <section className="stat-grid">
        <article className="stat panel-card">
          <div className="stat__label">Leads del día</div>
          <div className="stat__value">{metrics.total}</div>
        </article>
        <article className="stat panel-card stat--hot">
          <div className="stat__label">Calientes del día</div>
          <div className="stat__value">{metrics.calientesDia}</div>
        </article>
        <article className="stat panel-card">
          <div className="stat__label">WhatsApp</div>
          <div className="stat__value">{metrics.porCanal.whatsapp}</div>
        </article>
        <article className="stat panel-card">
          <div className="stat__label">Telegram</div>
          <div className="stat__value">{metrics.porCanal.telegram}</div>
        </article>
      </section>

      <section className="split-2">
        <article className="panel-card section-block">
          <h2>Temperatura del día</h2>
          <div className="bar-list">
            {TEMP_ORDER.map((temp) => {
              const value = metrics.porTemperatura[temp];
              const pct = Math.round((value / maxTemp) * 100);
              return (
                <div className="bar-row" key={temp}>
                  <span>{TEMPERATURA_LABEL[temp]}</span>
                  <div className="bar-track">
                    <div
                      className={`bar-fill bar-fill--${temp}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel-card section-block">
          <h2>Canal del día</h2>
          <div className="bar-list">
            {(
              Object.keys(metrics.porCanal) as Array<keyof typeof metrics.porCanal>
            ).map((canal) => {
              const value = metrics.porCanal[canal];
              const pct = Math.round((value / maxCanal) * 100);
              return (
                <div className="bar-row" key={canal}>
                  <span>{CANAL_LABEL[canal]}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill bar-fill--canal"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="panel-card section-block resumen-day-list resumen-day-list--fill">
        <h2>
          Leads del {dayValue}
          <span className="resumen-day-list__hint"> · más reciente primero</span>
        </h2>
        {dayLeads.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <p>Sin actividad ese día</p>
            {otherDaysHint ? (
              <p className="resumen-empty-hint">
                Hay {otherDaysHint.count} lead
                {otherDaysHint.count === 1 ? '' : 's'} en otras fechas
                {otherDaysHint.latest
                  ? ` · más reciente: ${otherDaysHint.latest}`
                  : ''}
              </p>
            ) : null}
            {otherDaysHint?.latest ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setDayValue(otherDaysHint.latest!)}
              >
                Ir a la fecha con datos
              </button>
            ) : null}
          </div>
        ) : (
          <ol className="resumen-lead-list resumen-lead-list--scroll">
            {dayLeads.map((lead, i) => (
              <li key={lead.id}>
                <Link
                  className="resumen-lead-row"
                  to={`/leads/${encodeURIComponent(lead.id)}`}
                >
                  <span className="resumen-lead-row__ord">#{i + 1}</span>
                  <span className="resumen-lead-row__name">{lead.nombre}</span>
                  <span className="resumen-lead-row__meta">
                    {TEMPERATURA_LABEL[lead.temperatura]} ·{' '}
                    {CANAL_LABEL[lead.canalOrigen]}
                  </span>
                  <span className="resumen-lead-row__time">
                    {formatDateTime(
                      lead.ultimaActualizacion ||
                        lead.historial[lead.historial.length - 1]?.fecha ||
                        '',
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
