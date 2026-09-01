import type { CanalOrigen, Lead, Temperatura } from '../../shared/types/lead';
import { leadTimestampMs } from '../../shared/lib/leadsOrder';
import { isSameDay, isWithinLastDays, parseDate, startOfDay } from '../../shared/lib/time';

export interface ResumenMetrics {
  /** Leads con actividad en el día seleccionado */
  leadsDia: number;
  calientesDia: number;
  whatsappDia: number;
  telegramDia: number;
  messengerDia: number;
}

export interface GlobalMetrics {
  totalLeads: number;
  porTemperatura: Record<Temperatura, number>;
  calientes: number;
  leadsSemana: number;
  visitasSolicitadas: number;
  porCanal: Record<CanalOrigen, number>;
  topPropiedades: Array<{ id: string; count: number }>;
}

function activityDate(lead: Lead): Date | null {
  const ms = leadTimestampMs(lead);
  return ms > 0 ? new Date(ms) : parseDate(lead.ultimaActualizacion);
}

const VISITA_RE =
  /\b(visita|agendar|coordinar visita|ver la propiedad|ver el depto|ver la casa|solicitud_visita)\b/i;
const PROP_ID_RE = /\b(MZA-\d{3})\b/gi;

function countVisitas(leads: Lead[]): number {
  let n = 0;
  for (const lead of leads) {
    const texts = [
      lead.lastMessage,
      ...lead.historial.flatMap((h) => [h.mensajeCliente, h.respuestaBot]),
    ];
    if (texts.some((t) => VISITA_RE.test(String(t || '')))) n += 1;
  }
  return n;
}

function extractPropiedadIds(lead: Lead): string[] {
  const ids = new Set<string>();
  if (lead.propiedadId) ids.add(lead.propiedadId.toUpperCase());
  const ref = lead.propiedadReferencia || '';
  const refMatch = ref.match(/\b(MZA-\d{3})\b/i);
  if (refMatch) ids.add(refMatch[0].toUpperCase());
  try {
    const parsed = JSON.parse(ref);
    if (parsed?.id) ids.add(String(parsed.id).toUpperCase());
  } catch {
    /* not JSON */
  }
  for (const h of lead.historial) {
    const blob = `${h.mensajeCliente} ${h.respuestaBot}`;
    let m: RegExpExecArray | null;
    const re = new RegExp(PROP_ID_RE.source, PROP_ID_RE.flags);
    while ((m = re.exec(blob)) !== null) {
      ids.add(m[0].toUpperCase());
    }
  }
  return [...ids];
}

function computeTopPropiedades(leads: Lead[], limit = 5): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    for (const id of extractPropiedadIds(lead)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Leads con actividad en el día calendario local de `day`. */
export function filterLeadsByDay(leads: Lead[], day: Date): Lead[] {
  const target = startOfDay(day);
  return leads.filter((lead) => {
    const d = activityDate(lead);
    return d !== null && isSameDay(d, target);
  });
}

export function computeGlobalMetrics(leads: Lead[]): GlobalMetrics {
  const porTemperatura: Record<Temperatura, number> = {
    frio: 0,
    tibio: 0,
    caliente: 0,
  };
  const porCanal: Record<CanalOrigen, number> = {
    telegram: 0,
    whatsapp: 0,
    messenger: 0,
  };
  let leadsSemana = 0;
  const now = new Date();

  for (const lead of leads) {
    porTemperatura[lead.temperatura] += 1;
    porCanal[lead.canalOrigen] += 1;
    const updated = activityDate(lead);
    if (updated && isWithinLastDays(updated.toISOString(), 7, now)) {
      leadsSemana += 1;
    }
  }

  return {
    totalLeads: leads.length,
    porTemperatura,
    calientes: porTemperatura.caliente,
    leadsSemana,
    visitasSolicitadas: countVisitas(leads),
    porCanal,
    topPropiedades: computeTopPropiedades(leads),
  };
}

export function computeResumenMetrics(
  dayLeads: Lead[],
): ResumenMetrics {
  let calientesDia = 0;
  let whatsappDia = 0;
  let telegramDia = 0;
  let messengerDia = 0;

  for (const lead of dayLeads) {
    if (lead.temperatura === 'caliente') calientesDia += 1;
    if (lead.canalOrigen === 'whatsapp') whatsappDia += 1;
    if (lead.canalOrigen === 'telegram') telegramDia += 1;
    if (lead.canalOrigen === 'messenger') messengerDia += 1;
  }

  return {
    leadsDia: dayLeads.length,
    calientesDia,
    whatsappDia,
    telegramDia,
    messengerDia,
  };
}
