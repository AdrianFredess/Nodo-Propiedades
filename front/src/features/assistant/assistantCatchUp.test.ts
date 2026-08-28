import { describe, expect, it } from 'vitest';
import type { Lead } from '../../shared/types/lead';
import {
  buildCatchUpReport,
  catchUpSpeech,
  collectTimelineEvents,
} from './assistantCatchUp';

const baseLead = (
  overrides: Partial<Lead> & Pick<Lead, 'id' | 'nombre'>,
): Lead => ({
  chatId: overrides.id,
  zona: 'Godoy Cruz',
  presupuesto: '100.000 USD',
  canalOrigen: 'telegram',
  temperatura: 'caliente',
  leadCompleto: true,
  estadoSeguimiento: 'enviado_1',
  status: 'abierto',
  tipoOperacion: 'compra',
  ultimaActualizacion: '2026-08-28 18:00:00',
  lastMessage: 'Hola',
  historial: [],
  ...overrides,
});

describe('assistantCatchUp', () => {
  it('detecta mensajes de clientes desde una fecha', () => {
    const leads = [
      baseLead({
        id: 'a',
        nombre: 'Carla',
        historial: [
          {
            id: '1',
            fecha: '2026-08-28 19:00:00',
            mensajeCliente: '¿Sigue disponible?',
            respuestaBot: '',
          },
        ],
      }),
    ];

    const events = collectTimelineEvents(leads);
    expect(events.some((e) => e.side === 'client')).toBe(true);

    const report = buildCatchUpReport(leads, '2026-08-28T18:30:00.000Z');
    expect(report.clientCount).toBe(1);
    expect(report.hasNews).toBe(true);
    expect(catchUpSpeech(report)).toContain('Carla');
  });

  it('informa cuando no hay novedades', () => {
    const report = buildCatchUpReport([], '2026-08-28T20:00:00.000Z');
    expect(report.hasNews).toBe(false);
    expect(catchUpSpeech(report)).toMatch(/no hay nada nuevo/i);
  });
});
