import type { Lead } from '../types/lead';
import { parseDate } from './time';

/** Timestamp más preciso: ultimaActualización o última fecha de historial. */
export function leadTimestampMs(lead: Lead): number {
  let best = 0;
  const fromLead = parseDate(lead.ultimaActualizacion);
  if (fromLead) best = Math.max(best, fromLead.getTime());

  for (const msg of lead.historial ?? []) {
    const d = parseDate(msg.fecha);
    if (d) best = Math.max(best, d.getTime());
  }
  return best;
}

/** Más reciente primero; empate por id estable. */
export function compareLeadsByRecency(a: Lead, b: Lead): number {
  const diff = leadTimestampMs(b) - leadTimestampMs(a);
  if (diff !== 0) return diff;
  return String(a.id).localeCompare(String(b.id));
}

export function sortLeadsByRecency(leads: Lead[]): Lead[] {
  return [...leads].sort(compareLeadsByRecency);
}
