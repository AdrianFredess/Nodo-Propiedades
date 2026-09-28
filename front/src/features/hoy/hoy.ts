import type { Lead } from '../../shared/types/lead';

const CINCO_DIAS_MS = 5 * 24 * 60 * 60 * 1000;

export interface HoyGrupos {
  calientes: Lead[];
  seguimientos: Lead[];
  derivaciones: Lead[];
}

export function armarHoy(leads: Lead[], now: Date): HoyGrupos {
  const calientes: Lead[] = [];
  const seguimientos: Lead[] = [];
  const derivaciones: Lead[] = [];
  for (const lead of leads) {
    if (lead.handoff) {
      derivaciones.push(lead);
      continue;
    }
    if (lead.temperatura === 'caliente' && lead.botPaused) {
      calientes.push(lead);
      continue;
    }
    const t = new Date(lead.ultimaActualizacion).getTime();
    const vencido =
      (lead.estadoSeguimiento === 'ninguno' || lead.estadoSeguimiento === 'enviado_1') &&
      !Number.isNaN(t) &&
      now.getTime() - t > CINCO_DIAS_MS;
    if (vencido) seguimientos.push(lead);
  }
  return { calientes, seguimientos, derivaciones };
}

export function hoyVacio(grupos: HoyGrupos, visitas: number): boolean {
  return (
    visitas === 0 &&
    grupos.calientes.length === 0 &&
    grupos.seguimientos.length === 0 &&
    grupos.derivaciones.length === 0
  );
}
