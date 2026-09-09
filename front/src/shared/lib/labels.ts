import type {
  CanalOrigen,
  EstadoSeguimiento,
  PipelineColumna,
  Temperatura,
} from '../types/lead';

export function normalizeTemperatura(value: unknown): Temperatura {
  const t = String(value ?? 'frio').trim().toLowerCase();
  if (t === 'caliente' || t === 'hot') return 'caliente';
  if (t === 'tibio' || t === 'warm') return 'tibio';
  return 'frio';
}

export function normalizeCanal(value: unknown): CanalOrigen {
  const c = String(value ?? 'telegram').trim().toLowerCase();
  if (c === 'whatsapp' || c === 'wa') return 'whatsapp';
  if (c === 'messenger') return 'messenger';
  return 'telegram';
}

export function normalizeEstadoSeguimiento(value: unknown): EstadoSeguimiento {
  const e = String(value ?? 'ninguno').trim().toLowerCase();
  if (
    e === 'enviado_1' ||
    e === 'enviado_2' ||
    e === 'respondido' ||
    e === 'cerrado'
  ) {
    return e;
  }
  return 'ninguno';
}

export function normalizeLeadCompleto(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'si' || v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'no' || v === 'false' || v === '0') return false;
  // Legacy: filas viejas sin el campo llegaban solo al completar
  return true;
}

export const TEMPERATURA_LABEL: Record<Temperatura, string> = {
  frio: 'Frío',
  tibio: 'Tibio',
  caliente: 'Caliente',
};

export const PIPELINE_COLUMNA_LABEL: Record<PipelineColumna, string> = {
  conversando: 'Conversando', // legacy; kanban usa frio/tibio/caliente
  frio: 'Frío',
  tibio: 'Tibio',
  caliente: 'Caliente',
};

export const CANAL_LABEL: Record<CanalOrigen, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
};

export const SEGUIMIENTO_LABEL: Record<EstadoSeguimiento, string> = {
  ninguno: 'Sin seguimiento',
  enviado_1: '1.er contacto enviado',
  enviado_2: '2.º contacto enviado',
  respondido: 'Respondió',
  cerrado: 'Cerrado',
};
