import type { HistorialMensaje } from '../types/lead';

/** Claves estables por burbuja (cliente / bot) del historial. */
export function historialBubbleKeys(historial: HistorialMensaje[]): string[] {
  const keys: string[] = [];
  for (const item of historial) {
    if (item.mensajeCliente.trim()) keys.push(`${item.id}-client`);
    if (item.respuestaBot.trim()) keys.push(`${item.id}-bot`);
  }
  return keys;
}
