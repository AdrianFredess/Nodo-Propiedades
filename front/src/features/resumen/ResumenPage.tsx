import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { computeGlobalMetrics, computeResumenMetrics, filterLeadsByDay } from './computeMetrics';
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
const CANAL_ORDER = ['whatsapp', 'telegram', 'messenger'] as const;

function fromInputDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return startOfDay(new Date(y, m - 1, d));
}

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
  const dayMetrics = useMemo(
    () => computeResumenMetrics(dayLeads),
    [dayLeads],
  );
  const global = useMemo(() => computeGlobalMetrics(leads), [leads]);

  const maxTemp = Math.max(1, ...Object.values(global.porTemperatura));
  const maxCanal = Math.max(1, ...Object.values(global.porCanal));

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
          <h1>Resumen</h1>
          <p className="page-head__subtitle">
            Vista ejecutiva del CRM — leads, pipeline y canales
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

      <section className="stat-grid stat-grid--hero" aria-label="Indicadores principales">
        <article className="stat panel-card">
          <div className="stat__label">Total leads</div>
          <div className="stat__value">{global.totalLeads}</div>
          <p className="stat__hint">En el CRM</p>
        </article>
        <article className="stat panel-card">
          <div className="stat__label">Activos (7 días)</div>
          <div className="stat__value">{global.leadsSemana}</div>
          <p className="stat__hint">Con actividad reciente</p>
        </article>
        <article className="stat panel-card stat--hot">
          <div className="stat__label">Calientes</div>
          <div className="stat__value">{global.calientes}</div>
          <p className="stat__hint">Listos para avanzar</p>
        </article>
        <article className="stat panel-card">
          <div className="stat__label">Visitas solicitadas</div>
          <div className="stat__value">{global.visitasSolicitadas}</div>
          <p className="stat__hint">Leads que pidieron ver</p>
        </article>
      </section>

      <section className="resumen-section" aria-label="Actividad del día">
        <h2 className="resumen-section__title">
          Actividad {isToday ? 'de hoy' : `del ${dayValue}`}
        </h2>
        <div className="stat-grid stat-grid--day">
          <article className="stat panel-card">
            <div className="stat__label">Leads activos</div>
            <div className="stat__value">{dayMetrics.leadsDia}</div>
          </article>
          <article className="stat panel-card stat--hot">
            <div className="stat__label">Calientes</div>
            <div className="stat__value">{dayMetrics.calientesDia}</div>
          </article>
          <article className="stat panel-card">
            <div className="stat__label">WhatsApp</div>
            <div className="stat__value">{dayMetrics.whatsappDia}</div>
          </article>
          <article className="stat panel-card">
            <div className="stat__label">Telegram</div>
            <div className="stat__value">{dayMetrics.telegramDia}</div>
          </article>
        </div>
      </section>

      <section className="split-2">
        <article className="panel-card section-block">
          <h2>Pipeline</h2>
          <p className="section-block__desc">Distribución por temperatura (total)</p>
          <div className="bar-list">
            {TEMP_ORDER.map((temp) => {
              const value = global.porTemperatura[temp];
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
          <h2>Canales</h2>
          <p className="section-block__desc">Origen de los leads (total)</p>
          <div className="bar-list">
            {CANAL_ORDER.map((canal) => {
              const value = global.porCanal[canal];
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

      {global.topPropiedades.length > 0 ? (
        <section className="panel-card section-block">
          <h2>Propiedades más consultadas</h2>
          <p className="section-block__desc">Por menciones en conversaciones</p>
          <ol className="resumen-top-props">
            {global.topPropiedades.map((p, i) => (
              <li key={p.id}>
                <Link to={`/catalogo/${encodeURIComponent(p.id)}`}>
                  <span className="resumen-top-props__rank">#{i + 1}</span>
                  <span className="resumen-top-props__id">{p.id}</span>
                  <span className="resumen-top-props__count">
                    {p.count} consulta{p.count === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="panel-card section-block resumen-day-list resumen-day-list--fill">
        <h2>Leads del {dayValue}</h2>
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
