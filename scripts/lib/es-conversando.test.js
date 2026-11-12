'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { esConversando } = require('./es-conversando');

describe('esConversando', () => {
  it('vacío → conversando', () => {
    assert.equal(esConversando([]), true);
  });
  it('solo hola → conversando', () => {
    assert.equal(esConversando(['hola']), true);
  });
  it('buenos días → conversando', () => {
    assert.equal(esConversando(['Buenos días']), true);
  });
  it('mensaje corto <4 palabras → conversando', () => {
    assert.equal(esConversando(['qué hay']), true);
  });
  it('mensaje con intención → no conversando', () => {
    assert.equal(esConversando(['Busco casa en Chacras hasta 150 mil']), false);
  });
  it('mezcla saludo + intención → no conversando', () => {
    assert.equal(esConversando(['hola', 'Quiero comprar depto en Godoy Cruz']), false);
  });
});
