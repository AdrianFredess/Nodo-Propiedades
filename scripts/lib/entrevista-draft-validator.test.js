'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateEntrevistaDraft } = require('./entrevista-draft-validator');

const VALID = {
  inmobiliaria_nombre: 'Casa Verde Propiedades',
  asesor_nombre: 'Matías',
  tono: 'profesional_cercano',
  zonas: ['Godoy Cruz', 'Maipú'],
  operaciones: ['venta', 'alquiler'],
  guias: [{ tipo: 'preguntar_antes', texto: 'Preguntá zona antes de mandar fichas.' }],
  horario_humano_desde: '09:00',
  horario_humano_hasta: '19:00',
  ejemplo_estilo: 'Buenas, ¿en qué zona estás buscando?',
};

describe('validateEntrevistaDraft', () => {
  it('JSON válido', () => {
    const r = validateEntrevistaDraft(VALID);
    assert.equal(r.ok, true);
    assert.equal(r.draft.inmobiliaria_nombre, 'Casa Verde Propiedades');
  });

  it('campos de más (ignorados)', () => {
    const r = validateEntrevistaDraft({ ...VALID, campo_extra: 'x', descuento: '10%' });
    assert.equal(r.ok, true);
  });

  it('guía de 301 caracteres', () => {
    const r = validateEntrevistaDraft({
      ...VALID,
      guias: [{ tipo: 'estilo', texto: 'x'.repeat(301) }],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('guia_texto_largo'));
  });

  it('tipo inválido', () => {
    const r = validateEntrevistaDraft({
      ...VALID,
      guias: [{ tipo: 'promo', texto: 'oferta' }],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('guia_tipo_invalido'));
  });

  it('JSON roto', () => {
    const r = validateEntrevistaDraft('no-json');
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('json_no_objeto'));
  });
});
