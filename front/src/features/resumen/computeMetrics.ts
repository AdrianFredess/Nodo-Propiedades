import type { CanalOrigen, Lead, Temperatura } from '../../shared/types/lead';
import { leadTimestampMs } from '../../shared/lib/leadsOrder';
import { isSameDay, isWithinLastDays, parseDate, startOfDay } from '../../shared/lib/time';

export interface ResumenMetrics {
  total: number;
  calientesDia: number;
  calientesSemana: number;
  porTemperatura: Record<Temperatura, number>;
  porCanal: Record<CanalOrigen, number>;
}

function activityDate(lead: Lead): Date | null {
  const ms = leadTimestampMs(lead);
  return ms > 0 ? new Date(ms) : parseDate(lead.ultimaActualizacion);
}

/** Leads con actividad en el día calendario local de `day`. */
export function filterLeadsByDay(leads: Lead[], day: Date): Lead[] {
  const target = startOfDay(day);
  return leads.filter((lead) => {
    const d = activityDate(lead);
    return d !== null && isSameDay(d, target);
  });
}

export function computeResumenMetrics(
  leads: Lead[],
  day: Date = new Date(),
): ResumenMetrics {
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

  let calientesDia = 0;
  let calientesSemana = 0;
  const dayStart = startOfDay(day);

  for (const lead of leads) {
    porTemperatura[lead.temperatura] += 1;
    porCanal[lead.canalOrigen] += 1;

    if (lead.temperatura !== 'caliente') continue;
    const updated = activityDate(lead);
    if (updated && isSameDay(updated, dayStart)) calientesDia += 1;
    if (
      updated &&
      isWithinLastDays(
        updated.toISOString(),
        7,
        new Date(dayStart.getTime() + 12 * 60 * 60 * 1000),
      )
    ) {
      calientesSemana += 1;
    }
  }

  return {
    total: leads.length,
    calientesDia,
    calientesSemana,
    porTemperatura,
    porCanal,
  };
}
