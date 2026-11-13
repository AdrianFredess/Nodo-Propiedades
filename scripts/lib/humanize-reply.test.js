'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { humanizeReply } = require('./humanize-reply');

describe('humanizeReply', () => {
  it('saca ¡ y ¿', () => {
    assert.equal(humanizeReply('¡Hola! ¿Buscás para comprar?'), 'Hola! Buscás para comprar?');
  });

  it('protege montos y links', () => {
    const t = humanizeReply('Sale USD 150.000 en https://ejemplo.com/ficha');
    assert.match(t, /USD 150\.000/);
    assert.match(t, /https:\/\/ejemplo\.com\/ficha/);
  });

  it('como mucho un !', () => {
    const t = humanizeReply('¡¡Genial!! Te paso dos opciones!');
    const bangs = (t.match(/!/g) || []).length;
    assert.equal(bangs, 1);
  });

  it('saca frase de bot al inicio', () => {
    assert.equal(humanizeReply('Claro! Tengo dos casas.'), 'Tengo dos casas.');
  });

  it('no deja vacío si solo era la frase', () => {
    assert.equal(humanizeReply('Claro!'), 'Claro!');
  });
});
