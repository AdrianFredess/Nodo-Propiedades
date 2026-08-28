import { describe, expect, it } from 'vitest';
import type { Lead } from '../../shared/types/lead';
import { findLeadByName, parseLocalIntent } from './localIntents';

const leads: Lead[] = [
  {
    id: 'telegram:1',
    chatId: '1',
    nombre: 'Carla Méndez',
    zona: 'Godoy Cruz',
    presupuesto: '95.000 USD',
    canalOrigen: 'telegram',
    temperatura: 'caliente',
    leadCompleto: true,
    estadoSeguimiento: 'enviado_1',
    status: 'abierto',
    tipoOperacion: 'compra',
    ultimaActualizacion: new Date().toISOString(),
    lastMessage: 'Hola',
    historial: [],
  },
  {
    id: 'telegram:2',
    chatId: '2',
    nombre: 'Martín Ríos',
    zona: 'Maipú',
    presupuesto: '180.000 USD',
    canalOrigen: 'telegram',
    temperatura: 'caliente',
    leadCompleto: true,
    estadoSeguimiento: 'ninguno',
    status: 'abierto',
    tipoOperacion: 'compra',
    ultimaActualizacion: new Date().toISOString(),
    lastMessage: 'Hola',
    historial: [],
  },
];

describe('parseLocalIntent', () => {
  it('navega al catálogo', () => {
    expect(parseLocalIntent('mostrá el catálogo', leads)).toEqual({
      kind: 'navigate',
      path: '/catalogo',
    });
  });

  it('navega al pipeline', () => {
    expect(parseLocalIntent('abrí el pipeline', leads)).toEqual({
      kind: 'navigate',
      path: '/pipeline',
    });
  });

  it('resumen de ayer', () => {
    expect(parseLocalIntent('dame un resumen de ayer', leads)).toEqual({
      kind: 'summary_yesterday',
    });
  });

  it('a quién contactar', () => {
    expect(parseLocalIntent('a quién le tengo que hablar', leads)).toEqual({
      kind: 'who_to_contact',
    });
  });

  it('ayuda', () => {
    expect(parseLocalIntent('qué puedo preguntar', leads)).toEqual({
      kind: 'help',
    });
  });

  it('panorama general', () => {
    expect(parseLocalIntent('cómo estamos con los leads', leads)).toEqual({
      kind: 'stats_overview',
    });
  });

  it('actividad telegram', () => {
    expect(parseLocalIntent('qué pasó en telegram', leads)).toEqual({
      kind: 'recent_activity',
    });
  });

  it('abre lead por nombre', () => {
    expect(parseLocalIntent('abrí el lead de Carla', leads)).toEqual({
      kind: 'open_lead',
      leadId: 'telegram:1',
      leadName: 'Carla Méndez',
    });
  });

  it('desconocido', () => {
    expect(parseLocalIntent('haceme un café', leads)).toEqual({
      kind: 'unknown',
      raw: 'haceme un café',
    });
  });
});

describe('findLeadByName', () => {
  it('encuentra por coincidencia parcial', () => {
    expect(findLeadByName('martin', leads)?.nombre).toBe('Martín Ríos');
  });
});
