import type { Lead, LeadsPayload, Propiedad } from '../shared/types/lead';

/**
 * Seed vacío a propósito.
 * El panel corre con VITE_USE_MOCK=false → datos reales vía PANEL-01 / Sheets.
 * No reintroducir leads demo (Carla, Diego, etc.): ensucian el CRM.
 */
const SEED_LEADS: Lead[] = [];
const SEED_PROPIEDADES: Propiedad[] = [];

export function getMockPayload(): LeadsPayload {
  return {
    generatedAt: new Date().toISOString(),
    leads: SEED_LEADS,
    propiedades: SEED_PROPIEDADES,
    source: 'mock',
  };
}
