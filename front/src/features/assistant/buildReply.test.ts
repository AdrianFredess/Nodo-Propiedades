import { describe, expect, it } from 'vitest';
import type { Lead } from '../../shared/types/lead';
import { buildReplyFromIntent, leadsToContact } from './buildReply';

const baseLead = (
  overrides: Partial<Lead> & Pick<Lead, 'id' | 'nombre' | 'temperatura'>,
): Lead => ({
  chatId: overrides.id,
  zona: 'Godoy Cruz',
  presupuesto: '100.000 USD',
  canalOrigen: 'telegram',
  leadCompleto: true,
  estadoSeguimiento: 'ninguno',
  status: 'abierto',
  tipoOperacion: 'compra',
  ultimaActualizacion: new Date().toISOString(),
  lastMessage: 'Hola',
  historial: [],
  ...overrides,
});

describe('leadsToContact', () => {
  it('prioriza calientes sin respondido ni cerrado', () => {
    const leads = [
      baseLead({
        id: 'a',
        nombre: 'A',
        temperatura: 'caliente',
        estadoSeguimiento: 'respondido',
      }),
      baseLead({
        id: 'b',
        nombre: 'B',
        temperatura: 'caliente',
        estadoSeguimiento: 'enviado_1',
      }),
      baseLead({ id: 'c', nombre: 'C', temperatura: 'tibio' }),
    ];
    const contact = leadsToContact(leads);
    expect(contact).toHaveLength(1);
    expect(contact[0]?.id).toBe('b');
  });
});

describe('buildReplyFromIntent', () => {
  it('responde con navegación al catálogo', () => {
    const reply = buildReplyFromIntent({ kind: 'navigate', path: '/catalogo' }, []);
    expect(reply.speech).toContain('catálogo');
    expect(reply.actions).toEqual([{ type: 'navigate', path: '/catalogo' }]);
  });

  it('lista a quién contactar', () => {
    const leads = [
      baseLead({
        id: 'b',
        nombre: 'Bruno',
        temperatura: 'caliente',
        estadoSeguimiento: 'enviado_2',
      }),
    ];
    const reply = buildReplyFromIntent({ kind: 'who_to_contact' }, leads);
    expect(reply.speech).toContain('Bruno');
    expect(reply.leads).toHaveLength(1);
  });
});
