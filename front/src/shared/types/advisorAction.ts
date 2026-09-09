import type { CanalOrigen } from '../types/lead';

export type AdvisorActionKind = 'fichas' | 'link' | 'handoff' | 'rate_limit';

export interface AdvisorAction {
  id: string;
  kind: AdvisorActionKind;
  chatId: string;
  leadId: string;
  nombre: string;
  canal: CanalOrigen;
  /** Mensaje corto para el asesor */
  title: string;
  detail: string;
  /** IDs MZA a reenviar */
  propIds: string[];
  /** Link de agenda si aplica */
  link: string;
  at: number;
  read: boolean;
}

export function advisorActionTitle(kind: AdvisorActionKind): string {
  if (kind === 'fichas') return 'Falta enviar ficha';
  if (kind === 'link') return 'Falta enviar link de visita';
  if (kind === 'handoff') return 'Te toca a vos';
  return 'Bot sin tokens';
}
